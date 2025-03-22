import fetch from "cross-fetch";
import { LocationType } from "./LocationType";
import { Logger } from "./Logger";

export class OpenStreetMap {
    static async GetAddress(location: LocationType, logger?: Logger): Promise<string | undefined> {

        logger?.LogInformation(`Resolving address for Latitude: ${location.latitude} Longitude: ${location.longitude}`);
        const url: string = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}&zoom=18&addressdetails=0`;

        const serverResponse = await fetch(url, {
            headers: {
                "User-Agent": "HomeyAppBMWConnected"
            }
        });

        const response = await serverResponse.text();

        if (!serverResponse.ok) {
            logger?.LogError(`${serverResponse.status}: Error occurred while attempting to retrieve address. Server response: ${response}`);
            return undefined;
        }

        const address = JSON.parse(response)?.display_name;
        logger?.LogInformation(`Resolved address: ${address}`);

        return address;
    }
}