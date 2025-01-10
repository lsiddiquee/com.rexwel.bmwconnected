import { Driver } from 'homey';
import { BMWConnectedDrive } from '../app';
import { DeviceData } from '../utils/DeviceData';
import { Configuration } from '../utils/Configuration';
import { ConfigurationManager } from '../utils/ConfigurationManager';
import { CarBrand, ConnectedDrive } from "bmw-connected-drive";
import { Settings } from '../utils/Settings';

export class ConnectedDriver extends Driver {
  brand: CarBrand = CarBrand.Bmw;

  async onPair(session: any) {
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
            this.log(err);
          }
        }

        // Otherwise redirect to the login view
        await session.nextView();
      }
    });

    session.setHandler("login", async (data: any) => {
      const app = (this.homey.app as BMWConnectedDrive);
      let configuration = ConfigurationManager.getConfiguration(this.homey);
      if (!configuration) {
        configuration = new Configuration();
      }

      configuration.username = data.username;
      configuration.password = data.password;

      ConfigurationManager.setConfiguration(this.homey, configuration);

      try {
        const api = new ConnectedDrive(configuration.username, configuration.password, configuration.region, app.tokenStore);
        await api.account.getToken();
        app.connectedDriveApi = api;
        return true;
      } catch (err) {
        app.logger?.LogError(err);
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
        app.logger?.LogInformation(`Vehicle found: ${vehicle.attributes.brand}: ${vehicle.vin}, ${vehicle.attributes.model}`);
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
}