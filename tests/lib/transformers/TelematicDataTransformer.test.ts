/**
 * TelematicDataTransformer Tests
 *
 * Tests for transformation of BMW CarData API telematic data to generic VehicleStatus model.
 * Critical for ensuring correct data mapping, unit conversions, and handling of missing/partial data.
 */

import { TelematicDataTransformer } from '../../../lib/transformers/TelematicDataTransformer';
import type { TelematicDataPoint } from '../../../lib/models/TelematicDataPoint';
import { TelematicKey } from '../../../lib/api/TelematicKeys';
import { DriveTrainType } from '../../../lib/types/DriveTrainType';

describe('TelematicDataTransformer', () => {
  const TEST_VIN = 'WBA12345678901234';
  const TEST_TIMESTAMP = '2025-10-29T10:00:00Z';

  // Helper to create telematic data point
  const createDataPoint = (
    value: number | string | boolean,
    unit?: string
  ): TelematicDataPoint => ({
    value,
    timestamp: TEST_TIMESTAMP,
    unit,
  });

  describe('Complete Data Transformation', () => {
    it('should_transformTelematicData_when_allFieldsPresent', () => {
      // Arrange - Complete telematic data set
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
        [TelematicKey.VEHICLE_DRIVETRAIN_LASTREMAININGRANGE]: createDataPoint(350, 'km'),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE]:
          createDataPoint(52.52),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE]:
          createDataPoint(13.405),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING]:
          createDataPoint(180),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_HOOD_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_STATUS]: createDataPoint('SECURED'),
        [TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER]: createDataPoint(85),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE]:
          createDataPoint(350, 'km'),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS]:
          createDataPoint('CHARGINGACTIVE'),
        [TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS]: createDataPoint('CONNECTED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.ELECTRIC,
        telematicData
      );

      // Assert
      expect(result.vin).toBe(TEST_VIN);
      expect(result.driveTrain).toBe(DriveTrainType.ELECTRIC);
      expect(result.lastUpdatedAt).toBeInstanceOf(Date);
      expect(result.currentMileage).toBe(15000);
      expect(result.range).toBe(350);

      // Location
      expect(result.location).toBeDefined();
      expect(result.location?.coordinates.latitude).toBe(52.52);
      expect(result.location?.coordinates.longitude).toBe(13.405);
      expect(result.location?.heading).toBe(180);

      // Doors
      expect(result.doors).toBeDefined();
      expect(result.doors?.combinedState).toBe('CLOSED');
      expect(result.doors?.leftFront).toBe('CLOSED');

      // Windows
      expect(result.windows).toBeDefined();
      expect(result.windows?.combinedState).toBe('CLOSED');

      // Lock state
      expect(result.lockState).toBeDefined();
      expect(result.lockState?.isLocked).toBe(true);
      expect(result.lockState?.combinedSecurityState).toBe('SECURED');

      // Electric data
      expect(result.electric).toBeDefined();
      expect(result.electric?.chargeLevelPercent).toBe(85);
      expect(result.electric?.range).toBe(350);
      expect(result.electric?.isChargerConnected).toBe(true);
      expect(result.electric?.chargingStatus).toBe('CHARGING');
    });

    it('should_handleMissingFields_when_partialDataProvided', () => {
      // Arrange - Minimal telematic data (only mileage)
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert - Only mileage should be set
      expect(result.vin).toBe(TEST_VIN);
      expect(result.currentMileage).toBe(15000);
      expect(result.range).toBeUndefined();
      expect(result.location).toBeUndefined();
      expect(result.electric).toBeUndefined();
      expect(result.combustion).toBeUndefined();
    });

    it('should_handleEmptyData_when_noTelematicKeysProvided', () => {
      // Arrange - Empty data
      const telematicData: Record<string, TelematicDataPoint> = {};

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.PLUGIN_HYBRID,
        telematicData
      );

      // Assert - Should return minimal valid VehicleStatus
      expect(result.vin).toBe(TEST_VIN);
      expect(result.driveTrain).toBe(DriveTrainType.PLUGIN_HYBRID);
      expect(result.lastUpdatedAt).toBeInstanceOf(Date);
      expect(result.currentMileage).toBe(0); // Default to 0
      expect(result.range).toBeUndefined();
    });

    it('should_preserveTimestamps_when_transformingData', () => {
      // Arrange - Data with different timestamps
      const oldTimestamp = '2025-10-29T09:00:00Z';
      const newTimestamp = '2025-10-29T11:00:00Z';

      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
        [TelematicKey.VEHICLE_DRIVETRAIN_LASTREMAININGRANGE]: {
          value: 350,
          timestamp: newTimestamp, // Newer
          unit: 'km',
        },
        [TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER]: {
          value: 85,
          timestamp: oldTimestamp, // Older
        },
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.ELECTRIC,
        telematicData
      );

      // Assert - Should use the most recent timestamp
      expect(result.lastUpdatedAt).toBeInstanceOf(Date);
      expect(result.lastUpdatedAt.toISOString()).toBe('2025-10-29T11:00:00.000Z');
    });
  });

  describe('Location Extraction', () => {
    it('should_extractLocation_when_positionDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE]:
          createDataPoint(52.52),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE]:
          createDataPoint(13.405),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING]:
          createDataPoint(270),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.location).toBeDefined();
      expect(result.location?.coordinates.latitude).toBe(52.52);
      expect(result.location?.coordinates.longitude).toBe(13.405);
      expect(result.location?.heading).toBe(270);
    });

    it('should_returnUndefined_when_locationDataMissing', () => {
      // Arrange - No location data
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.location).toBeUndefined();
    });

    it('should_handleStringCoordinates_when_valuesAreStrings', () => {
      // Arrange - String coordinates (sometimes API returns strings)
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE]:
          createDataPoint('52.5200'),
        [TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE]:
          createDataPoint('13.4050'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.location).toBeDefined();
      expect(result.location?.coordinates.latitude).toBe(52.52);
      expect(result.location?.coordinates.longitude).toBe(13.405);
    });
  });

  describe('Door Status Extraction', () => {
    it('should_extractDoorStatus_when_doorDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_HOOD_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN]: createDataPoint('CLOSED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.doors).toBeDefined();
      expect(result.doors?.combinedState).toBe('CLOSED');
      expect(result.doors?.leftFront).toBe('CLOSED');
      expect(result.doors?.trunk).toBe('CLOSED');
    });

    it('should_setCombinedStateOpen_when_anyDoorOpen', () => {
      // Arrange - One door open
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN]: createDataPoint('OPEN'), // Open!
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_HOOD_ISOPEN]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN]: createDataPoint('CLOSED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.doors?.combinedState).toBe('OPEN');
      expect(result.doors?.rightFront).toBe('OPEN');
    });

    it('should_handleBooleanDoorValues_when_providedAsBoolean', () => {
      // Arrange - Boolean door values
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN]: createDataPoint(false),
        [TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN]: createDataPoint(true),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.doors?.leftFront).toBe('CLOSED'); // false -> CLOSED
      expect(result.doors?.rightFront).toBe('OPEN'); // true -> OPEN
    });
  });

  describe('Window Status Extraction', () => {
    it('should_extractWindowStatus_when_windowDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS]: createDataPoint('CLOSED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.windows).toBeDefined();
      expect(result.windows?.combinedState).toBe('CLOSED');
      expect(result.windows?.leftFront).toBe('CLOSED');
    });

    it('should_handleIntermediateState_when_windowPartiallyOpen', () => {
      // Arrange - One window intermediate
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS]: createDataPoint('INTERMEDIATE'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS]: createDataPoint('CLOSED'),
        [TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS]: createDataPoint('CLOSED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.windows?.combinedState).toBe('INTERMEDIATE');
      expect(result.windows?.rightFront).toBe('INTERMEDIATE');
    });
  });

  describe('Lock State Extraction', () => {
    it('should_extractLockStatus_when_lockDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_DOOR_STATUS]: createDataPoint('SECURED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.lockState).toBeDefined();
      expect(result.lockState?.isLocked).toBe(true);
      expect(result.lockState?.combinedSecurityState).toBe('SECURED');
    });

    it('should_returnUnlocked_when_statusUnlocked', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_CABIN_DOOR_STATUS]: createDataPoint('UNLOCKED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.lockState?.isLocked).toBe(false);
      expect(result.lockState?.combinedSecurityState).toBe('UNLOCKED');
    });
  });

  describe('Electric Vehicle Data Extraction', () => {
    it('should_extractBatteryLevel_when_electricVehicle', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER]: createDataPoint(75),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE]:
          createDataPoint(280, 'km'),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS]:
          createDataPoint('NOCHARGING'),
        [TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS]: createDataPoint('DISCONNECTED'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.ELECTRIC,
        telematicData
      );

      // Assert
      expect(result.electric).toBeDefined();
      expect(result.electric?.chargeLevelPercent).toBe(75);
      expect(result.electric?.range).toBe(280);
      expect(result.electric?.chargingStatus).toBe('NOT_CHARGING');
      expect(result.electric?.isChargerConnected).toBe(false);
    });

    it('should_extractChargingStatus_when_chargingDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER]: createDataPoint(50),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE]:
          createDataPoint(200, 'km'),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS]:
          createDataPoint('CHARGINGACTIVE'),
        [TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS]: createDataPoint('CONNECTED'),
        [TelematicKey.VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGET]:
          createDataPoint(80),
        [TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMETOFULLYCHARGED]:
          createDataPoint(45),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.ELECTRIC,
        telematicData
      );

      // Assert
      expect(result.electric?.chargingStatus).toBe('CHARGING');
      expect(result.electric?.isChargerConnected).toBe(true);
      expect(result.electric?.chargingTarget).toBe(80);
      expect(result.electric?.remainingChargingMinutes).toBe(45);
    });

    it('should_returnUndefined_when_noElectricData', () => {
      // Arrange - Combustion vehicle, no electric data
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.electric).toBeUndefined();
    });
  });

  describe('Combustion Vehicle Data Extraction', () => {
    it('should_extractFuelLevel_when_combustionVehicle', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_LEVEL]: createDataPoint(65), // Percentage
        [TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_REMAININGFUEL]: createDataPoint(42, 'l'), // Liters
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.combustion).toBeDefined();
      expect(result.combustion?.fuelLevelPercent).toBe(65);
      expect(result.combustion?.fuelLevelLiters).toBe(42);
    });

    it('should_returnUndefined_when_noCombustionData', () => {
      // Arrange - Electric vehicle, no fuel data
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER]: createDataPoint(85),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.ELECTRIC,
        telematicData
      );

      // Assert
      expect(result.combustion).toBeUndefined();
    });
  });

  describe('Mileage Extraction', () => {
    it('should_extractMileage_when_distanceDataAvailable', () => {
      // Arrange
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(25000, 'km'),
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.currentMileage).toBe(25000);
    });

    it('should_defaultToZero_when_mileageDataMissing', () => {
      // Arrange - No mileage data
      const telematicData: Record<string, TelematicDataPoint> = {};

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.currentMileage).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should_handleInvalidTimestamps_when_malformedDataProvided', () => {
      // Arrange - Data with invalid/missing timestamps
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: {
          value: 15000,
          timestamp: undefined as any, // Missing timestamp
          unit: 'km',
        },
      };

      // Act
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert - Should use current time as fallback
      expect(result.lastUpdatedAt).toBeInstanceOf(Date);
      expect(result.lastUpdatedAt.getTime()).toBeGreaterThan(0);
    });

    it('should_handleUnknownTelematicKeys_when_unexpectedKeysProvided', () => {
      // Arrange - Mix of known and unknown keys
      const telematicData: Record<string, TelematicDataPoint> = {
        [TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE]: createDataPoint(15000, 'km'),
        'unknown.telematic.key': createDataPoint(999), // Unknown key - should be ignored
      };

      // Act - Should not throw error
      const result = TelematicDataTransformer.transform(
        TEST_VIN,
        DriveTrainType.COMBUSTION,
        telematicData
      );

      // Assert
      expect(result.currentMileage).toBe(15000);
      // Unknown key should not break transformation
    });
  });
});
