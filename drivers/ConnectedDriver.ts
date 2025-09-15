import { Device, Driver } from 'homey';
import { BMWConnectedDrive } from '../app';
import { DeviceData } from '../utils/DeviceData';
import { CarBrand, ConnectedDrive } from "bmw-connected-drive";
import { Settings } from '../utils/Settings';
import { ConfigurationManager } from '../utils/ConfigurationManager';
import { Configuration } from '../utils/Configuration';
import { Logger } from '../utils/Logger';

export class ConnectedDriver extends Driver {
  logger?: Logger;
  brand: CarBrand = CarBrand.Bmw;

  async onInit() {
    this.logger = new Logger(this, () => ConfigurationManager.getConfiguration(this.homey).logLevel);
  }

  async onPair(session: any) {
    this.logger?.LogInformation("Pairing started");
    session.setHandler('showView', async (view: string) => {
      if (view === 'loading') {
        const app = (this.homey.app as BMWConnectedDrive);

        // Test if the credentials are valid
        if (app.connectedDriveApi) {
          try {
            await app.connectedDriveApi.account.getToken();
            await session.showView('list_devices');
            return;
          } catch (err) {
            this.logger?.LogError(err);
          }
        }

        // Otherwise redirect to the login view
        await session.nextView();
      }
    });

    session.setHandler("login", async (data: any) => {
      const app = (this.homey.app as BMWConnectedDrive);
      this.logger?.LogTrace("Email: " + data.email + " Password: **** Region: " + data.region + " Captcha: " + data.captcha);
      if (!data.email || !data.password || !data.region || !data.captcha) {
        return false;
      }

      try {
        const api = new ConnectedDrive(data.email, data.password, data.region, app.tokenStore, app.logger, data.captcha);
        await api.account.getToken();
        app.connectedDriveApi = api;

        // Update the configuration with the region
        const configuration = ConfigurationManager.getConfiguration(this.homey) ?? new Configuration();
        configuration.region = data.region;
        ConfigurationManager.setConfiguration(this.homey, configuration);

        return true;
      } catch (err) {
        this.logger?.LogError(err);
        return false;
      }
    });

    session.setHandler("list_devices", async () => {
      const app = (this.homey.app as BMWConnectedDrive);
      const api = app.connectedDriveApi;

      if (!api) {
        throw new Error("ConnectedDrive API is not initialized.");
      }

      const vehicles = await api.getVehiclesByBrand(this.brand);

      vehicles.forEach(vehicle => {
        this.logger?.LogInformation(`Vehicle found: ${vehicle.attributes.brand}: ${vehicle.vin}, ${vehicle.attributes.model}`);
      });

      return vehicles
        .map(vehicle => {
          if (!vehicle.vin) {
            throw new Error("Cannot list vehicle as vin is empty.");
          }

          const deviceData = new DeviceData(vehicle.vin);

          return {
            "name": `${vehicle.attributes.model} (${vehicle.vin})`,
            "data": deviceData,
            "settings": new Settings(),
            "icon": "icon.svg"
          };
        });
    });
  }

  async onRepair(session: any, device: Device) {
    this.homey.log("Repairing started");
    session.setHandler('showView', async (view: string) => {
      if (view === 'loading') {
        const app = (this.homey.app as BMWConnectedDrive);

        // Test if the credentials are valid
        if (app.connectedDriveApi) {
          try {
            await app.connectedDriveApi.account.getToken();
            await device.setAvailable();
            await session.done();
            return;
          } catch (err) {
            this.log(err);
          }
        }

        // Otherwise redirect to the login view
        await session.nextView();
      }
    });

    session.setHandler("login", async (data: any) => {
      const app = (this.homey.app as BMWConnectedDrive);
      this.logger?.LogTrace("Email: " + data.email + " Password: **** Region: " + data.region + " Captcha: " + data.captcha);
      if (!data.email || !data.password || !data.region || !data.captcha) {
        return false;
      }

      try {
        const api = new ConnectedDrive(data.email, data.password, data.region, app.tokenStore, app.logger, data.captcha);
        await api.account.getToken();
        app.connectedDriveApi = api;

        // Update the configuration with the region
        const configuration = ConfigurationManager.getConfiguration(this.homey) ?? new Configuration();
        configuration.region = data.region;
        ConfigurationManager.setConfiguration(this.homey, configuration);

        // Enable the device
        await device.setAvailable(); // TODO: Set other devices as well.

        return true;
      } catch (err) {
        this.logger?.LogError(err);
        return false;
      }
    });
  }
}