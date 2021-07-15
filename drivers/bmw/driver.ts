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
        this.log(`Vehicle detected: ${vehicle.vin}, ${vehicle.model}, ${vehicle.color}, ${vehicle.licensePlate}`);

        if (!vehicle.vin) {
          throw new Error("Cannot list vehicle as vin is empty.");
        }

        const vehicleStatus = await api.getVehicleStatus(vehicle.vin);

        let capabilities: string[] = [];

        if (vehicleStatus.mileage > 0) {
          capabilities.push("mileage_capability");
        } else {
          this.log(`mileage: ${vehicleStatus.mileage}`);
        }

        if (vehicleStatus.remainingFuel > 0) {
          capabilities.push("remanining_fuel_liters_capability");
        } else {
          this.log(`remanining_fuel_liters_capability: ${vehicleStatus.remainingFuel}`);
        }

        if (vehicleStatus.doorLockState) {
          capabilities.push("locked");

          if (vehicle.hasAlarmSystem) {
            capabilities.push("alarm_generic");
          } else {
            this.log(`HasAlarmSystem: ${vehicle.hasAlarmSystem}`);
          }
        } else {
          this.log(`doorLockState: ${vehicleStatus.doorLockState}`);
        }

        if (vehicleStatus.remainingRange > 0) {
          capabilities.push("range_capability");
        } else {
          this.log(`remainingRange: ${vehicleStatus.remainingRange}`);
        }

        if (vehicle.climateNow === "ACTIVATED") {
          capabilities.push("climate_now_capability");
        } else {
          this.log(`ClimateNow: ${vehicle.climateNow}`);
        }

        if (vehicle.driveTrain === "PHEV" || vehicle.driveTrain === "BEV") {
          capabilities.push("measure_battery");
          capabilities.push("measure_battery.actual");
          capabilities.push("range_capability.battery");
          capabilities.push("range_capability.fuel");
          capabilities.push("charging_status_capability");
        } else {
          this.log(`Drivetrain: ${vehicle.driveTrain}`);
        }

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

    throw new Error("Please ensure proper credentials have been provided in the settings page of the application.");
  }
}

module.exports = ConnectedDriveDriver;