import { Homey } from "homey";
import { ConfigurationManager } from "./ConfigurationManager";
import { ITokenStore, Token } from "bmw-connected-drive";
import { Configuration } from "./Configuration";

export class HomeyTokenStore implements ITokenStore {
    homey: Homey;

    constructor(homey: Homey) {
        this.homey = homey;
    }

    storeToken(token: Token): void {
        let config : Configuration = ConfigurationManager.getConfiguration(this.homey);
        config.token = token;
        ConfigurationManager.setConfiguration(this.homey, config);
    }
    
    retrieveToken(): Token | undefined {
        const token = ConfigurationManager.getConfiguration(this.homey)?.token;
        if (token) {
            // Token needs to be constructed again new as the persisted value might be of not date type.
            token.validUntil = new Date(token.validUntil);
        }

        return token;
    }

}