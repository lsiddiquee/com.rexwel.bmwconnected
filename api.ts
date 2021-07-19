import { Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./utils/Configuration";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { ConnectedDrive, Regions } from "bmw-connected-drive";
import { GeoLocation } from "./utils/GeoLocation";

export async function saveSettings({ homey, body }: { homey: Homey, body: Configuration }): Promise<boolean> {

    if (!body.username || !body.password) {
        throw new Error("Username and password cannot be empty.");
    }

    const app = (homey.app as BMWConnectedDrive);
    const api = new ConnectedDrive(body.username, body.password, Regions.RestOfWorld, app.tokenStore);

    try {
        await api.account.getToken();
        app.connectedDriveApi = api;
    }
    catch (err) {
        app.logger?.LogError(err);
        return false;
    }
    ConfigurationManager.setConfiguration(homey, body);

    app.logger?.LogInformation("Login successfull");
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
    return await GeoLocation.GetAddress(query.latitude, query.longitude, app.logger);
}