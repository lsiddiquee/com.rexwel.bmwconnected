export class UnitConverter {
    static ConvertDistance(value: number, unit: string) : number {
        if (unit === "metric") {
            return value;
        }

        // If it is not metric then it is US/UK and both of them are miles.
        return Math.round(value * 0.621371);
    }

    static ConvertFuel(value: number, unit: string) : number {
        if (unit === "gallonUS") {
            return Math.round(value * 0.264172);
        } else if (unit === "gallonUK") {
            return Math.round(value * 0.219969);
        }

        // If it is not us/uk gallon then it is liter.
        return value;
    }
}