import Homey from 'homey/lib/Homey';
import { Driver } from 'homey';
import { BMWConnectedDrive } from './app';
import { Configuration } from './utils/Configuration';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { OpenStreetMap } from './utils/OpenStreetMap';
import { LocationType } from './utils/LocationType';
import { DeviceData } from './utils/DeviceData';
import { Vehicle } from './drivers/Vehicle';
import { VehicleStatus } from './lib';
import { DeviceStoreData } from './utils/DeviceStateManager';
import { STORE_KEY_DEVICE_STATE } from './utils/StoreKeys';

export async function saveSettings({
  homey,
  body,
}: {
  homey: Homey;
  body: Configuration;
}): Promise<boolean> {
  await Promise.resolve(); // Ensure async context

  body.geofences.forEach((fence) => {
    if (!fence.label || !fence.latitude || !fence.longitude || !fence.radius) {
      throw new Error('Geofence information cannot be empty.');
    }
  });

  ConfigurationManager.setConfiguration(homey, body);

  return true;
}

export async function getLogs({
  homey,
}: {
  homey: Homey;
}): Promise<Array<{ timestamp: string; level: string; message: string }>> {
  await Promise.resolve(); // Ensure async context

  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getLogs invoked.');

  const loggerWithRecentLogs = app.logger as unknown as {
    getRecentLogs: () => Array<{ timestamp: string; level: string; message: string }>;
  };
  if (loggerWithRecentLogs?.getRecentLogs) {
    return loggerWithRecentLogs.getRecentLogs().reverse();
  }
  return [];
}

export async function resolveAddress({
  homey,
  query,
}: {
  homey: Homey;
  query: { latitude?: number; longitude?: number };
}): Promise<string | undefined> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('resolveAddress invoked.');

  if (!query.latitude || !query.longitude || isNaN(query.latitude) || isNaN(query.longitude)) {
    throw new Error('Latitude and longitude must be valid numbers.');
  }
  return await OpenStreetMap.GetAddress(query.latitude, query.longitude, app.logger);
}

export async function getCurrentLocation({
  homey,
}: {
  homey: Homey;
}): Promise<LocationType | undefined> {
  await Promise.resolve(); // Ensure async context

  // TODO: Improve to be able to select vehicle if multiple are registered
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getCurrentLocation invoked.');

  for (const driver of Object.values(homey.drivers.getDrivers())) {
    const devices = driver.getDevices();
    for (const device of devices) {
      const vehicle = device as Vehicle;
      const location = vehicle.stateManager.getLastLocation();
      if (location) {
        return location;
      }
    }
  }
  return undefined;
}

export async function clearTokenStore({ homey }: { homey: Homey }): Promise<boolean> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('clearTokenStore invoked - clearing all app-level tokens.');

  // Clear all app-level tokens (keyed by client ID)
  // Tokens are stored in homey.settings with keys like "token_<clientId>"
  if (app['tokenStore']) {
    const tokenStore = app['tokenStore'];
    const clientIds = tokenStore.getStoredClientIds();

    app.logger?.info(`Clearing tokens for ${clientIds.length} client IDs`);

    for (const clientId of clientIds) {
      await tokenStore.deleteToken(clientId);
      app.clearClientCache(clientId);
    }
  }

  return true;
}

// Internal class for device capabilities data structure
class DeviceDetails {
  deviceId: string;
  deviceName: string;
  capabilities: { id: string; name: string; value: string }[];
  state: VehicleStatus;
  storeData: DeviceStoreData;

  constructor(
    deviceId: string,
    deviceName: string,
    capabilities: { id: string; name: string; value: string }[],
    state: VehicleStatus,
    storeData: DeviceStoreData
  ) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.capabilities = capabilities;
    this.state = state;
    this.storeData = storeData;
  }
}

export async function getRegisteredDevices({ homey }: { homey: Homey }): Promise<DeviceDetails[]> {
  await Promise.resolve(); // Ensure async context

  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getRegisteredDevices invoked.');

  const devicesCapabilities: DeviceDetails[] = [];

  const drivers = homey.drivers.getDrivers() as { [key: string]: Driver };
  for (const key in drivers) {
    const driver = drivers[key];
    for (const device of driver.getDevices()) {
      const data = device.getData() as DeviceData;
      const vehicle = device as Vehicle;
      devicesCapabilities.push(
        new DeviceDetails(
          data.id,
          device.getName(),
          device.getCapabilities().map((cap) => ({
            id: cap,
            name: cap,
            value: String(device.getCapabilityValue(cap)),
          })),
          vehicle.stateManager.getVehicleStatus(),
          device.getStoreValue(STORE_KEY_DEVICE_STATE) as DeviceStoreData
        )
      );
    }
  }

  return devicesCapabilities;
}

/**
 * Get OAuth tokens for all stored client IDs
 * Useful for debugging and using tokens in external tools like Swagger UI
 */
export async function getClientTokens({ homey }: { homey: Homey }): Promise<
  Array<{
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    tokenType: string;
  }>
> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getClientTokens invoked - retrieving all stored tokens.');

  const tokens: Array<{
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    tokenType: string;
  }> = [];

  if (app['tokenStore']) {
    const tokenStore = app['tokenStore'];
    const clientIds = tokenStore.getStoredClientIds();

    app.logger?.info(`Found ${clientIds.length} client IDs with stored tokens`);

    for (const clientId of clientIds) {
      const token = await tokenStore.retrieveToken(clientId);
      if (token) {
        tokens.push({
          clientId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: new Date(token.expiresAt * 1000).toISOString(),
          tokenType: token.tokenType,
        });
      }
    }
  }

  return tokens;
}
