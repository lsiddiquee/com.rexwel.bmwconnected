import fetch from "cross-fetch";
import { Logger } from "./Logger";

export class GeoLocation {
    static async GetAddress(gpsLat: number, gpsLng: number, logger?: Logger): Promise<string | undefined> {

        logger?.LogInformation(`Resolving address for Latitude: ${gpsLat} Longitude: ${gpsLng}`);
        const url: string = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gpsLat}&lon=${gpsLng}&zoom=18&addressdetails=0`;

        const serverResponse = await fetch(url, { headers: {
            "User-Agent": "HomeyAppBMWConnected"
        }});

        const response = await serverResponse.text();

        if (!serverResponse.ok) {
            logger?.LogError(`${serverResponse.status}: Error occurred while attempting to retrieve token. Server response: ${response}`);
            return undefined;
        }

        const address = JSON.parse(response)?.display_name;
        logger?.LogInformation(`Resolved address: ${address}`);

        return address;
    }
}