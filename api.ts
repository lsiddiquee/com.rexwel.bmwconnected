import Homey from 'homey/lib/Homey';
import { Driver } from 'homey';
import { BMWConnectedDrive } from './app';
import { Configuration } from './utils/Configuration';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { OpenStreetMap } from './utils/OpenStreetMap';
import { LocationType } from './utils/LocationType';
import { DeviceData } from './utils/DeviceData';

export async function saveSettings({
  homey,
  body,
}: {
  homey: Homey;
  body: Configuration;
}): Promise<boolean> {
  body.geofences.forEach((fence) => {
    if (!fence.label || !fence.latitude || !fence.longitude || !fence.radius) {
      throw new Error('Geofence information cannot be empty.');
    }
  });

  ConfigurationManager.setConfiguration(homey, body);

  return true;
}

export async function getLogs({ homey }: { homey: Homey }): Promise<string[]> {
  await Promise.resolve(); // Ensure async context

  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getLogs invoked.');

  const loggerWithRecentLogs = app.logger as unknown as { getRecentLogs: () => string[] }; // Type assertion
  if (loggerWithRecentLogs) {
    return loggerWithRecentLogs.getRecentLogs();
  }
  return [];
}

export async function resolveAddress({
  homey,
  query,
}: {
  homey: Homey;
  query: any;
}): Promise<string | undefined> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('resolveAddress invoked.');

  const latitude = parseFloat(query.latitude);
  const longitude = parseFloat(query.longitude);
  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error('Latitude and longitude must be valid numbers.');
  }
  return await OpenStreetMap.GetAddress(query.latitude, query.longitude, app.logger);
}

export async function getCurrentLocation({
  homey,
}: {
  homey: Homey;
}): Promise<LocationType | undefined> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getCurrentLocation invoked.');

  try {
    return app.currentLocation;
  } catch (err) {
    app.logger?.error('Failed to get current location', err instanceof Error ? err : undefined);
    return undefined;
  }
}

export async function clearTokenStore({ homey }: { homey: Homey }): Promise<boolean> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('clearTokenStore invoked - clearing all app-level tokens.');

  // Clear all app-level tokens (keyed by client ID)
  // Tokens are stored in homey.settings with keys like "token_<clientId>"
  if (app['tokenStore']) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenStore = app['tokenStore'] as any;
    const clientIds = tokenStore.getStoredClientIds() as string[];

    app.logger?.info(`Clearing tokens for ${clientIds.length} client IDs`);

    for (const clientId of clientIds) {
      await tokenStore.deleteToken(clientId);
      app.clearClientCache(clientId);
    }
  }

  return true;
}

// Internal class for device capabilities data structure
class DeviceCapabilities {
  deviceId: string;
  deviceName: string;
  capabilities: { id: string; name: string; value: string }[];

  constructor(
    deviceId: string,
    deviceName: string,
    capabilities: { id: string; name: string; value: string }[]
  ) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.capabilities = capabilities;
  }
}

export async function getRegisteredDevices({
  homey,
}: {
  homey: Homey;
}): Promise<DeviceCapabilities[]> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info('getRegisteredDevices invoked.');

  const devicesCapabilities: DeviceCapabilities[] = [];

  const drivers = homey.drivers.getDrivers() as { [key: string]: Driver };
  for (const key in drivers) {
    const driver = drivers[key];
    for (const device of driver.getDevices()) {
      const data = device.getData() as DeviceData;
      devicesCapabilities.push(
        new DeviceCapabilities(
          data.id,
          device.getName(),
          device.getCapabilities().map((cap) => ({
            id: cap,
            name: cap,
            value: device.getCapabilityValue(cap)?.toString() ?? 'N/A',
          }))
        )
      );
    }
  }

  return devicesCapabilities;
}

// Note: The following functions have been disabled during BMW CarData API migration
// as they are no longer supported by the CarData API

export async function getDeviceStatus({
  homey,
  query,
}: {
  homey: Homey;
  query: { deviceId: string };
}): Promise<any> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.info(`getDeviceStatus invoked. DeviceId: ${query.deviceId}`);

  // Note: CarDataClient is now per-device, not app-level
  // Device status is fetched by the Vehicle device itself during polling
  app.logger?.warn('Device status should be accessed from individual vehicle devices');

  throw new Error('Device status API endpoint disabled - use per-device polling instead');
}

// Vehicle capabilities endpoint not supported by BMW CarData API
export async function getDeviceCapabilities({
  homey,
  query,
}: {
  homey: Homey;
  query: { deviceId: string };
}): Promise<any> {
  const app = homey.app as BMWConnectedDrive;
  app.logger?.warn(
    `getDeviceCapabilities invoked but not supported by CarData API. DeviceId: ${query.deviceId}`
  );

  // Return empty capabilities object - CarData API does not provide this endpoint
  return {
    isChargingPowerLimitEnabled: false,
    isChargingTargetSocEnabled: false,
    remoteChargingCommands: {
      chargingControl: [],
    },
  };
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
