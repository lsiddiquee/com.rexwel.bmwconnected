import { Homey } from "homey";
import { BMWConnectedDrive } from "./app";
import { Configuration } from "./configuration/Configuration";
import { ConfigurationManager } from "./configuration/ConfigurationManager";
import { ConnectedDrive, Regions } from "bmw-connected-drive";

export async function validateCredentials({ homey, body }: { homey: Homey, body: Configuration }) : Promise<boolean> {

    // TODO: Validate body
    ConfigurationManager.setConfiguration(homey, body);

    let app = (homey.app as BMWConnectedDrive);
    if (app.connectedDriveApi) {
        app.connectedDriveApi = undefined;
    }
    app.connectedDriveApi = new ConnectedDrive(body.username, body.password, Regions.RestOfWorld, app.tokenStore);
    try
    {
        await app.connectedDriveApi.account.getToken();
    }
    catch (err)
    {
        app.connectedDriveApi = undefined;
        homey.app.log(err);
        return false;
    }
    homey.app.log("Login successfull");
    return true;
}