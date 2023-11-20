import { Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./utils/Configuration";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { ConnectedDrive, Regions } from "bmw-connected-drive";
import { GeoLocation } from "./utils/GeoLocation";

export async function saveSettings({ homey, body }: { homey: Homey, body: Configuration }): Promise<boolean> {

    if (!body.username || !body.password || !body.region) {
        throw new Error("Username, password and region cannot be empty.");
    }

    body.geofences.forEach(fence => {
        if (!fence.Label || !fence.Latitude || !fence.Longitude || !fence.Radius) {
            throw new Error("Geofence information cannot be empty.");
        }
    });

    const app = (homey.app as BMWConnectedDrive);
    const api = new ConnectedDrive(body.username, body.password, body.region, app.tokenStore);
    ConfigurationManager.setConfiguration(homey, body);

    try {
        await api.account.getToken();
        app.connectedDriveApi = api;
    } catch (err) {
        if (typeof err === "string") {
            app.logger?.LogError(err);
        } else if (err instanceof Error) {
            app.logger?.LogError(err.message);
        }
        return false;
    }

    app.logger?.LogInformation("Login successful");
    return true;
}

export async function getLogs({ homey }: { homey: Homey }): Promise<string[]> {
    const app = (homey.app as BMWConnectedDrive);

    return app.logger?.logs ?? [];
}

export async function resolveAddress({ homey, query }: { homey: Homey, query: any }): Promise<string | undefined> {
    let app = (homey.app as BMWConnectedDrive);

    const latitude = parseFloat(query.latitude);
    const longitude = parseFloat(query.longitude);
    if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error("Latitude and longitude must be valid numbers.");
    }
    return await GeoLocation.GetAddress({ Latitude: query.latitude, Longitude: query.longitude }, app.logger);
}