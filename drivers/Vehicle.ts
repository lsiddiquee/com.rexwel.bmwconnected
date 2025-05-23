import { CarBrand, ConnectedDrive } from 'bmw-connected-drive';
import * as geo from 'geolocation-utils';
import { Device } from 'homey';
import * as semver from 'semver';
import { BMWConnectedDrive } from '../app';
import { Configuration } from '../utils/Configuration';
import { ConfigurationManager } from '../utils/ConfigurationManager';
import { DeviceData } from '../utils/DeviceData';
import { LocationType } from '../utils/LocationType';
import { Logger } from '../utils/Logger';
import { Settings } from '../utils/Settings';
import { UnitConverter } from '../utils/UnitConverter';
import { nameof } from '../utils/Utils';

export class Vehicle extends Device {

    logger?: Logger;
    app!: BMWConnectedDrive;
    deviceData!: DeviceData;
    deviceStatusPoller!: NodeJS.Timeout;
    settings: Settings = new Settings();
    currentLocation?: LocationType;
    currentMileage?: number;
    lastUpdatedAt?: Date;
    retryCount: number = 0;

    get api(): ConnectedDrive | undefined {
        return this.app.connectedDriveApi;
    }

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.app = this.homey.app as BMWConnectedDrive;
        this.logger = this.app.logger;
        this.deviceData = this.getData() as DeviceData;
        this.settings = this.getSettings() as Settings;

        await this.migrate();

        await this.CleanupCapability("measure_battery.actual");
        if (this.hasCapability("remanining_fuel_liters_capability")) {
            let oldFuelValue = await this.CleanupCapability("remanining_fuel_liters_capability");
            await this.UpdateCapabilityValue("remaining_fuel_liters_capability", oldFuelValue);
        }

        // register a capability listener
        if (this.hasCapability("locked")) {
            this.registerCapabilityListener("locked", this.onCapabilityLocked.bind(this));
        }
        if (this.hasCapability("climate_now_capability")) {
            this.registerCapabilityListener("climate_now_capability", this.onCapabilityClimateNow.bind(this));
        }

        if (this.hasCapability("location_capability")) {
            const coordinate: string = await this.getCapabilityValue("location_capability");
            if (coordinate) {
                const splitString = coordinate.split(":");
                if (splitString.length === 2) {
                    this.currentLocation = {
                        latitude: parseFloat(splitString[0]) ?? 0,
                        longitude: parseFloat(splitString[1]) ?? 0,
                        address: await this.getCapabilityValue("address_capability")
                    };
                    this.checkGeofence(this.currentLocation);
                    this.app.currentLocation = this.currentLocation;
                }
            }
        }

        await this.setDistanceUnits(this.settings.distanceUnit);
        //await this.setFuelUnits(this.settings.fuelUnit);

        await this.updateState();
        this.currentMileage = this.getCapabilityValue("mileage_capability");

