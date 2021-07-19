import { Device } from 'homey';
import { BMWConnectedDrive } from '../../app';
import { DeviceData } from '../../utils/DeviceData';
import { ConnectedDrive, VehicleStatus } from 'bmw-connected-drive';
import { GeoLocation } from '../../utils/GeoLocation';
import { Settings } from '../../utils/Settings';
import { ConfigurationManager } from '../../utils/ConfigurationManager';
import { Logger } from '../../utils/Logger';
import { nameof } from '../../utils/Utils';
import { LocationTrigger } from '../../utils/LocationTrigger';

type location = { latitude: number, longitude: number, address?: string };
class Vehicle extends Device {

  logger?: Logger;
  app!: BMWConnectedDrive;
  deviceData!: DeviceData;
  deviceStatusPoller!: NodeJS.Timeout;
  settings: Settings = new Settings();
  currentLocation?: location;

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
      const coordinate: string = this.getCapabilityValue("location_capability");
      if (coordinate) {
        const splitString = coordinate.split(":");
        if (splitString.length === 2) {
          this.currentLocation = { latitude: parseFloat(splitString[0]) ?? 0, longitude: parseFloat(splitString[1]) ?? 0, address: "" }; // TODO: Update address during init.
          this.currentLocation.address = await GeoLocation.GetAddress(this.currentLocation.latitude, this.currentLocation.longitude, this.app.logger);
        }
      }
    }

    await this.updateState();
    this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.settings.pollingInterval * 1000);

    this.logger?.LogInformation(`${this.getName()} (${this.deviceData.id}) has been initialized`);
  }

  // this method is called when the Device has requested a state change (turned on or off)
  async onCapabilityClimateNow(value: boolean) {

    if (this.api) {
      if (value) {
        this.log("Starting climate control.");
        await this.api.startClimateControl(this.deviceData.id);
      } else {
        await this.api.stopClimateControl(this.deviceData.id);
      }
    }
    else {
      throw new Error("API is not available.");
    }
  }

  // this method is called when the Device has requested a state change (turned on or off)
  async onCapabilityLocked(value: boolean) {

    if (this.api) {
      if (value) {
        await this.api.lockDoors(this.deviceData.id, true);
      }
      else {
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
    this.log('Vehicle has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
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
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} _name The new name
   */
  async onRenamed(_name: string) {
    this.log('Vehicle was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Vehicle has been deleted');
    if (this.deviceStatusPoller) {
      clearInterval(this.deviceStatusPoller);
    }
  }

  async updateLocation(vehicle: VehicleStatus) {
    if (vehicle.gpsLat && vehicle.gpsLng) {
      if (!this.hasCapability("location_capability")) {
        await this.addCapability("location_capability");
      }
      if (this.currentLocation?.latitude !== vehicle.gpsLat || this.currentLocation?.longitude !== vehicle.gpsLng) {
        this.onLocationChanged({ latitude: vehicle.gpsLat, longitude: vehicle.gpsLng });
      }
    }
  }

  async onLocationChanged(newLocation: location) {
    this.currentLocation = newLocation;
    this.setCapabilityValue("location_capability", `${this.currentLocation.latitude}:${this.currentLocation.longitude}`);
    this.currentLocation.address = await GeoLocation.GetAddress(this.currentLocation.latitude, this.currentLocation.longitude, this.app.logger);
    const locationChangedFlowCard: any = this.homey.flow.getDeviceTriggerCard("location_changed");
    locationChangedFlowCard.trigger(this, { latitude: this.currentLocation.latitude, longitude: this.currentLocation.longitude, address: this.currentLocation.address }, {});
    return Promise.resolve;
  }

  async updateState() {
    try {
      this.log(`Polling BMW ConnectedDrive for vehicle status updates for ${this.getName()}.`);
      if (this.api) {
        const vehicle = await this.api.getVehicleStatus(this.deviceData.id);
        if (this.hasCapability("locked")) {
          const locked = vehicle.doorLockState === "SECURED" || vehicle.doorLockState === "LOCKED";
          this.setCapabilityValue("locked", locked);
          if (locked && this.settings.updateLocationTrigger === LocationTrigger.Locked) {
            this.updateLocation(vehicle);
          }
        }
        if (this.hasCapability("mileage_capability")) {
          this.setCapabilityValue("mileage_capability", vehicle.mileage);
        }
        if (vehicle.remainingFuel) {
          if (!this.hasCapability("remanining_fuel_liters_capability")) {
            await this.addCapability("remanining_fuel_liters_capability");
          }
          this.setCapabilityValue("remanining_fuel_liters_capability", vehicle.remainingFuel);
        }
        if (this.hasCapability("range_capability")) {
          this.setCapabilityValue("range_capability", vehicle.remainingRange);
        }
        if (this.hasCapability("alarm_generic")) {
          this.setCapabilityValue("alarm_generic", vehicle.doorLockState !== "SECURED");
        }
        if (this.settings.updateLocationTrigger === LocationTrigger.Polling) {
          this.updateLocation(vehicle);
        }
        if (this.hasCapability("measure_battery")) {
          this.setCapabilityValue("measure_battery", vehicle.chargingLevelHv);
          this.setCapabilityValue("measure_battery.actual", vehicle.socHvPercent);
          this.setCapabilityValue("range_capability.battery", vehicle.beRemainingRangeElectric);
          this.setCapabilityValue("range_capability.fuel", vehicle.beRemainingRangeFuel);
          const oldChargingStatus = this.getCapabilityValue("charging_status_capability");
          this.setCapabilityValue("charging_status_capability", vehicle.chargingStatus);
          if (oldChargingStatus !== vehicle.chargingStatus) {
            const chargingStatusFlowCard: any = this.homey.flow.getDeviceTriggerCard("charging_status_change");
            chargingStatusFlowCard.trigger(this, { charging_status: vehicle.chargingStatus }, {});
          }
        }
      }
    } catch (error) {
      this.log("Error occurred while attempting to update device state.", error);
    }
  }
}

module.exports = Vehicle;
