import {Device} from 'homey';
import {BMWConnectedDrive} from '../../app';
import {DeviceData} from '../../utils/DeviceData';
import {ConnectedDrive} from 'bmw-connected-drive';
import {GeoLocation} from '../../utils/GeoLocation';
import {Settings} from '../../utils/Settings';
import {Logger} from '../../utils/Logger';
import {nameof} from '../../utils/Utils';
import {LocationType} from '../../utils/LocationType';
import {ConfigurationManager} from '../../utils/ConfigurationManager';

class Vehicle extends Device {

    logger?: Logger;
    app!: BMWConnectedDrive;
    deviceData!: DeviceData;
    deviceStatusPoller!: NodeJS.Timeout;
    settings: Settings = new Settings();
    currentLocation?: LocationType;
    currentMileage?: number;

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
                        Latitude: parseFloat(splitString[0]) ?? 0,
                        Longitude: parseFloat(splitString[1]) ?? 0,
                        Address: await this.getCapabilityValue("address_capability")
                    };
                }
            }
        }

        await this.updateState();
        this.currentMileage = this.getCapabilityValue("mileage_capability");
        this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);

        this.logger?.LogInformation(`${this.getName()} (${this.deviceData.id}) has been initialized`);
    }

    // this method is called when the Device has requested a state change (turned on or off)
    async onCapabilityClimateNow(value: boolean) {

        if (this.api) {
            if (value) {
                this.logger?.LogInformation("Starting climate control.");
                await this.api.startClimateControl(this.deviceData.id);
            } else {
                await this.api.stopClimateControl(this.deviceData.id);
            }
        } else {
            throw new Error("API is not available.");
        }
    }

    // this method is called when the Device has requested a state change (turned on or off)
    async onCapabilityLocked(value: boolean) {

        if (this.api) {
            if (value) {
                await this.api.lockDoors(this.deviceData.id, true);
            } else {
                await this.api.unlockDoors(this.deviceData.id, true);
            }
        } else {
            throw new Error("API is not available.");
        }
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.logger?.LogInformation('Vehicle has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({newSettings, changedKeys}: { newSettings: any, changedKeys: string[] }): Promise<string | void> {
        this.settings = newSettings;
        if (changedKeys.includes(nameof<Settings>("pollingInterval"))) {
            if (this.deviceStatusPoller) {
                clearInterval(this.deviceStatusPoller);
            }
            this.app.logger?.LogInformation(`setting polling interval to ${this.settings.pollingInterval} seconds`);
            this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);
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

    async onLocationChanged(newLocation: LocationType) {
        this.logger?.LogInformation("Location changed.")

        const configuration = ConfigurationManager.getConfiguration(this.homey);
        if (configuration?.geofences) {
            this.logger?.LogInformation("Checking geofences.")
            // Checking if the position is inside a geofence.
            const position = configuration.geofences.find(fence => GeoLocation.IsInsideGeofence(newLocation, fence));
            if (position) {
                this.logger?.LogInformation(`Geofences triggered '${position.Label}'.`)
                // Hit on a geofence.
                newLocation.Label = position.Label;
            }
        }

        const oldMileage = this.currentMileage;
        const oldLocation = this.currentLocation;
        this.currentLocation = newLocation;
        this.currentMileage = this.getCapabilityValue("mileage_capability");
        await this.UpdateCapabilityValue("location_capability", `${newLocation.Latitude}:${newLocation.Longitude}`);
        await this.UpdateCapabilityValue("address_capability", newLocation.Address);
        const locationChangedFlowCard: any = this.homey.flow.getDeviceTriggerCard("location_changed");
        locationChangedFlowCard.trigger(this, newLocation, {});
        
        // Currently onLocationChanged is only triggered if location changed and the door is locked.
        const driveSessionCompletedFlowCard: any = this.homey.flow.getDeviceTriggerCard("drive_session_completed");
        driveSessionCompletedFlowCard.trigger(this, {
            StartLabel: oldLocation?.Label ?? "",
            StartLatitude: oldLocation?.Latitude ?? 0,
            StartLongitude: oldLocation?.Longitude ?? 0,
            StartAddress: oldLocation?.Address ?? "",
            StartMileage: oldMileage ?? 0,
            EndLabel: newLocation?.Label ?? "",
            EndLatitude: newLocation?.Latitude ?? 0,
            EndLongitude: newLocation?.Longitude ?? 0,
            EndAddress: newLocation?.Address ?? "",
            EndMileage: this.currentMileage ?? 0
        }, {});
    }

    async updateState() {
        try {
            this.logger?.LogInformation(`Polling BMW ConnectedDrive for vehicle status updates for ${this.getName()}.`);
            if (this.api) {
                const vehicle = await this.api.getVehicleStatus(this.deviceData.id);

                let oldFuelValue = this.hasCapability("remanining_fuel_liters_capability") ?
                    await this.getCapabilityValue("remanining_fuel_liters_capability")
                    : undefined;
                await this.UpdateCapabilityValue("mileage_capability", vehicle.status.currentMileage.mileage);
                await this.setCapabilityOptions("mileage_capability", {"units": vehicle.status.currentMileage.units});
                await this.UpdateCapabilityValue("remanining_fuel_liters_capability", vehicle.properties.fuelLevel.value);
                await this.UpdateCapabilityValue("range_capability", vehicle.properties.combinedRange.distance.value);
                await this.setCapabilityOptions("range_capability", {"units": vehicle.properties.combinedRange.distance.units});
                if (this.hasCapability("alarm_generic")) {
                    await this.setCapabilityValue("alarm_generic", !vehicle.properties.areDoorsLocked);
                }

                let triggerChargingStatusChange = false;
                if (this.hasCapability("measure_battery")) {
                    await this.UpdateCapabilityValue("measure_battery", vehicle.properties.chargingState.chargePercentage);
                    await this.UpdateCapabilityValue("measure_battery.actual", vehicle.properties.chargingState.chargePercentage);
                    await this.UpdateCapabilityValue("range_capability.battery", vehicle.properties.electricRange.distance.value);
                    await this.setCapabilityOptions("range_capability.battery", {"units": vehicle.properties.electricRange.distance.units});
                    await this.UpdateCapabilityValue("range_capability.fuel", vehicle.properties.combustionRange.distance.value);
                    await this.setCapabilityOptions("range_capability.fuel", {"units": vehicle.properties.combustionRange.distance.units});
                    const oldChargingStatus = this.getCapabilityValue("charging_status_capability");
                    await this.UpdateCapabilityValue("charging_status_capability", vehicle.properties.chargingState.state);
                    if (oldChargingStatus !== vehicle.properties.chargingState.state) {
                        triggerChargingStatusChange = true;
                    }
                }

                if (this.hasCapability("locked")) {
                    await this.setCapabilityValue("locked", vehicle.properties.areDoorsLocked);

                }

                if (this.hasCapability("climate_now_capability")) {
                    await this.setCapabilityValue("climate_now_capability", vehicle.properties.climateControl.activity !== "INACTIVE");
                }

                if (!vehicle.properties.inMotion && vehicle.properties.vehicleLocation.coordinates.latitude && vehicle.properties.vehicleLocation.coordinates.longitude) {
                    if (this.currentLocation?.Latitude !== vehicle.properties.vehicleLocation.coordinates.latitude || this.currentLocation?.Longitude !== vehicle.properties.vehicleLocation.coordinates.longitude) {
                        this.onLocationChanged({Label: "", Latitude: vehicle.properties.vehicleLocation.coordinates.latitude, Longitude: vehicle.properties.vehicleLocation.coordinates.longitude, Address: vehicle.properties.vehicleLocation.address.formatted});
                    }
                }

                if (triggerChargingStatusChange) {
                    const chargingStatusFlowCard: any = this.homey.flow.getDeviceTriggerCard("charging_status_change");
                    chargingStatusFlowCard.trigger(this, {charging_status: vehicle.properties.chargingState.state}, {});
                }
                
                if (oldFuelValue && vehicle.properties.fuelLevel.value && (vehicle.properties.fuelLevel.value - oldFuelValue) >= this.settings.refuellingTriggerThreshold){
                    const refuelledFlowCard: any = this.homey.flow.getDeviceTriggerCard("refuelled");
                    refuelledFlowCard.trigger(this, {
                        FuelBeforeRefuelling: oldFuelValue,
                        FuelAfterRefuelling: vehicle.properties.fuelLevel.value,
                        RefuelledLiters: vehicle.properties.fuelLevel.value - oldFuelValue,
                        Location: vehicle.properties?.vehicleLocation?.address?.formatted
                    }, {});
                }
            }
        } catch (error) {
            this.log("Error occurred while attempting to update device state.", error);
        }
    }

    async UpdateCapabilityValue(name: string, value: any): Promise<boolean> {
        if (value || value === 0 || value === false) {
            if (!this.hasCapability(name)) {
                await this.addCapability(name);
            }
            await this.setCapabilityValue(name, value);
            return true;
        }

        return false;
    }
}

module.exports = Vehicle;
