import { Device } from 'homey';
import { BMWConnectedDrive } from '../../app';
import { DeviceData } from '../../configuration/DeviceData';
import { ConnectedDrive } from 'bmw-connected-drive';

class Vehicle extends Device {
  api?: ConnectedDrive;
  deviceData!: DeviceData;
  deviceStatusPoller!: NodeJS.Timeout;
  deviceStatusPollingInterval!: number;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.api = (this.homey.app as BMWConnectedDrive).connectedDriveApi;
    this.deviceData = this.getData() as DeviceData;
    this.deviceStatusPollingInterval = (this.getSetting("pollingInterval") as number) * 1000;

    // register a capability listener
    this.registerCapabilityListener("locked", this.onCapabilityLocked.bind(this));
    if (this.hasCapability("climate_now_capability")) {
      this.registerCapabilityListener("climate_now_capability", this.onCapabilityClimateNow.bind(this));
    }

    await this.updateState();
    this.deviceStatusPoller = setInterval(this.updateState.bind(this), this.deviceStatusPollingInterval);

    this.log(`${this.getName()} (${this.deviceData.id}) has been initialized`);
  }

  // this method is called when the Device has requested a state change (turned on or off)
  async onCapabilityClimateNow(value: boolean, opts: any) {

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
  async onCapabilityLocked(value: boolean, opts: any) {

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
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
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
        this.setCapabilityValue("locked", vehicle?.doorLockState === "SECURED" || vehicle?.doorLockState === "LOCKED");
        this.setCapabilityValue("mileage_capability", vehicle?.mileage);
        this.setCapabilityValue("range_capability", vehicle?.remainingRange);
        if (this.hasCapability("alarm_generic")) {
          this.setCapabilityValue("alarm_generic", vehicle?.doorLockState !== "SECURED");
        }
        if (this.hasCapability("measure_battery")) {
          this.setCapabilityValue("measure_battery", vehicle?.chargingLevelHv);
          this.setCapabilityValue("measure_battery.actual", vehicle?.socHvPercent);
          this.setCapabilityValue("range_capability.battery", vehicle?.beRemainingRangeElectric);
          this.setCapabilityValue("range_capability.fuel", vehicle?.beRemainingRangeFuel);
          const oldChargingStatus = this.getCapabilityValue("charging_status_capability");
          this.setCapabilityValue("charging_status_capability", vehicle?.chargingStatus);
          if (oldChargingStatus !== vehicle?.chargingStatus) {
            const chargingStatusFlowCard: any = this.homey.flow.getDeviceTriggerCard("charging_status_change");
            chargingStatusFlowCard.trigger(this, { charging_status: vehicle?.chargingStatus }, {});
          }
        }
      }
    } catch (error) {
      this.log("Error occurred while attempting to update device state.", error);
    }
  }
}

module.exports = Vehicle;
