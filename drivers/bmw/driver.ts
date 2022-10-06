import { Driver } from 'homey';
import { BMWConnectedDrive } from '../../app';
import { DeviceData } from '../../utils/DeviceData';

class ConnectedDriveDriver extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('BMW ConnectedDrive driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const api = (this.homey.app as BMWConnectedDrive).connectedDriveApi;

    if (api) {
      const vehicles = await api.getVehicles();

      return Promise.all(vehicles.map(async vehicle => {
        this.log(`Vehicle detected: ${vehicle.vin}, ${vehicle.attributes.model}`);

        if (!vehicle.vin) {
          throw new Error("Cannot list vehicle as vin is empty.");
        }

        const deviceData = new DeviceData();
        deviceData.id = vehicle.vin;
        return {
          "name": `${vehicle.attributes.model} (${vehicle.vin})`,
          "data": deviceData,
        };
      }));
    }

    throw new Error("Please ensure proper credentials have been provided in the settings page of the application.");
  }
}

module.exports = ConnectedDriveDriver;