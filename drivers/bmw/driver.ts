import { Driver } from 'homey';
import { BMWConnectedDrive } from '../../app';
import { DeviceData } from '../../configuration/DeviceData';

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
        this.log(`Vehicle detected: ${vehicle.vin}, ${vehicle.model}, ${vehicle.color}, ${vehicle.licensePlate}`);

        if (!vehicle.vin) {
          throw new Error("Cannot list vehicle as vin is empty.");
        }

        let capabilities = [
          "locked",
          "mileage_capability",
          "range_capability"
        ]

        if (vehicle.hasAlarmSystem) {
          this.log('hasAlarmSystem detected.');
          capabilities.push("alarm_generic");
        } else {
          this.log(`HasAlarmSystem: ${vehicle.hasAlarmSystem}`);
        }

        if (vehicle.climateNow === "ACTIVATED") {
          this.log('climate_now_capability detected.');
          capabilities.push("climate_now_capability");
        } else {
          this.log(`ClimateNow: ${vehicle.climateNow}`);
        }

        if (vehicle.driveTrain === "PHEV") {
          this.log('PHEV detected.');
          capabilities.push("measure_battery");
          capabilities.push("measure_battery.actual");
          capabilities.push("range_capability.battery");
          capabilities.push("range_capability.fuel");
          capabilities.push("charging_status_capability");
        } else {
          this.log(`Drivetrain: ${vehicle.driveTrain}`);
        }

        const vehicleStatus = await api.getVehicleStatus(vehicle.vin);
        const deviceData = new DeviceData();
        deviceData.id = vehicle.vin;
        return {
          "name": `${vehicle.model} (${vehicle.licensePlate ?? vehicle.color})`,
          "data": deviceData,
          "capabilities": capabilities,
          "capabilitiesOptions": {
            "range_capability": {
              "units": vehicleStatus.unitOfLength
            },
            "range_capability.battery": {
              "title": {
                "en": "Range Battery"
              },
              "units": vehicleStatus.unitOfLength
            },
            "range_capability.fuel": {
              "title": {
                "en": "Range Fuel"
              },
              "units": vehicleStatus.unitOfLength
            }
          }
          //   store: {
          //     address: '127.0.0.1',
          //   },
          // },
        };
      }));
    }
    return [];
  }
}

module.exports = ConnectedDriveDriver;