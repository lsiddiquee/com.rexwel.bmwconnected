/**
 * Vehicle drive train types
 *
 * Based on bimmer_connected Python library
 */

/**
 * Different types of vehicle drive trains
 */
export enum DriveTrainType {
  /** Pure combustion engine (ICE) */
  COMBUSTION = 'COMBUSTION',

  /** Plug-in hybrid electric vehicle (PHEV) */
  PLUGIN_HYBRID = 'PLUGIN_HYBRID',

  /** Battery electric vehicle (BEV) */
  ELECTRIC = 'ELECTRIC',

  /** Electric with range extender (e.g., BMW i3 REx) */
  ELECTRIC_WITH_RANGE_EXTENDER = 'ELECTRIC_WITH_RANGE_EXTENDER',

  /** Mild hybrid (48V system) */
  MILD_HYBRID = 'MILD_HYBRID',

  /** Unknown drive train */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Drive trains that have a combustion engine (require fuel capabilities)
 */
export const COMBUSTION_ENGINE_DRIVE_TRAINS: Set<DriveTrainType> = new Set([
  DriveTrainType.COMBUSTION,
  DriveTrainType.ELECTRIC_WITH_RANGE_EXTENDER,
  DriveTrainType.PLUGIN_HYBRID,
  DriveTrainType.MILD_HYBRID,
]);

/**
 * Drive trains that have a high voltage battery (require electric capabilities)
 */
export const HV_BATTERY_DRIVE_TRAINS: Set<DriveTrainType> = new Set([
  DriveTrainType.PLUGIN_HYBRID,
  DriveTrainType.ELECTRIC,
  DriveTrainType.ELECTRIC_WITH_RANGE_EXTENDER,
]);

/**
 * Maps BMW CarData API drive train codes to DriveTrainType enum
 */
export function mapDriveTrain(apiDriveTrain?: string): DriveTrainType {
  const mapping: Record<string, DriveTrainType> = {
    BEV: DriveTrainType.ELECTRIC,
    PHEV: DriveTrainType.PLUGIN_HYBRID,
    ICE: DriveTrainType.COMBUSTION,
    MHEV: DriveTrainType.MILD_HYBRID,
    REX: DriveTrainType.ELECTRIC_WITH_RANGE_EXTENDER,
  };

  return apiDriveTrain
    ? (mapping[apiDriveTrain] ?? DriveTrainType.UNKNOWN)
    : DriveTrainType.UNKNOWN;
}
