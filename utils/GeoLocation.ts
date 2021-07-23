import fetch from "cross-fetch";
import { LocationType } from "./LocationType";
import { Logger } from "./Logger";

const EARTH_RADIUS = 6378137;
export class GeoLocation {
    static async GetAddress(location: LocationType, logger?: Logger): Promise<string | undefined> {

        logger?.LogInformation(`Resolving address for Latitude: ${location.Latitude} Longitude: ${location.Longitude}`);
        const url: string = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.Latitude}&lon=${location.Longitude}&zoom=18&addressdetails=0`;

        const serverResponse = await fetch(url, {
            headers: {
                "User-Agent": "HomeyAppBMWConnected"
            }
        });

        const response = await serverResponse.text();

        if (!serverResponse.ok) {
            logger?.LogError(`${serverResponse.status}: Error occurred while attempting to retrieve token. Server response: ${response}`);
            return undefined;
        }

        const address = JSON.parse(response)?.display_name;
        logger?.LogInformation(`Resolved address: ${address}`);

        return address;
    }

    private static degToRad(angle: number): number {
        return angle * Math.PI / 180;
    }

    private static distanceTo(from: LocationType, to: LocationType): number {
        const lat1 = GeoLocation.degToRad(from.Latitude);
        const lat2 = GeoLocation.degToRad(to.Latitude);
        const dlat = GeoLocation.degToRad(to.Latitude - from.Latitude);
        const dlon = GeoLocation.degToRad(to.Longitude - from.Longitude);

        const a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distance = EARTH_RADIUS * c

        return distance;
    }

    static IsInsideGeofence(location: LocationType, center: LocationType): boolean {
        return GeoLocation.distanceTo(center, location) <= (center.Radius ?? 20);
    }
}