import { Capabilities as VehicleCapabilities, CarBrand, ConnectedDrive, RemoteServices, VehicleStatus } from 'bmw-connected-drive';
import * as geo from 'geolocation-utils';
import { Device } from 'homey';
import * as semver from 'semver';
import { BMWConnectedDrive } from '../app';
import { Capabilities } from '../utils/Capabilities';
import { ConfigurationManager } from '../utils/ConfigurationManager';
import { DeviceData } from '../utils/DeviceData';
import { LocationType } from '../utils/LocationType';
import { Logger } from '../utils/Logger';
import { Settings } from '../utils/Settings';
import { UnitConverter } from '../utils/UnitConverter';
import { nameof } from '../utils/Utils';
import { ConnectedDriver } from './ConnectedDriver';

export class Vehicle extends Device {

    CAPABILITIES_STORE_KEY = "capabilities";

    brand: CarBrand = CarBrand.Bmw;

    logger?: Logger;
    app!: BMWConnectedDrive;
    deviceData!: DeviceData;
    deviceStatusPoller!: NodeJS.Timeout;
    settings: Settings = new Settings();
    currentLocation?: LocationType;
    currentMileage?: number;
    lastUpdatedAt?: Date;
    retryCount: number = 0;
    capabilities?: VehicleCapabilities;

    get api(): ConnectedDrive | undefined {
        return this.app.connectedDriveApi;
    }

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.app = this.homey.app as BMWConnectedDrive;
        this.logger = new Logger(this, () => ConfigurationManager.getConfiguration(this.homey).logLevel);
        this.deviceData = this.getData() as DeviceData;
        this.settings = this.getSettings() as Settings;

        this.capabilities = this.getStoreValue(this.CAPABILITIES_STORE_KEY) as VehicleCapabilities;

        if (!this.capabilities) {
            this.logger?.LogInformation(`Fetching vehicle capabilities for '${this.getName()}'`);
            try {
                this.capabilities = await this.api?.getVehicleCapabilities(this.deviceData.id, this.brand);
                if (this.capabilities) {
                    this.setStoreValue(this.CAPABILITIES_STORE_KEY, this.capabilities);
                }
            } catch (err) {
                this.logger?.LogError(`Failed to get vehicle capabilities for '${this.getName()}': ${err}`);
            }
        }

        await this.migrate_settings();
        await this.migrate_capabilities();

        // register a capability listener
        if (this.hasCapability(Capabilities.LOCKED)) {
            this.registerCapabilityListener(Capabilities.LOCKED, this.onCapabilityLocked.bind(this));
        }
        if (this.hasCapability(Capabilities.CLIMATE_NOW)) {
            this.registerCapabilityListener(Capabilities.CLIMATE_NOW, this.onCapabilityClimateNow.bind(this));
        }
        if (this.hasCapability(Capabilities.CHARGING_CONTROL)) {
            this.registerCapabilityListener(Capabilities.CHARGING_CONTROL, this.onCapabilityChargingControl.bind(this))
        }

        if (this.hasCapability(Capabilities.LOCATION)) {
            const coordinate: string = await this.getCapabilityValue(Capabilities.LOCATION);
            if (coordinate) {
                const splitString = coordinate.split(":");
                if (splitString.length === 2) {
                    this.currentLocation = {
                        latitude: parseFloat(splitString[0]) ?? 0,
                        longitude: parseFloat(splitString[1]) ?? 0,
                        address: await this.getCapabilityValue(Capabilities.ADDRESS)
                    };
                    this.checkGeofence(this.currentLocation);
                    this.app.currentLocation = this.currentLocation;
                }
            }
        }

        await this.setDistanceUnits(this.settings.distanceUnit);
        await this.setFuelUnits(this.settings.fuelUnit);

        await this.updateState();
        this.currentMileage = this.getCapabilityValue(Capabilities.MILEAGE);

