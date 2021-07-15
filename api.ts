import { Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./utils/Configuration";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { ConnectedDrive, Regions } from "bmw-connected-drive";

export async function saveSettings({ homey, body }: { homey: Homey, body: Configuration }): Promise<boolean> {

    if (!body.username || !body.password) {
        throw new Error("Username and password cannot be empty.");
    }

    let app = (homey.app as BMWConnectedDrive);
    const api = new ConnectedDrive(body.username, body.password, Regions.RestOfWorld, app.tokenStore);

    try {
        await api.account.getToken();
        app.connectedDriveApi = api;
    }
    catch (err) {
        homey.app.log(err);
        return false;
    }
    ConfigurationManager.setConfiguration(homey, body);

    homey.app.log("Login successfull");
    return true;
}

export async function getLogs({ homey }: { homey: Homey }): Promise<string[]> {

    let app = (homey.app as BMWConnectedDrive);

    return app.logger?.logs ?? [];
}