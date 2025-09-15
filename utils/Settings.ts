export class Settings {
    pollingInterval: number = 60;
    refuellingTriggerThreshold: number = 5;
    distanceUnit: string = "metric";
    fuelUnit: string = "liter";
    autoRetry: boolean = false;

    // Distance in meters traveled before a location update is triggered
    locationUpdateThreshold: number = 50;

    currentVersion: string = "0.0.0";
}