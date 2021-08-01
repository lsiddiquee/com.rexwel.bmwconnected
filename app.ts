import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';
import { ConnectedDrive, ILogger, Regions } from 'bmw-connected-drive';
import { HomeyTokenStore } from './utils/HomeyTokenStore';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { DeviceData } from './utils/DeviceData';
import { Logger } from './utils/Logger';
import { Configuration } from './utils/Configuration';

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
      this.connectedDriveApi = new ConnectedDrive(configuration.username, configuration.password, Regions.RestOfWorld, this.tokenStore, this.logger);
    }
    this.logger.LogInformation('BMWConnectedDrive app has been initialized');

    this.registerActionCards();
  }

  private registerActionCards() {
    this.homey.flow.getActionCard('climate_now').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while climate_now flow triggered.");
      }
      args.device.log(`Flow triggered climate_now for vin ${vin}`);
      await this.connectedDriveApi?.startClimateControl(vin);
    });

    this.homey.flow.getActionCard('lock_vehicle').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while lock_vehicle flow triggered.");
      }
      args.device.log(`Flow triggered lock_vehicle for vin ${vin}`);
      await this.connectedDriveApi?.lockDoors(vin);
    });

    this.homey.flow.getActionCard('unlock_vehicle').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while unlock_vehicle flow triggered.");
      }
      args.device.log(`Flow triggered unlock_vehicle for vin ${vin}`);
      await this.connectedDriveApi?.unlockDoors(vin);
    });

    this.homey.flow.getActionCard('blow_horn').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while blow_horn triggered.");
      }
      args.device.log(`Flow triggered blow_horn for vin ${vin}`);
      await this.connectedDriveApi?.blowHorn(vin);
    });

    this.homey.flow.getActionCard('flash_lights').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while flash_lights flow triggered.");
      }
      args.device.log(`Flow triggered flash_lights for vin ${vin}`);
      await this.connectedDriveApi?.flashLights(vin);
    });

    this.homey.flow.getActionCard('send_message').registerRunListener(async (args: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while send_message flow triggered.");
      }
      args.device.log(`Flow triggered send_message for vin ${vin}`);
      await this.connectedDriveApi?.sendMessage(vin, args.subject, args.message);
    });
  }
}

module.exports = BMWConnectedDrive;