        this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);

        this.logger?.LogInformation(`${this.getName()} (${this.deviceData.id}) has been initialized`);
    }

    async migrate_capabilities() {
        await this.removeCapabilitySafe(Capabilities.MEASURE_BATTERY_ACTUAL);
        await this.removeCapabilitySafe(Capabilities.RANGE_FUEL);
        let oldFuelValue = await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL_LITERS_TYPO);
        if (oldFuelValue) {
            await this.updateCapabilityValue(Capabilities.REMAINING_FUEL_LITERS, oldFuelValue);
        }

        let vehicle: VehicleStatus | undefined;
        try {
            vehicle = await this.api!.getVehicleStatus(this.deviceData.id);
        } catch (err) {
            this.logger?.LogError(`Failed to get vehicle status for '${this.getName()}': ${err}`);
            return;
        }

        let hasElectricDriveTrain: boolean = false;
        if (vehicle.electricChargingState?.chargingLevelPercent) {
            this.logger?.LogInformation(`Vehicle '${this.getName()}' has electric drive train.`);
            hasElectricDriveTrain = true;
            await this.addCapabilitySafe(Capabilities.MEASURE_BATTERY);
            await this.addCapabilitySafe(Capabilities.CHARGING_STATUS);
        }
        else {
            await this.removeCapabilitySafe(Capabilities.MEASURE_BATTERY);
            await this.removeCapabilitySafe(Capabilities.RANGE_BATTERY);
            await this.removeCapabilitySafe(Capabilities.CHARGING_STATUS);
        }

        let hasCombustionDriveTrain: boolean = false;
        if (vehicle.combustionFuelLevel?.remainingFuelLiters && vehicle.combustionFuelLevel?.range) {
            this.logger?.LogInformation(`Vehicle '${this.getName()}' has combustion drive train.`);
            hasCombustionDriveTrain = true;
            await this.addCapabilitySafe(Capabilities.REMAINING_FUEL_LITERS);
            await this.addCapabilitySafe(Capabilities.REMAINING_FUEL);
        }
        else {
            await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL_LITERS);
            await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL);
        }

        if (hasElectricDriveTrain && hasCombustionDriveTrain) {
            await this.addCapabilitySafe(Capabilities.RANGE_BATTERY);
        }

        if (semver.gte(this.homey.version, "12.0.0")) {
            if (this.getClass() === "other") {
                this.logger?.LogInformation(`Migrating device class for '${this.getName()}' to 'car'.`);
                await this.setClass("car");
            }
        }

        if (semver.gte(this.homey.version, "12.4.5") && hasElectricDriveTrain) {
            await this.addCapabilitySafe(Capabilities.EV_CHARGING_STATE);

            const energy = this.getEnergy() as any;
            if (!energy?.batteries || energy.batteries[0] !== "INTERNAL" || !energy?.electricCar) {
                this.logger?.LogInformation("Setting energy capabilities for electric car.");
                await this.setEnergy({
                    batteries: ["INTERNAL"],
                    electricCar: true,
                });
            }
        }

        const chargingControlCapability = this.capabilities?.remoteChargingCommands.chargingControl;
        if (chargingControlCapability) {
            let hasChargingControlCapability = false;
            if (chargingControlCapability.find((c: any) => c === RemoteServices.ChargeStart)) {
                await this.addCapabilitySafe(Capabilities.START_CHARGING);
                hasChargingControlCapability = true;
            }
            else
                await this.removeCapabilitySafe(Capabilities.START_CHARGING);

            if (chargingControlCapability.find((c: any) => c === RemoteServices.ChargeStop)) {
                await this.addCapabilitySafe(Capabilities.STOP_CHARGING);
                hasChargingControlCapability = true;
            }
            else
                await this.removeCapabilitySafe(Capabilities.STOP_CHARGING);

            if (hasChargingControlCapability) {
                await this.addCapabilitySafe(Capabilities.CHARGING_CONTROL);
            }
            else
                await this.removeCapabilitySafe(Capabilities.CHARGING_CONTROL);
        }
        else {
            await this.removeCapabilitySafe(Capabilities.START_CHARGING);
            await this.removeCapabilitySafe(Capabilities.STOP_CHARGING);
            await this.removeCapabilitySafe(Capabilities.CHARGING_CONTROL);
        }
    }

    /**
     * Migrate settings to ensure proper functionality after upgrading
     */
    async migrate_settings() {
        const settings = this.settings;
        this.logger?.LogInformation(`Settings version is ${settings.currentVersion}.`);

        if (!settings.currentVersion) {
            settings.currentVersion = "0.0.0";
        }

        await this.migrate_0_6_5(settings);

        settings.currentVersion = this.homey.app.manifest.version;
        await this.setSettings(settings);
    }

    /**
     * Migrate settings from earlier version to 0.6.5
     */
    async migrate_0_6_5(settings: Settings) {
        if (semver.lt(settings.currentVersion, "0.6.5")) {
            this.logger?.LogInformation("Migrating to version 0.6.5");

            // Setting default value for locationUpdateThreshold if not already defined
            if (this.settings.locationUpdateThreshold === undefined) {
                this.settings.locationUpdateThreshold = 50;
                await this.setSettings({
                    locationUpdateThreshold: this.settings.locationUpdateThreshold
                });
            }

            // Migrating currentLocation properties to the new casing
            if (this.currentLocation) {
                var oldLocation: any = this.currentLocation;
                if (oldLocation.Latitude && oldLocation.Longitude) {
                    this.currentLocation = {
                        label: oldLocation.Label,
                        latitude: oldLocation.Latitude,
                        longitude: oldLocation.Longitude,
                        address: oldLocation.Address
                    };
                }
            }
        }
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ newSettings, changedKeys }: { newSettings: any, changedKeys: string[] }): Promise<string | void> {
        this.settings = newSettings;

        if (changedKeys.includes(nameof<Settings>("pollingInterval"))) {
            this.updatePollingInterval();
        }

        let shouldUpdateState = false;

        if (changedKeys.includes(nameof<Settings>("distanceUnit"))) {
            this.app.logger?.LogInformation(`Distance unit changed.`);

            await this.setDistanceUnits(this.settings.distanceUnit);
            shouldUpdateState = true;
        }

        if (changedKeys.includes(nameof<Settings>("fuelUnit"))) {
            this.app.logger?.LogInformation(`Fuel unit changed.`);

            await this.setFuelUnits(this.settings.fuelUnit);
            shouldUpdateState = true;
        }

        if (shouldUpdateState) {
            await this.updateState();
        }
    }

    private updatePollingInterval() {
        if (this.deviceStatusPoller) {
            clearInterval(this.deviceStatusPoller);
        }
        this.app.logger?.LogInformation(`setting polling interval to ${this.settings.pollingInterval} seconds`);
        this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} _name The new name
     */
    async onRenamed(_name: string) {
        this.logger?.LogInformation('Vehicle was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.logger?.LogInformation('Vehicle has been deleted');
        if (this.deviceStatusPoller) {
            clearInterval(this.deviceStatusPoller);
        }
    }

    // this method is called when the Device has requested a state change (turned on or off)
    private async onCapabilityClimateNow(value: boolean) {

        if (this.api) {
            try {
                if (value) {
                    this.logger?.LogInformation("Starting climate control.");
                    await this.api.startClimateControl(this.deviceData.id, this.brand, true);
                } else {
                    await this.api.stopClimateControl(this.deviceData.id, this.brand, true);
                }
            } catch (err) {
                this.logger?.LogError(err);
            }
        } else {
            throw new Error("API is not available.");
        }
    }

    // this method is called when the Device has requested a state change (turned on or off)
    private async onCapabilityChargingControl(value: boolean) {

        if (this.api) {
            try {
                if (value) {
                    this.logger?.LogInformation("Start charging.");
                    await this.api.startCharging(this.deviceData.id, this.brand, true);
                } else {
                    await this.api.stopCharging(this.deviceData.id, this.brand, true);
                }
            } catch (err) {
                this.logger?.LogError(err);
            }
        } else {
            throw new Error("API is not available.");
        }
    }

    // this method is called when the Device has requested a state change (turned on or off)
    private async onCapabilityLocked(value: boolean) {
        if (this.api) {
            try {
                if (value) {
                    await this.api.lockDoors(this.deviceData.id, this.brand, true);
                } else {
                    await this.api.unlockDoors(this.deviceData.id, this.brand, true);
                }
            } catch (err) {
                this.logger?.LogError(err);
            }
        } else {
            throw new Error("API is not available.");
        }
    }

    private async checkGeofence(location: LocationType) {
        const configuration = ConfigurationManager.getConfiguration(this.homey);
        if (configuration?.geofences) {
            this.logger?.LogInformation("Checking geofences.")
            // Checking if the position is inside a geofence.
            const position = configuration.geofences.find(fence => fence?.longitude && fence?.longitude && geo.insideCircle(location, fence, fence.radius ?? 20));
            if (position) {
                this.logger?.LogInformation(`Inside geofence '${position.label}'.`)
                location.label = position.label;
                return;
            }
        }

        location.label = "";
    }

    private async onLocationChanged(newLocation: LocationType) {
        this.logger?.LogInformation("Location changed.")

        this.checkGeofence(newLocation);

        const oldMileage = this.currentMileage;
        const oldLocation = this.currentLocation;
        this.currentLocation = newLocation;
        this.currentMileage = this.getCapabilityValue(Capabilities.MILEAGE);
        await this.updateCapabilityValue(Capabilities.LOCATION, `${newLocation.latitude}:${newLocation.longitude}`);
        await this.updateCapabilityValue(Capabilities.ADDRESS, newLocation.address);
        const locationChangedFlowCard: any = this.homey.flow.getDeviceTriggerCard("location_changed");
        locationChangedFlowCard.trigger(this, newLocation, {});

        if (oldLocation?.label !== newLocation.label) {
            this.logger?.LogInformation(`Geofence changed. Old Location: [${oldLocation?.label}]. New Location: [${newLocation.label}]`)
            if (newLocation?.label) {
                this.logger?.LogInformation("Entered geofence.")
                const geoFenceEnter: any = this.homey.flow.getDeviceTriggerCard("geo_fence_enter");
                geoFenceEnter.trigger(this, newLocation, {});
            }
            if (oldLocation?.label) {
                this.logger?.LogInformation("Exit geofence.")
                const geoFenceExit: any = this.homey.flow.getDeviceTriggerCard("geo_fence_exit");
                geoFenceExit.trigger(this, oldLocation, {});
            }
        }

        this.app.currentLocation = newLocation;

        // Currently onLocationChanged is only triggered if location changed and the door is locked.
        const driveSessionCompletedFlowCard: any = this.homey.flow.getDeviceTriggerCard("drive_session_completed");
        driveSessionCompletedFlowCard.trigger(this, {
            StartLabel: oldLocation?.label ?? "",
            StartLatitude: oldLocation?.latitude ?? 0,
            StartLongitude: oldLocation?.longitude ?? 0,
            StartAddress: oldLocation?.address ?? "",
            StartMileage: oldMileage ?? 0,
            EndLabel: newLocation?.label ?? "",
            EndLatitude: newLocation?.latitude ?? 0,
            EndLongitude: newLocation?.longitude ?? 0,
            EndAddress: newLocation?.address ?? "",
            EndMileage: this.currentMileage ?? 0
        }, {});
    }

    private async updateState() {
        try {
            this.logger?.LogInformation(`Polling BMW ConnectedDrive for vehicle status updates for '${this.getName()}'.`);

            if (!this.getAvailable() && !this.settings.autoRetry) {
                this.logger?.LogInformation(`Device '${this.getName()}' is unavailable. Skipping update.`);
                return;
            }

            this.retryCount++;

            if (this.api) {
                const vehicle = await this.api.getVehicleStatus(this.deviceData.id);

                this.retryCount = 0;
                if (!this.getAvailable()) {
                    this.logger?.LogInformation(`Device '${this.getName()}' is now available.`);
                    await this.setAvailable();
                }

                // Skip updating capability values if the vehicle status has not changed.
                if (this.lastUpdatedAt && vehicle.lastUpdatedAt <= this.lastUpdatedAt) {
                    return;
                }

                this.lastUpdatedAt = vehicle.lastUpdatedAt;

                let oldFuelValue = this.hasCapability(Capabilities.REMAINING_FUEL_LITERS) ?
                    await this.getCapabilityValue(Capabilities.REMAINING_FUEL_LITERS)
                    : undefined;
                await this.updateCapabilityValue(Capabilities.MILEAGE, UnitConverter.ConvertDistance(vehicle.currentMileage, this.settings.distanceUnit));
                await this.updateCapabilityValue(Capabilities.RANGE, UnitConverter.ConvertDistance(vehicle.range, this.settings.distanceUnit));

                await this.updateCapabilityValue(Capabilities.REMAINING_FUEL_LITERS, vehicle.combustionFuelLevel.remainingFuelLiters);
                await this.updateCapabilityValue(Capabilities.REMAINING_FUEL, UnitConverter.ConvertFuel(vehicle.combustionFuelLevel.remainingFuelLiters, this.settings.fuelUnit));

                const secured: boolean = vehicle.doorsState.combinedSecurityState === "SECURED" || vehicle.doorsState.combinedSecurityState === "LOCKED";
                await this.updateCapabilityValue(Capabilities.ALARM_GENERIC, !secured);

                let triggerChargingStatusChange = false;
                if (this.hasCapability(Capabilities.MEASURE_BATTERY)) {
                    await this.updateCapabilityValue(Capabilities.MEASURE_BATTERY, vehicle.electricChargingState.chargingLevelPercent);
                    await this.updateCapabilityValue(Capabilities.RANGE_BATTERY, UnitConverter.ConvertDistance(vehicle.electricChargingState.range, this.settings.distanceUnit));
                    const oldChargingStatus = this.getCapabilityValue(Capabilities.CHARGING_STATUS);
                    await this.updateCapabilityValue(Capabilities.CHARGING_STATUS, vehicle.electricChargingState.chargingStatus);
                    if (oldChargingStatus !== vehicle.electricChargingState.chargingStatus) {
                        triggerChargingStatusChange = true;
                    }
                    await this.updateCapabilityValue(Capabilities.EV_CHARGING_STATE, this.convertChargingStatus(vehicle.electricChargingState.chargingStatus));
                }

                if (this.hasCapability(Capabilities.LOCKED)) {
                    await this.setCapabilityValue(Capabilities.LOCKED, vehicle.doorsState.combinedSecurityState === "LOCKED"
                        || vehicle.doorsState.combinedSecurityState === "SECURED");
                }

                let triggerClimateStatusChange = false;
                const newClimateStatus = vehicle.climateControlState?.activity !== "INACTIVE";
                if (vehicle.climateControlState?.activity) {
                    const oldClimateStatus = this.getCapabilityValue(Capabilities.CLIMATE_NOW);
                    await this.updateCapabilityValue(Capabilities.CLIMATE_NOW, newClimateStatus);
                    if (oldClimateStatus !== newClimateStatus) {
                        triggerClimateStatusChange = true;
                    }
                }

                // Trigger location changed when the vehicle is locked and the location has changed by a minimum threshold
                if (secured && vehicle.location.coordinates.latitude && vehicle.location.coordinates.longitude) {
                    if (this.currentLocation == undefined || geo.distanceTo(vehicle.location.coordinates, this.currentLocation) > this.settings.locationUpdateThreshold) {
                        this.onLocationChanged({ label: "", latitude: vehicle.location.coordinates.latitude, longitude: vehicle.location.coordinates.longitude, address: vehicle.location.address.formatted });
                    }
                }

                if (triggerChargingStatusChange) {
                    const chargingStatusFlowCard: any = this.homey.flow.getDeviceTriggerCard("charging_status_change");
                    chargingStatusFlowCard.trigger(this, { charging_status: vehicle.electricChargingState.chargingStatus }, {});

                    const is_charging = vehicle.electricChargingState.chargingStatus.toUpperCase() === "CHARGING";
                    if (this.hasCapability(Capabilities.CHARGING_CONTROL)) {
                        await this.updateCapabilityValue(Capabilities.CHARGING_CONTROL, is_charging);
                    }
                }

                if (triggerClimateStatusChange) {
                    let climateStatusFlowCard: any;
                    if (newClimateStatus) {
                        climateStatusFlowCard = this.homey.flow.getDeviceTriggerCard("climate_now_started");
                    } else {
                        climateStatusFlowCard = this.homey.flow.getDeviceTriggerCard("climate_now_stopped");
                    }
                    climateStatusFlowCard.trigger(this, {}, {});
                }

                if (oldFuelValue && vehicle.combustionFuelLevel.remainingFuelLiters && (vehicle.combustionFuelLevel.remainingFuelLiters - oldFuelValue) >= this.settings.refuellingTriggerThreshold) {
                    const refuelledFlowCard: any = this.homey.flow.getDeviceTriggerCard("refuelled");
                    refuelledFlowCard.trigger(this, {
                        FuelBeforeRefuelling: oldFuelValue,
                        FuelAfterRefuelling: vehicle.combustionFuelLevel.remainingFuelLiters,
                        RefuelledLiters: vehicle.combustionFuelLevel.remainingFuelLiters - oldFuelValue,
                        Location: vehicle.location?.address?.formatted
                    }, {});
                }
            }
            else {
                this.logger?.LogError("API is not available. Cannot update vehicle state.");
                if (this.getAvailable()) {
                    this.logger?.LogInformation(`Device '${this.getName()}' is now unavailable.`);
                    await this.setUnavailable("API is not available.");
                }
                return;
            }
        } catch (err) {
            if (this.settings.pollingInterval < 300) {
                this.logger?.LogInformation(`Polling interval is too low (${this.settings.pollingInterval} seconds). Setting to 5 minutes.`);
                await this.setSettings({
                    pollingInterval: 300
                });
                this.settings = this.getSettings() as Settings;
                this.updatePollingInterval();
            }
            
            this.logger?.LogError(err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (this.settings.autoRetry || this.retryCount > 5) {
                // If autoRetry is enabled we can set it to unavailable as it will retry again,
                // Or retry count exceeds 5, set the device as unavailable
                await this.setUnavailable(`Error occurred while attempting to update device state: ${errorMessage}`);
                return;
            }
        }
    }

    private async addCapabilitySafe(name: string): Promise<void> {
        if (!this.hasCapability(name)) {
            this.logger?.LogInformation(`Adding capability ${name} to device '${this.getName()}'`);
            await this.addCapability(name);
        }
    }

    private async updateCapabilityValue(name: string, value: any): Promise<boolean> {
        if (value || value === 0 || value === false) {
            await this.addCapabilitySafe(name);

            await this.setCapabilityValue(name, value);
            return true;
        }

        return false;
    }

    private async removeCapabilitySafe(name: string): Promise<any> {
        if (this.hasCapability(name)) {
            this.logger?.LogInformation(`Removing capability ${name} from device '${this.getName()}'`);
            let oldValue = await this.getCapabilityValue(name)
            await this.removeCapability(name);
            return oldValue;
        }

        return undefined;
    }

    private async setDistanceUnits(distanceUnit: string) {
        this.logger?.LogInformation(`Setting distance unit to ${distanceUnit}`);

        await this.setCapabilityOptions(Capabilities.MILEAGE, { "units": distanceUnit === "metric" ? "km" : "miles" });
        await this.setCapabilityOptions(Capabilities.RANGE, { "units": distanceUnit === "metric" ? "km" : "miles" });
        if (this.hasCapability(Capabilities.MEASURE_BATTERY)) {
            await this.setCapabilityOptions(Capabilities.RANGE_BATTERY, { "units": distanceUnit === "metric" ? "km" : "miles" });
            await this.setCapabilityOptions(Capabilities.RANGE_FUEL, { "units": distanceUnit === "metric" ? "km" : "miles" });
        }
    }

    private async setFuelUnits(fuelUnit: string) {
        this.logger?.LogInformation(`Setting fuel unit to ${fuelUnit}`);

        await this.setCapabilityOptions(Capabilities.REMAINING_FUEL, { "units": fuelUnit === "liter" ? "l" : "gal" });
    }

    private convertChargingStatus(chargingStatus: string): string {
        // DEFAULT = "DEFAULT"
        // ERROR = "ERROR"
        // UNKNOWN = "UNKNOWN"

        switch (chargingStatus) {
            case "CHARGING":
                return "plugged_in_charging";
            case "COMPLETE":
            case "FULLY_CHARGED":
            case "FINISHED_FULLY_CHARGED":
            case "FINISHED_NOT_FULL":
            case "NOT_CHARGING":
            case "PLUGGED_IN":
            case "WAITING_FOR_CHARGING":
            case "TARGET_REACHED":
                return "plugged_in";
            case "INVALID":
            default:
                return "plugged_out";
        }
    }
}
