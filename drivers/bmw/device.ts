import { Device } from 'homey';
import { BMWConnectedDrive } from '../../app';
import { DeviceData } from '../../utils/DeviceData';
import { ConnectedDrive } from 'bmw-connected-drive';
import { GeoLocation } from '../../utils/GeoLocation';
// import { Logger } from '../../utils/Logger';

type location = { gpsLat: number, gpsLong: number, address: string };
class Vehicle extends Device {

  // logger?: Logger;
  api?: ConnectedDrive;
  deviceData!: DeviceData;
  deviceStatusPoller!: NodeJS.Timeout;
  deviceStatusPollingInterval!: number;
  currentLocation?: location;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    const app = this.homey.app as BMWConnectedDrive;
    // this.logger = app.logger;
    this.api = app.connectedDriveApi;
    this.deviceData = this.getData() as DeviceData;
    this.deviceStatusPollingInterval = (this.getSetting("pollingInterval") as number) * 1000;

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
          this.currentLocation = { gpsLat: parseFloat(splitString[0]) ?? 0, gpsLong: parseFloat(splitString[1]) ?? 0, address: "" }; // TODO: Update address during init.
          this.currentLocation.address = await GeoLocation.GetAddress(this.currentLocation.gpsLat, this.currentLocation.gpsLong);
          this.log(`Initialized location to '${this.currentLocation.address}' (${this.currentLocation.gpsLat}:${this.currentLocation.gpsLong})`);
        }
      }
    }

    await this.updateState();
    this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.deviceStatusPollingInterval);

    this.log(`${this.getName()} (${this.deviceData.id}) has been initialized`);
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

  async onLocationChanged(newLocation: location) {
    this.log(`Location updated old: ${JSON.stringify(this.currentLocation)}.`);
    this.log(`Location updated new: ${JSON.stringify(newLocation)}.`);
    this.currentLocation = newLocation;
    this.currentLocation.address = await GeoLocation.GetAddress(this.currentLocation.gpsLat, this.currentLocation.gpsLong);
    const locationChangedFlowCard: any = this.homey.flow.getDeviceTriggerCard("location_changed");
    locationChangedFlowCard.trigger(this, { latitude: this.currentLocation.gpsLat, longitude: this.currentLocation.gpsLong, address: this.currentLocation.address }, {});
    return Promise.resolve;
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
  async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any, newSettings: any, changedKeys: string[] }): Promise<string | void> {
    this.log('Vehicle settings was changed');
    if (changedKeys.includes("pollingInterval")) {
      clearInterval(this.deviceStatusPoller);
      this.deviceStatusPollingInterval = (newSettings.pollingInterval as number) * 1000;
      this.log(`setting polling interval to ${this.deviceStatusPollingInterval} milliseconds`);
      this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.deviceStatusPollingInterval);
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
    this.api = undefined;
    if (this.deviceStatusPoller) {
      clearInterval(this.deviceStatusPoller);
    }
  }

  async updateState() {
    try {
      this.log(`Polling BMW ConnectedDrive for vehicle status updates for ${this.getName()}.`);
      if (this.api) {
        const vehicle = await this.api.getVehicleStatus(this.deviceData.id);
        if (this.hasCapability("locked")) {
          this.setCapabilityValue("locked", vehicle.doorLockState === "SECURED" || vehicle.doorLockState === "LOCKED");
        }
        if (this.hasCapability("mileage_capability")) {
          this.setCapabilityValue("mileage_capability", vehicle.mileage);
        }
        if (vehicle.remainingFuel > 0) {
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
        if (vehicle.gpsLat > 0 && vehicle.gpsLng > 0) {
          if (!this.hasCapability("location_capability")) {
            await this.addCapability("location_capability");
          }
          if (this.currentLocation?.gpsLat !== vehicle.gpsLat || this.currentLocation?.gpsLong !== vehicle.gpsLng) {
            this.setCapabilityValue("location_capability", `${vehicle.gpsLat}:${vehicle.gpsLng}`);
            this.onLocationChanged({ gpsLat: vehicle.gpsLat, gpsLong: vehicle.gpsLng, address: "" });
          }
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
