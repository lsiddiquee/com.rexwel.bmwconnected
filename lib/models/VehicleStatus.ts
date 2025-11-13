import type { DriveTrainType } from '../types/DriveTrainType';

/**
 * Generic VehicleStatus model
 *
 * Represents the current status and telematic data of a vehicle.
 * This model is designed to be generic and reusable across different APIs.
 */

/**
 * Complete vehicle status including all telematic data
 */
export interface VehicleStatus {
  /**
   * Vehicle Identification Number
   */
  vin: string;

  /**
   * Drive train type (from basic data)
   */
  driveTrain: DriveTrainType;

  /**
   * Timestamp when this status was last updated
   */
  lastUpdatedAt: Date;

  /**
   * Current mileage/odometer reading in kilometers
   */
  currentMileage?: number;

  /**
   * Remaining fuel range in kilometers
   */
  range?: number;

  /**
   * Location information
   */
  location?: LocationInfo;

  /**
   * Door states
   */
  doors?: DoorsState;

  /**
   * Window states
   */
  windows?: WindowsState;

  /**
   * Lock/security state
   */
  lockState?: LockState;

  /**
   * Electric vehicle specific data
   */
  electric?: ElectricVehicleState;

  /**
   * Combustion engine specific data
   */
  combustion?: CombustionVehicleState;

  /**
   * Climate control status
   */
  climate?: ClimateState;

  /**
   * Tire pressure information
   */
  tires?: TireState;

  /**
   * Required services/maintenance
   */
  services?: ServiceInfo[];

  /**
   * Check control messages/warnings
   */
  checkControlMessages?: CheckControlMessage[];
}

/**
 * Location information with coordinates and address
 */
export interface LocationInfo {
  coordinates: Coordinates;
  address?: Address;
  heading?: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Address {
  formatted: string;
}

/**
 * Door states for all vehicle doors
 */
export interface DoorsState {
  combinedState: DoorState;
  leftFront: DoorState;
  rightFront: DoorState;
  leftRear: DoorState;
  rightRear: DoorState;
  hood: DoorState;
  trunk: DoorState;
}

export type DoorState = 'CLOSED' | 'OPEN' | 'INVALID' | 'UNKNOWN';

/**
 * Window states for all vehicle windows
 */
export interface WindowsState {
  combinedState: WindowState;
  leftFront: WindowState;
  rightFront: WindowState;
  leftRear: WindowState;
  rightRear: WindowState;
}

export type WindowState = 'CLOSED' | 'OPEN' | 'INTERMEDIATE' | 'INVALID' | 'UNKNOWN';

/**
 * Lock and security state
 */
export interface LockState {
  combinedSecurityState: SecurityState;
  isLocked: boolean;
}

export type SecurityState = 'SECURED' | 'UNLOCKED' | 'SELECTIVE_LOCKED' | 'UNKNOWN';

/**
 * Electric vehicle specific status
 */
export interface ElectricVehicleState {
  /**
   * Battery charge level percentage (0-100)
   */
  chargeLevelPercent: number;

  /**
   * Remaining electric range in kilometers
   */
  range: number;

  /**
   * Whether charger is connected
   */
  isChargerConnected: boolean;

  /**
   * Current charging status
   */
  chargingStatus: ChargingStatus;

  /**
   * Target charge level percentage
   */
  chargingTarget?: number;

  /**
   * Estimated minutes until fully charged
   */
  remainingChargingMinutes?: number;

  /**
   * Type of charging connection
   */
  chargingConnectionType?: string;
}

export type ChargingStatus =
  | 'CHARGING'
  | 'NOT_CHARGING'
  | 'COMPLETE'
  | 'ERROR'
  | 'INVALID'
  | 'UNKNOWN';

/**
 * Combustion engine specific status
 */
export interface CombustionVehicleState {
  /**
   * Fuel level percentage (0-100)
   */
  fuelLevelPercent?: number;

  /**
   * Fuel level in liters
   */
  fuelLevelLiters?: number;
}

/**
 * Climate control status
 */
export interface ClimateState {
  /**
   * Current climate control activity
   */
  activity: ClimateActivity;

  /**
   * Scheduled climate timers
   */
  timers?: ClimateTimer[];
}

export type ClimateActivity = 'HEATING' | 'COOLING' | 'VENTILATION' | 'INACTIVE' | 'UNKNOWN';

export interface ClimateTimer {
  id?: number;
  departureTime: Time;
  isWeeklyTimer: boolean;
  timerWeekDays?: string[];
}

export interface Time {
  hour: number;
  minute: number;
}

/**
 * Tire pressure information
 */
export interface TireState {
  frontLeft: TireInfo;
  frontRight: TireInfo;
  rearLeft: TireInfo;
  rearRight: TireInfo;
}

export interface TireInfo {
  currentPressure?: number;
  targetPressure: number;
  status: TireStatus;
}

export type TireStatus = 'NORMAL' | 'LOW' | 'WARNING' | 'UNKNOWN';

/**
 * Service/maintenance information
 */
export interface ServiceInfo {
  type: string;
  status: string;
  description: string;
  dateTime?: Date;
  mileage?: number;
}

/**
 * Check control message
 */
export interface CheckControlMessage {
  type: string;
  severity: MessageSeverity;
  description?: string;
}

export type MessageSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
