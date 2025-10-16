import { Driver, Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./utils/Configuration";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { OpenStreetMap } from "./utils/OpenStreetMap";
import { LocationType } from "./utils/LocationType";
import { DeviceData } from "./utils/DeviceData";
import { Capabilities, CarBrand, Regions, VehicleStatus } from "bmw-connected-drive";
import { Vehicle } from "./drivers/Vehicle";

export async function saveSettings({ homey, body }: { homey: Homey, body: Configuration }): Promise<boolean> {

    body.geofences.forEach(fence => {
        if (!fence.label || !fence.latitude || !fence.longitude || !fence.radius) {
            throw new Error("Geofence information cannot be empty.");
        }
    });

    const previous_configuration = ConfigurationManager.getConfiguration(homey);
    body.region = previous_configuration?.region ?? Regions.RestOfWorld;
    ConfigurationManager.setConfiguration(homey, body);

    return true;
}

export async function getLogs({ homey }: { homey: Homey }): Promise<string[]> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("getLogs invoked.");

    return app.logger?.logs ?? [];
}

export async function resolveAddress({ homey, query }: { homey: Homey, query: any }): Promise<string | undefined> {
    let app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("resolveAddress invoked.");

    const latitude = parseFloat(query.latitude);
    const longitude = parseFloat(query.longitude);
    if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error("Latitude and longitude must be valid numbers.");
    }
    return await OpenStreetMap.GetAddress({ latitude: query.latitude, longitude: query.longitude }, app.logger);
}

export async function getCurrentLocation({ homey }: { homey: Homey }): Promise<LocationType | undefined> {
    let app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("getCurrentLocation invoked.");

    try {
        return app.currentLocation;
    } catch (err) {
        app.logger?.LogError(err);
    }
}

export async function clearTokenStore({ homey }: { homey: Homey }): Promise<boolean> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("clearTokenStore invoked.");

    app.tokenStore?.clearToken();

    return true;
}

export class DeviceCapabilities {
  brand: CarBrand;
  deviceId: string;
  deviceName: string;
  capabilities: { id: string, name: string, value: string }[];

  constructor(brand: CarBrand, deviceId: string, deviceName: string, capabilities: { id: string, name: string, value: string }[]) {
    this.brand = brand;
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.capabilities = capabilities;
  }
}

export async function getRegisteredDevices({ homey }: { homey: Homey }): Promise<DeviceCapabilities[]> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("getRegisteredDevices invoked.");

    let devicesCapabilities: DeviceCapabilities[] = [];

    let drivers = homey.drivers.getDrivers() as { [key: string]: Driver };
    for (const key in drivers) {
        const driver = drivers[key];
        for (const device of driver.getDevices()) {
            const data = device.getData() as DeviceData;
            devicesCapabilities.push(new DeviceCapabilities(
                (device as Vehicle).brand,
                data.id,
                device.getName(),
                device.getCapabilities().map(cap => ({ id: cap, name: cap, value: device.getCapabilityValue(cap)?.toString() ?? 'N/A' }))
            ));
        }
    }

    return devicesCapabilities;
}

export async function getDeviceStatus({ homey, query }: { homey: Homey, query: { brand: CarBrand, deviceId: string } }): Promise<VehicleStatus> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation(`getDeviceStatus invoked. Brand: ${query.brand}, DeviceId: ${query.deviceId}`);

    if (!app.connectedDriveApi) {
        throw new Error("ConnectedDrive API is not available.");
    }

    return await app.connectedDriveApi.getVehicleStatus(query.deviceId, query.brand);
}

export async function getDeviceCapabilities({ homey, query }: { homey: Homey, query: { brand: CarBrand, deviceId: string } }): Promise<Capabilities> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation(`getDeviceCapabilities invoked. Brand: ${query.brand}, DeviceId: ${query.deviceId}`);

    if (!app.connectedDriveApi) {
        throw new Error("ConnectedDrive API is not available.");
    }

    return await app.connectedDriveApi.getVehicleCapabilities(query.deviceId, query.brand);
}