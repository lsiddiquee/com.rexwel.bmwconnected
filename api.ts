import { Driver, Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./utils/Configuration";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { ConnectedDrive } from "bmw-connected-drive";
import { OpenStreetMap } from "./utils/OpenStreetMap";
import { LocationType } from "./utils/LocationType";
import { DeviceData } from "./utils/DeviceData";

export async function saveSettings({ homey, body }: { homey: Homey, body: Configuration }): Promise<boolean> {

    if (!body.username || !body.password || !body.region) {
        throw new Error("Username, password and region cannot be empty.");
    }

    body.geofences.forEach(fence => {
        if (!fence.label || !fence.latitude || !fence.longitude || !fence.radius) {
            throw new Error("Geofence information cannot be empty.");
        }
    });

    const app = (homey.app as BMWConnectedDrive);
    const api = new ConnectedDrive(body.username, body.password, body.region, app.tokenStore, app.logger, body.captcha);
    ConfigurationManager.setConfiguration(homey, body);

    try {
        await api.account.getToken();
        app.connectedDriveApi = api;
    } catch (err) {
        app.logger?.LogError(err);
        return false;
    }

    app.logger?.LogInformation("Login successful");
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

export async function getRegisteredDevices({ homey }: { homey: Homey }): Promise<DeviceData[]> {
    const app = (homey.app as BMWConnectedDrive);
    app.logger?.LogInformation("getRegisteredDevices invoked.");

    let devices: DeviceData[] = [];
    let drivers = homey.drivers.getDrivers() as { [key: string]: Driver };
    for (const key in drivers) {
        const driver = drivers[key];
        devices.push(...(driver.getDevices().map(device => device.getData() as DeviceData)));
    }

    return devices;
}
