export class Settings {
    pollingInterval: number = 60;
    refuellingTriggerThreshold: number = 5;
    distanceUnit: string = "metric";
    fuelUnit: string = "liter";

    // Distance in meters traveled before a location update is triggered
    locationUpdateThreshold: number = 50;

    currentVersion: string = "0.0.0";
}