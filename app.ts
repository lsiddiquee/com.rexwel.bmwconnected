import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';
import { ConnectedDrive, ILogger, Regions } from 'bmw-connected-drive';
import { HomeyTokenStore } from './utils/HomeyTokenStore';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { DeviceData } from './utils/DeviceData';
import { Logger } from './utils/Logger';
import { Configuration } from './utils/Configuration';
import { LocationType } from './utils/LocationType';

// TODO:
// Window states capability
// Hood state capability
// Trunk state capability
// Charging control capability
// Last status update

export class BMWConnectedDrive extends Homey.App {
  tokenStore?: HomeyTokenStore;
  connectedDriveApi?: ConnectedDrive;
  logger?: Logger;
  currentLocation?: LocationType;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    this.logger = new Logger(this.homey);
    this.tokenStore = new HomeyTokenStore(this.homey);
    let configuration = ConfigurationManager.getConfiguration(this.homey);
    if (!configuration) {
      configuration = new Configuration();
      ConfigurationManager.setConfiguration(this.homey, configuration);
    }
    if (configuration.username && configuration.password) {
      this.connectedDriveApi = new ConnectedDrive(configuration.username, configuration.password, configuration.region, this.tokenStore, this.logger);
    }
    this.logger.LogInformation('BMWConnectedDrive app has been initialized');

    this.registerActionCards();
    this.registerConditionCards();
  }

  private registerActionCards() {
    this.homey.flow.getActionCard('climate_now').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while climate_now flow triggered.");
      }
      args.device.log(`Flow triggered climate_now for vin ${vin}`);

      try {
        await this.connectedDriveApi?.startClimateControl(vin);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });

    this.homey.flow.getActionCard('lock_vehicle').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while lock_vehicle flow triggered.");
      }
      args.device.log(`Flow triggered lock_vehicle for vin ${vin}`);

      try {
        await this.connectedDriveApi?.lockDoors(vin);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });

    this.homey.flow.getActionCard('unlock_vehicle').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while unlock_vehicle flow triggered.");
      }
      args.device.log(`Flow triggered unlock_vehicle for vin ${vin}`);

      try {
        await this.connectedDriveApi?.unlockDoors(vin);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });

    this.homey.flow.getActionCard('blow_horn').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while blow_horn triggered.");
      }
      args.device.log(`Flow triggered blow_horn for vin ${vin}`);

      try {
        await this.connectedDriveApi?.blowHorn(vin);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });

    this.homey.flow.getActionCard('flash_lights').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while flash_lights flow triggered.");
      }
      args.device.log(`Flow triggered flash_lights for vin ${vin}`);

      try {
        await this.connectedDriveApi?.flashLights(vin);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });

    this.homey.flow.getActionCard('send_message').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while send_message flow triggered.");
      }
      args.device.log(`Flow triggered send_message for vin ${vin}`);

      try {
        await this.connectedDriveApi?.sendMessage(vin, args.subject, args.message);
      } catch (err) {
        this.logger?.LogError(err);
      }
    });
  }

  private registerConditionCards() {
    const geofenceCard = this.homey.flow.getConditionCard('geofence');
    geofenceCard.registerArgumentAutocompleteListener("geo_fence", async (query: any, args: any) => {
      const configuration = ConfigurationManager.getConfiguration(this.homey);
      if (configuration?.geofences) {
        const geofences = configuration.geofences.map(item => ({name: item.Label, id: item.Label}));
        return geofences.filter(result => result.name?.toLowerCase().includes(query.toLowerCase()));
      }

      return [];
    });
    geofenceCard.registerRunListener(async (args: any, state: any) => {
      const app = this.homey.app as BMWConnectedDrive
      return (app.currentLocation && args.geo_fence.id && app.currentLocation.Label === args.geo_fence.id);
    });

    this.homey.flow.getConditionCard('battery_percentage').registerRunListener(async (args: any, _: any) => {
      const battery_percentage = args.device.getCapabilityValue('measure_battery');
      return (battery_percentage < args.battery_charge_test);
    });

    this.homey.flow.getConditionCard('charging_status').registerRunListener(async (args: any, _: any) => {
      const charging_state = args.device.getCapabilityValue('charging_status_capability');
      return (charging_state === args.charging_state);
    });
  }
}

module.exports = BMWConnectedDrive;