import { LocationTrigger } from "./LocationTrigger";

export class Settings {
    pollingInterval: number = 60;
    updateLocationTrigger: LocationTrigger = LocationTrigger.Locked;
}