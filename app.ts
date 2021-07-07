import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';
import { ConnectedDrive, Regions } from 'bmw-connected-drive';
import { HomeyTokenStore } from './configuration/HomeyTokenStore';
import { ConfigurationManager } from './configuration/ConfigurationManager';
import { DeviceData } from './configuration/DeviceData';

// TODO:
// Location capability
// Trigger: Location based
// Window states capability
// Hood state capability
// Trunk state capability
// Charging control capability
// Last status update

export class BMWConnectedDrive extends Homey.App {
  tokenStore?: HomeyTokenStore;
  connectedDriveApi?: ConnectedDrive;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    let configuration = ConfigurationManager.getConfiguration(this.homey);
    if (configuration && configuration.username && configuration.password) {
      this.tokenStore = new HomeyTokenStore(this.homey);
      this.connectedDriveApi = new ConnectedDrive(configuration.username, configuration.password, Regions.RestOfWorld, this.tokenStore);
    }
    this.log('BMWConnectedDrive app has been initialized');

    this.homey.flow.getActionCard('climate_now').registerRunListener(async (args: any, state: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while Climate Now flow triggered.");
      }
      args.device.log(`Flow triggered climate now for vin ${vin}`);
      await this.connectedDriveApi?.startClimateControl(vin);
    });

    this.homey.flow.getActionCard('blow_horn').registerRunListener(async (args: any, state: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while blow_horn triggered.");
      }
      args.device.log(`Flow triggered blow_horn for vin ${vin}`);
      await this.connectedDriveApi?.blowHorn(vin);
    });

    this.homey.flow.getActionCard('flash_lights').registerRunListener(async (args: any, state: any) => {
      const vin = (args.device?.deviceData as DeviceData)?.id;
      if (!vin) {
        throw new Error("VIN not found while flash_lights flow triggered.");
      }
      args.device.log(`Flow triggered flash_lights for vin ${vin}`);
      await this.connectedDriveApi?.flashLights(vin);
    });

    this.homey.flow.getActionCard('send_message').registerRunListener(async (args: any, state: any) => {
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