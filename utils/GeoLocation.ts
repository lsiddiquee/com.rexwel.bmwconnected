import fetch from "cross-fetch";
import { Logger } from "./Logger";

export class GeoLocation {
    static async GetAddress(apiKey: string, gpsLat: number, gpsLng: number, logger?: Logger): Promise<string | undefined> {

        logger?.LogInformation(`Resolving address for Latitude: ${gpsLat} Longitude: ${gpsLng}`);
        const tokenUrl: string = `https://revgeocode.search.hereapi.com/v1/revgeocode?apiKey=${apiKey}&at=${gpsLat},${gpsLng}`;

        const serverResponse = await fetch(tokenUrl);

        const response = await serverResponse.text();

        if (!serverResponse.ok) {
            logger?.LogError(`${serverResponse.status}: Error occurred while attempting to retrieve token. Server response: ${response}`);
            return undefined;
        }

        const address = JSON.parse(response).items[0]?.title;
        logger?.LogInformation(`Resolved address: ${address}`);

        return address;
    }
}