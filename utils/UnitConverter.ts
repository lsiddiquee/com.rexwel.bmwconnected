export class UnitConverter {
    static ConvertDistance(value: number, unit: string) : number {
        if (unit === "metric") {
            return value;
        }

        // If it not metric then it is US/UK and both of them are miles.
        return Math.trunc(value * 0.621371);
    }
}