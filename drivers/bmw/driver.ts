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
        this.log(`Vehicle detected: ${vehicle.vin}, ${vehicle.model}`);

        if (!vehicle.vin) {
          throw new Error("Cannot list vehicle as vin is empty.");
        }

        let capabilities: string[] = [];

        if (vehicle.status?.currentMileage?.mileage) {
          capabilities.push("mileage_capability");
        }

        if (vehicle.properties?.fuelLevel?.value) {
          capabilities.push("remanining_fuel_liters_capability");
        }

        if (vehicle.properties.areDoorsLocked) {
          capabilities.push("locked");

          // if (vehicle.hasAlarmSystem) {
          //   capabilities.push("alarm_generic");
          // }
        } else {
          capabilities.push("only_lock_unlock_flow_capability");
        }

        if (vehicle.properties?.vehicleLocation?.coordinates?.latitude) {
          capabilities.push("location_capability");
        }

        if (vehicle.properties?.vehicleLocation?.address?.formatted) {
          capabilities.push("address_capability");
        }

        if (vehicle.properties?.combinedRange?.distance?.value) {
          capabilities.push("range_capability");
        }

        if (vehicle.capabilities?.climateNow?.isEnabled) {
          capabilities.push("climate_now_capability");
        }

        if (vehicle.properties?.electricRange?.distance.value) {
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
          "name": `${vehicle.model} (${vehicle.vin})`,
          "data": deviceData,
          "capabilities": capabilities,
          "capabilitiesOptions": {
            "range_capability": {
              "units": vehicle.status?.currentMileage?.units
            },
            "range_capability.battery": {
              "title": {
                "en": "Range Battery"
              },
              "units": vehicle.properties?.electricRange?.distance?.units
            },
            "range_capability.fuel": {
              "title": {
                "en": "Range Fuel"
              },
              "units": vehicle.properties?.combustionRange?.distance?.units
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