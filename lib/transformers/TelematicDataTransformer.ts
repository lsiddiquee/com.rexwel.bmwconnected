/**
 * Telematic Data Transformer
 *
 * Transforms BMW CarData API telematic data responses to generic VehicleStatus model.
 * Handles telematic key mapping, unit conversions, and data normalization.
 */

import type {
  VehicleStatus,
  LocationInfo,
  DoorsState,
  DoorState,
  WindowsState,
  WindowState,
  LockState,
  ElectricVehicleState,
  ChargingStatus,
  CombustionVehicleState,
  ClimateState,
  ClimateActivity,
  TireState,
  TireStatus,
  ServiceInfo,
} from '../models/VehicleStatus';
import type { TelematicDataPoint } from '../models/TelematicDataPoint';
import { TelematicKey } from '../api/TelematicKeys';

import type { DriveTrainType } from '../types/DriveTrainType';

/**
 * Transform BMW CarData telematic data to VehicleStatus model
 */
export class TelematicDataTransformer {
  /**
   * Transform telematic data map to VehicleStatus
   *
   * @param vin - Vehicle Identification Number
   * @param driveTrain - Vehicle drive train type (from basic data)
   * @param data - Record of telematic data points
   * @returns Generic VehicleStatus object
   */
  static transform(
    vin: string,
    driveTrain: DriveTrainType,
    data: Record<string, TelematicDataPoint>
  ): VehicleStatus {
    // Find most recent timestamp
    const timestamps = Object.values(data)
      .map((p) => p.timestamp)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t));
    const lastUpdatedAt =
      timestamps.length > 0
        ? new Date(Math.max(...timestamps.map((d) => d.getTime())))
        : new Date();

    // Use the record directly for lookups
    const dataMap = data;

    // Extract vehicle status data
    const currentMileage = this.getMileage(dataMap);
    const range = this.getRange(dataMap);
    const location = this.getLocation(dataMap);
    const doors = this.getDoors(dataMap);
    const windows = this.getWindows(dataMap);
    const lockState = this.getLockState(dataMap);
    const electric = this.getElectricState(dataMap);
    const combustion = this.getCombustionState(dataMap);
    const climate = this.getClimateState(dataMap);
    const tires = this.getTireState(dataMap);
    const services = this.getServices(dataMap);

    return {
      vin,
      driveTrain,
      lastUpdatedAt,
      currentMileage,
      range,
      location,
      doors,
      windows,
      lockState,
      electric,
      combustion,
      climate,
      tires,
      services,
    };
  }

  // ...rest of the static methods remain unchanged...

  /**
   * Get mileage from telematic data
   */
  private static getMileage(dataMap: Record<string, TelematicDataPoint>): number {
    const mileagePoint = dataMap[TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE];
    if (mileagePoint && typeof mileagePoint.value === 'number') {
      return mileagePoint.value;
    }
    return 0;
  }

  /**
   * Get range from telematic data
   */
  private static getRange(dataMap: Record<string, TelematicDataPoint>): number | undefined {
    const rangePoint = dataMap[TelematicKey.VEHICLE_DRIVETRAIN_LASTREMAININGRANGE];
    if (rangePoint && typeof rangePoint.value === 'number') {
      return rangePoint.value;
    }
    return undefined;
  }

  /**
   * Get location information from telematic data
   */
  private static getLocation(
    dataMap: Record<string, TelematicDataPoint>
  ): LocationInfo | undefined {
    const latPoint =
      dataMap[TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE];
    const lonPoint =
      dataMap[TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE];
    const headingPoint =
      dataMap[TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING];

    if (!latPoint || !lonPoint) {
      return undefined;
    }

    const latitude =
      typeof latPoint.value === 'number' ? latPoint.value : parseFloat(String(latPoint.value));
    const longitude =
      typeof lonPoint.value === 'number' ? lonPoint.value : parseFloat(String(lonPoint.value));

    if (isNaN(latitude) || isNaN(longitude)) {
      return undefined;
    }

    const heading =
      headingPoint && typeof headingPoint.value === 'number'
        ? headingPoint.value
        : headingPoint
          ? parseFloat(String(headingPoint.value))
          : undefined;

    return {
      coordinates: {
        latitude,
        longitude,
      },
      heading: !isNaN(heading ?? NaN) ? heading : undefined,
    };
  }

  /**
   * Get door states from telematic data
   */
  private static getDoors(dataMap: Record<string, TelematicDataPoint>): DoorsState | undefined {
    const leftFront = this.getDoorState(
      dataMap[TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN]
    );
    const rightFront = this.getDoorState(
      dataMap[TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN]
    );
    const leftRear = this.getDoorState(dataMap[TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN]);
    const rightRear = this.getDoorState(
      dataMap[TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN]
    );
    const hood = this.getDoorState(dataMap[TelematicKey.VEHICLE_BODY_HOOD_ISOPEN]);
    const trunk = this.getDoorState(dataMap[TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN]);

    // Calculate combined state (any door open = OPEN)
    const allStates = [leftFront, rightFront, leftRear, rightRear, hood, trunk];
    const combinedState: DoorState = allStates.some((s) => s === 'OPEN')
      ? 'OPEN'
      : allStates.every((s) => s === 'CLOSED')
        ? 'CLOSED'
        : 'UNKNOWN';

    return {
      combinedState,
      leftFront,
      rightFront,
      leftRear,
      rightRear,
      hood,
      trunk,
    };
  }

  /**
   * Convert BMW door status to DoorState
   */
  private static getDoorState(point: TelematicDataPoint | undefined): DoorState {
    if (!point) {
      return 'UNKNOWN';
    }

    const value = String(point.value).toUpperCase();

    // BMW uses boolean true/false or "OPEN"/"CLOSED"
    if (value === 'TRUE' || value === 'OPEN') {
      return 'OPEN';
    }
    if (value === 'FALSE' || value === 'CLOSED') {
      return 'CLOSED';
    }

    return 'UNKNOWN';
  }

  /**
   * Get window states from telematic data
   */
  private static getWindows(dataMap: Record<string, TelematicDataPoint>): WindowsState | undefined {
    const leftFront = this.getWindowState(
      dataMap[TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS]
    );
    const rightFront = this.getWindowState(
      dataMap[TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS]
    );
    const leftRear = this.getWindowState(
      dataMap[TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS]
    );
    const rightRear = this.getWindowState(
      dataMap[TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS]
    );

    // Calculate combined state
    const allStates = [leftFront, rightFront, leftRear, rightRear];
    const combinedState: WindowState = allStates.some((s) => s === 'OPEN')
      ? 'OPEN'
      : allStates.some((s) => s === 'INTERMEDIATE')
        ? 'INTERMEDIATE'
        : allStates.every((s) => s === 'CLOSED')
          ? 'CLOSED'
          : 'UNKNOWN';

    return {
      combinedState,
      leftFront,
      rightFront,
      leftRear,
      rightRear,
    };
  }

  /**
   * Convert BMW window status to WindowState
   */
  private static getWindowState(point: TelematicDataPoint | undefined): WindowState {
    if (!point) {
      return 'UNKNOWN';
    }

    const value = String(point.value).toUpperCase();

    if (value === 'CLOSED') {
      return 'CLOSED';
    }
    if (value === 'OPEN') {
      return 'OPEN';
    }
    if (value === 'INTERMEDIATE') {
      return 'INTERMEDIATE';
    }

    return 'UNKNOWN';
  }

  /**
   * Get lock state from telematic data
   */
  private static getLockState(dataMap: Record<string, TelematicDataPoint>): LockState | undefined {
    const doorStatusPoint = dataMap[TelematicKey.VEHICLE_CABIN_DOOR_STATUS];

    // BMW provides door status: SECURED, UNLOCKED, SELECTIVE_LOCKED, etc.
    // TODO: LOCKED means locked but alarm is not armed, so we can split this later.
    const status = doorStatusPoint ? String(doorStatusPoint.value).toUpperCase() : 'UNLOCKED';
    const isLocked = status === 'SECURED' || status === 'LOCKED' || status === 'SELECTIVE_LOCKED';

    return {
      combinedSecurityState: isLocked ? 'SECURED' : 'UNLOCKED',
      isLocked,
    };
  }

  /**
   * Get electric vehicle state from telematic data
   */
  private static getElectricState(
    dataMap: Record<string, TelematicDataPoint>
  ): ElectricVehicleState | undefined {
    const socPoint = dataMap[TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER];
    const rangePoint =
      dataMap[TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE];
    const chargingStatusPoint =
      dataMap[TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS];
    const chargerConnectedPoint = dataMap[TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS];
    const targetSocPoint =
      dataMap[TelematicKey.VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGET];
    const remainingTimePoint =
      dataMap[TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMETOFULLYCHARGED];

    // If no battery data, not an electric vehicle
    if (!socPoint && !rangePoint) {
      return undefined;
    }

    const chargeLevelPercent = socPoint && typeof socPoint.value === 'number' ? socPoint.value : 0;
    const range = rangePoint && typeof rangePoint.value === 'number' ? rangePoint.value : 0;

    const isChargerConnected = chargerConnectedPoint
      ? String(chargerConnectedPoint.value).toUpperCase() === 'CONNECTED'
      : false;

    const chargingStatus = this.getChargingStatus(chargingStatusPoint);

    const chargingTarget =
      targetSocPoint && typeof targetSocPoint.value === 'number' ? targetSocPoint.value : undefined;

    const remainingChargingMinutes =
      remainingTimePoint && typeof remainingTimePoint.value === 'number'
        ? // ? Math.round(remainingTimePoint.value / 60) // Convert seconds to minutes
          Math.round(remainingTimePoint.value) // It is in minutes already
        : undefined;

    return {
      chargeLevelPercent,
      range,
      isChargerConnected,
      chargingStatus,
      chargingTarget,
      remainingChargingMinutes,
    };
  }

  /**
   * Convert BMW charging status to ChargingStatus
   */
  private static getChargingStatus(point: TelematicDataPoint | undefined): ChargingStatus {
    // NOCHARGING, CHARGINGACTIVE, CHARGINGENDED
    if (!point) {
      return 'UNKNOWN';
    }

    const value = String(point.value).toUpperCase();

    if (
      value.includes('CHARGING') &&
      !value.includes('NOT') &&
      !value.includes('NO') &&
      !value.includes('ENDED')
    ) {
      return 'CHARGING';
    }
    if (
      value.includes('NOT_CHARGING') ||
      value.includes('NOT CHARGING') ||
      value === 'NOCHARGING'
    ) {
      return 'NOT_CHARGING';
    }
    if (value.includes('COMPLETE') || value.includes('FINISHED') || value.includes('ENDED')) {
      return 'COMPLETE';
    }
    if (value.includes('ERROR') || value.includes('FAULT')) {
      return 'ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Get combustion engine state from telematic data
   */
  private static getCombustionState(
    dataMap: Record<string, TelematicDataPoint>
  ): CombustionVehicleState | undefined {
    const fuelLevelPercentPoint = dataMap[TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_LEVEL];
    const fuelLevelPoint = dataMap[TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_REMAININGFUEL];

    // If no fuel data, not a combustion vehicle (or data not available)
    if (!fuelLevelPercentPoint && !fuelLevelPoint) {
      return undefined;
    }

    const fuelLevelPercent =
      fuelLevelPercentPoint && typeof fuelLevelPercentPoint.value === 'number'
        ? fuelLevelPercentPoint.value
        : undefined;

    const fuelLevelLiters =
      fuelLevelPoint && typeof fuelLevelPoint.value === 'number' ? fuelLevelPoint.value : undefined;

    return {
      fuelLevelPercent,
      fuelLevelLiters,
    };
  }

  /**
   * Get climate control state from telematic data
   */
  private static getClimateState(
    dataMap: Record<string, TelematicDataPoint>
  ): ClimateState | undefined {
    const activityPoint = dataMap[TelematicKey.VEHICLE_VEHICLE_PRECONDITIONING_ACTIVITY];
    const comfortStatePoint =
      dataMap[TelematicKey.VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_COMFORTSTATE];

    if (!activityPoint && !comfortStatePoint) {
      return undefined;
    }

    const activity = this.getClimateActivity(activityPoint);

    return {
      activity,
    };
  }

  /**
   * Convert BMW climate activity to ClimateActivity
   */
  private static getClimateActivity(point: TelematicDataPoint | undefined): ClimateActivity {
    if (!point) {
      return 'INACTIVE';
    }

    const value = String(point.value).toUpperCase();

    if (value.includes('HEAT')) {
      return 'HEATING';
    }
    if (value.includes('COOL')) {
      return 'COOLING';
    }
    if (value.includes('VENTILAT')) {
      return 'VENTILATION';
    }
    if (value.includes('INACTIVE') || value === 'FALSE' || value === 'OFF') {
      return 'INACTIVE';
    }

    return 'UNKNOWN';
  }

  /**
   * Get tire state from telematic data
   */
  private static getTireState(dataMap: Record<string, TelematicDataPoint>): TireState | undefined {
    const frontLeftPressure =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURE];
    const frontLeftTarget =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURETARGET];
    const frontRightPressure =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURE];
    const frontRightTarget =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURETARGET];
    const rearLeftPressure =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURE];
    const rearLeftTarget =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURETARGET];
    const rearRightPressure =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURE];
    const rearRightTarget =
      dataMap[TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURETARGET];

    // If no tire data, return undefined
    if (!frontLeftPressure && !frontRightPressure && !rearLeftPressure && !rearRightPressure) {
      return undefined;
    }

    return {
      frontLeft: this.getTireInfo(frontLeftPressure, frontLeftTarget),
      frontRight: this.getTireInfo(frontRightPressure, frontRightTarget),
      rearLeft: this.getTireInfo(rearLeftPressure, rearLeftTarget),
      rearRight: this.getTireInfo(rearRightPressure, rearRightTarget),
    };
  }

  /**
   * Create TireInfo from pressure data points
   */
  private static getTireInfo(
    currentPoint: TelematicDataPoint | undefined,
    targetPoint: TelematicDataPoint | undefined
  ): {
    currentPressure?: number;
    targetPressure: number;
    status: TireStatus;
  } {
    const currentPressure =
      currentPoint && typeof currentPoint.value === 'number' ? currentPoint.value : undefined;

    const targetPressure =
      targetPoint && typeof targetPoint.value === 'number' ? targetPoint.value : 0;

    // Determine status based on pressure difference
    let status: TireStatus = 'UNKNOWN';
    if (currentPressure !== undefined && targetPressure > 0) {
      const diffPercent = ((targetPressure - currentPressure) / targetPressure) * 100;
      if (diffPercent > 20) {
        status = 'WARNING';
      } else if (diffPercent > 10) {
        status = 'LOW';
      } else {
        status = 'NORMAL';
      }
    }

    return {
      currentPressure,
      targetPressure,
      status,
    };
  }

  /**
   * Get service information from telematic data
   */
  private static getServices(
    dataMap: Record<string, TelematicDataPoint>
  ): ServiceInfo[] | undefined {
    const servicesCountPoint = dataMap[TelematicKey.VEHICLE_STATUS_CONDITIONBASEDSERVICESCOUNT];
    if (!servicesCountPoint) {
      return undefined;
    }
    // BMW provides count but not details in standard telematic data
    // Would need separate endpoint for detailed service data
    // Return empty array if count is provided
    return [];
  }
}