        this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);

        this.logger?.LogInformation(`${this.getName()} (${this.deviceData.id}) has been initialized`);
    }

    /**
     * Perform migrations to ensure proper functionality after upgrading
     */
    async migrate() {
        const configuration = ConfigurationManager.getConfiguration(this.homey);

        if (!configuration.currentVersion) {
            configuration.currentVersion = "0.0.0";
        }

        await this.migrate_0_6_5(configuration);
        await this.migrate_0_6_6(configuration);

        configuration.currentVersion = this.homey.app.manifest.version;
        ConfigurationManager.setConfiguration(this.homey, configuration);
    }

    /**
     * Migrate configuration from earlier version to 0.6.5
     */
    async migrate_0_6_5(configuration: Configuration) {
        if (semver.lt(configuration.currentVersion, "0.6.5")) {
            this.logger?.LogInformation("Migrating to version 0.6.5");

            // Setting default value for locationUpdateThreshold if not already defined
            if (this.settings.locationUpdateThreshold === undefined) {
                this.settings.locationUpdateThreshold = 50;
                await this.setSettings(this.settings);
            }

            // Migrating currentLocation properties to the new casing
            if (this.currentLocation) {
                var oldLocation: any = this.currentLocation;
                this.currentLocation = {
                    label: oldLocation.Label,
                    latitude: oldLocation.Latitude,
                    longitude: oldLocation.Longitude,
                    address: oldLocation.Address
                };
            }

            // Migrating geofences properties to the new casing
            if (configuration.geofences) {
                configuration.geofences = (configuration.geofences as any[]).map(fence => {
                    return {
                        label: fence.Label,
                        latitude: fence.Latitude,
                        longitude: fence.Longitude,
                        address: fence.Address,
                        radius: fence.Radius
                    };
                });
            }
        }
    }

    /**
     * Migrate configuration from earlier version to 0.6.6
     */
    async migrate_0_6_6(configuration: Configuration) {
        if (semver.lt(configuration.currentVersion, "0.6.6")) {
            this.logger?.LogInformation("Migrating to version 0.6.6");

            // Removing username, password and captcha from the configuration
            // as they are no longer persisted in the application.
            delete (configuration as any).username;
            delete (configuration as any).password;
            delete (configuration as any).captcha;
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
            if (this.deviceStatusPoller) {
                clearInterval(this.deviceStatusPoller);
            }
            this.app.logger?.LogInformation(`setting polling interval to ${this.settings.pollingInterval} seconds`);
            this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);
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
                    await this.api.startClimateControl(this.deviceData.id);
                } else {
                    await this.api.stopClimateControl(this.deviceData.id);
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
                    await this.api.lockDoors(this.deviceData.id, CarBrand.Mini, true);
                } else {
                    await this.api.unlockDoors(this.deviceData.id, CarBrand.Mini, true);
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
        this.currentMileage = this.getCapabilityValue("mileage_capability");
        await this.UpdateCapabilityValue("location_capability", `${newLocation.latitude}:${newLocation.longitude}`);
        await this.UpdateCapabilityValue("address_capability", newLocation.address);
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
            this.logger?.LogInformation(`Polling BMW ConnectedDrive for vehicle status updates for ${this.getName()}.`);

            if (!this.getAvailable()) {
                this.logger?.LogInformation(`Device '${this.getName()}' is unavailable. Skipping update.`);
                return;
            }

            this.retryCount++;

            if (this.api) {
                const vehicle = await this.api.getVehicleStatus(this.deviceData.id);

                // Skip updating capability values if the vehicle status has not changed.
                if (this.lastUpdatedAt && vehicle.lastUpdatedAt <= this.lastUpdatedAt) {
                    return;
                }

                this.lastUpdatedAt = vehicle.lastUpdatedAt;

                let oldFuelValue = this.hasCapability("remaining_fuel_liters_capability") ?
                    await this.getCapabilityValue("remaining_fuel_liters_capability")
                    : undefined;
                await this.UpdateCapabilityValue("mileage_capability", UnitConverter.ConvertDistance(vehicle.currentMileage, this.settings.distanceUnit));
                await this.UpdateCapabilityValue("range_capability", UnitConverter.ConvertDistance(vehicle.range, this.settings.distanceUnit));

                await this.UpdateCapabilityValue("remaining_fuel_liters_capability", vehicle.combustionFuelLevel.remainingFuelLiters);
                await this.UpdateCapabilityValue("remaining_fuel_capability", UnitConverter.ConvertFuel(vehicle.combustionFuelLevel.remainingFuelLiters, this.settings.fuelUnit));

                const secured: boolean = vehicle.doorsState.combinedSecurityState === "SECURED" || vehicle.doorsState.combinedSecurityState === "LOCKED";
                await this.UpdateCapabilityValue("alarm_generic", !secured);

                let triggerChargingStatusChange = false;
                if (this.hasCapability("measure_battery")) {
                    await this.UpdateCapabilityValue("measure_battery", vehicle.electricChargingState.chargingLevelPercent);
                    await this.UpdateCapabilityValue("range_capability.battery", UnitConverter.ConvertDistance(vehicle.electricChargingState.range, this.settings.distanceUnit));
                    await this.UpdateCapabilityValue("range_capability.fuel", UnitConverter.ConvertDistance(vehicle.combustionFuelLevel.range, this.settings.distanceUnit));
                    const oldChargingStatus = this.getCapabilityValue("charging_status_capability");
                    await this.UpdateCapabilityValue("charging_status_capability", vehicle.electricChargingState.chargingStatus);
                    if (oldChargingStatus !== vehicle.electricChargingState.chargingStatus) {
                        triggerChargingStatusChange = true;
                    }
                }

                if (this.hasCapability("locked")) {
                    await this.setCapabilityValue("locked", vehicle.doorsState.combinedSecurityState === "LOCKED"
                        || vehicle.doorsState.combinedSecurityState === "SECURED");
                }

                let triggerClimateStatusChange = false;
                const newClimateStatus = vehicle.climateControlState?.activity !== "INACTIVE";
                if (vehicle.climateControlState?.activity) {
                    const oldClimateStatus = this.getCapabilityValue("climate_now_capability");
                    await this.UpdateCapabilityValue("climate_now_capability", newClimateStatus);
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
            this.retryCount = 0;
        } catch (err) {
            if (this.retryCount > 3) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                await this.setUnavailable(errorMessage);
            }
            this.log("Error occurred while attempting to update device state.", err);
            this.logger?.LogError(err);
        }
    }

    private async UpdateCapabilityValue(name: string, value: any): Promise<boolean> {
        if (value || value === 0 || value === false) {
            if (!this.hasCapability(name)) {
                await this.addCapability(name);
            }
            await this.setCapabilityValue(name, value);
            return true;
        }

        return false;
    }

    private async CleanupCapability(name: string): Promise<any> {
        if (this.hasCapability(name)) {
            let oldValue = await this.getCapabilityValue(name)
            await this.removeCapability(name);
            return oldValue;
        }

        return undefined;
    }

    private async setDistanceUnits(distanceUnit: string) {
        this.logger?.LogInformation(`Setting distance unit to ${distanceUnit}`);

        await this.setCapabilityOptions("mileage_capability", { "units": distanceUnit === "metric" ? "km" : "miles" });
        await this.setCapabilityOptions("range_capability", { "units": distanceUnit === "metric" ? "km" : "miles" });
        if (this.hasCapability("measure_battery")) {
            await this.setCapabilityOptions("range_capability.battery", { "units": distanceUnit === "metric" ? "km" : "miles" });
            await this.setCapabilityOptions("range_capability.fuel", { "units": distanceUnit === "metric" ? "km" : "miles" });
        }
    }

    private async setFuelUnits(fuelUnit: string) {
        this.logger?.LogInformation(`Setting fuel unit to ${fuelUnit}`);

        await this.setCapabilityOptions("remaining_fuel_capability", { "units": fuelUnit === "liter" ? "l" : "gal" });
    }
}
