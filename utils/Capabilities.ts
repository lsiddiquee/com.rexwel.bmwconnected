/**
 * Constants for all Homey capability strings used in the BMW Connected app.
 * This file centralizes all capability identifiers to avoid typos and improve maintainability.
 */
export class Capabilities {
    // Security capabilities
    public static readonly LOCKED = "locked";
    public static readonly ALARM_GENERIC = "alarm_generic";

    // Battery and charging capabilities
    public static readonly MEASURE_BATTERY = "measure_battery";
    public static readonly MEASURE_BATTERY_ACTUAL = "measure_battery.actual";
    public static readonly CHARGING_STATUS = "charging_status_capability";
    public static readonly CHARGING_CONTROL = "charging_control_capability";
    public static readonly START_CHARGING = "start_charging_capability";
    public static readonly STOP_CHARGING = "stop_charging_capability";
    public static readonly EV_CHARGING_STATE = "ev_charging_state";
    public static readonly AC_CHARGING_LIMIT = "ac_charging_limit_capability";
    public static readonly CHARGING_TARGET_SOC = "charging_target_soc_capability";

    // Range capabilities
    public static readonly RANGE = "range_capability";
    public static readonly RANGE_BATTERY = "range_capability.battery";
    public static readonly RANGE_FUEL = "range_capability.fuel";

    // Fuel capabilities
    public static readonly REMAINING_FUEL_LITERS = "remaining_fuel_liters_capability";
    public static readonly REMAINING_FUEL = "remaining_fuel_capability";
    // Note: This constant includes the typo from the original code for backward compatibility
    public static readonly REMAINING_FUEL_LITERS_TYPO = "remanining_fuel_liters_capability";

    // Location capabilities
    public static readonly LOCATION = "location_capability";
    public static readonly ADDRESS = "address_capability";

    // Vehicle information capabilities
    public static readonly MILEAGE = "mileage_capability";

    // Climate capabilities
    public static readonly CLIMATE_NOW = "climate_now_capability";
}