import { get } from "request-promise-native";

export class GeoLocation {
    static async GetAddress(gpsLat: number, gpsLng: number): Promise<string> {

        const response = await get(`https://revgeocode.search.hereapi.com/v1/revgeocode?apiKey=4ebe67LjKUJQwWCs44AAzui5pWPyFocePQAzQGvA6jk&at=${gpsLat},${gpsLng}`);

        return JSON.parse(response)?.items[0]?.title ?? "";
    }
}