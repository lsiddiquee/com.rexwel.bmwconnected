/**
 * BMW CarData API Telematic Keys
 *
 * Auto-generated from TelematicKeys.json
 * Total keys: 244
 * Categories: 12
 *
 * @see https://api-cardata.bmwgroup.com
 * @generated 2025-10-17T12:10:08.557Z
 */

/** Telematic key descriptor with category and description */
export interface TelematicKeyDescriptor {
  /** Full telematic key (e.g., "vehicle.body.hood.isOpen") */
  key: string;
  /** Human-readable description */
  description: string;
  /** Category enum value */
  category: TelematicCategory;
}

/** Telematic key categories */
export enum TelematicCategory {
  /** Body elements (hood, trunk, lights, charging port) (17 keys) */
  BODY = 'body',
  /** Cabin elements (doors, windows, seats, HVAC, infotainment) (90 keys) */
  CABIN = 'cabin',
  /** Data channel information (4 keys) */
  CHANNEL = 'channel',
  /** Chassis and tire information (12 keys) */
  CHASSIS = 'chassis',
  /** Drivetrain (engine, battery, fuel, transmission) (45 keys) */
  DRIVETRAIN = 'drivetrain',
  /** Electrical system (12V battery) (3 keys) */
  ELECTRICAL_SYSTEM = 'electricalSystem',
  /** ECU diagnostic information (1 keys) */
  ELECTRONIC_CONTROL_UNIT = 'electronicControlUnit',
  /** Vehicle movement status (1 keys) */
  IS_MOVING = 'isMoving',
  /** Powertrain electric components (38 keys) */
  POWERTRAIN = 'powertrain',
  /** Vehicle status and service information (6 keys) */
  STATUS = 'status',
  /** Trip data and driving statistics (10 keys) */
  TRIP = 'trip',
  /** General vehicle information and settings (17 keys) */
  VEHICLE = 'vehicle',
}

/** All telematic keys as enum */
export enum TelematicKey {
  /** This value indicates whether the vehicle was connected to a DC charging plug at the time of data ... */
  VEHICLE_BODY_CHARGINGPORT_DCSTATUS = 'vehicle.body.chargingPort.dcStatus',
  /** This value indicates whether the charging plug is automatically unlocked (HOSPITALITY_ACTIVE) or ... */
  VEHICLE_BODY_CHARGINGPORT_ISHOSPITALITYACTIVE = 'vehicle.body.chargingPort.isHospitalityActive',
  /** Unique identifier which increases each time the customer plugs in his electrified vehicle (EXCEPT... */
  VEHICLE_BODY_CHARGINGPORT_PLUGEVENTID = 'vehicle.body.chargingPort.plugEventId',
  /** This value indicates whether the vehicle was connected to a charging plug at the time of data col... */
  VEHICLE_BODY_CHARGINGPORT_STATUS = 'vehicle.body.chargingPort.status',
  /** Required alongside Vehicle.Body.ChargingPort.Status to ensure correct handling of charging sessio... */
  VEHICLE_BODY_CHARGINGPORT_STATUSCLEARTEXT = 'vehicle.body.chargingPort.statusClearText',
  /** This value indicates whether the charging flap is locked at the time of data collection. */
  VEHICLE_BODY_FLAP_ISLOCKED = 'vehicle.body.flap.isLocked',
  /** This value indicates whether the charging flap is locked independently of the central locking at ... */
  VEHICLE_BODY_FLAP_ISPERMANENTLYUNLOCKED = 'vehicle.body.flap.isPermanentlyUnlocked',
  /** This value indicates whether the vehicle's hood was closed at the time of data collection (CLOSED... */
  VEHICLE_BODY_HOOD_ISOPEN = 'vehicle.body.hood.isOpen',
  /** This value indicates whether the vehicle light was on or off at the time of data collection or wh... */
  VEHICLE_BODY_LIGHTS_ISRUNNINGON = 'vehicle.body.lights.isRunningOn',
  /** Trunk door state. */
  VEHICLE_BODY_TRUNK_DOOR_ISOPEN = 'vehicle.body.trunk.door.isOpen',
  /** Indicated weather the trunk is locked or not. */
  VEHICLE_BODY_TRUNK_ISLOCKED = 'vehicle.body.trunk.isLocked',
  /** This value indicates whether the boot lid was open (OPEN), half-open (INTERMEDIATE) or closed (CL... */
  VEHICLE_BODY_TRUNK_ISOPEN = 'vehicle.body.trunk.isOpen',
  /** Left door of trunk state. */
  VEHICLE_BODY_TRUNK_LEFT_DOOR_ISOPEN = 'vehicle.body.trunk.left.door.isOpen',
  /** Lower door of trunk state. */
  VEHICLE_BODY_TRUNK_LOWER_DOOR_ISOPEN = 'vehicle.body.trunk.lower.door.isOpen',
  /** Right door of trunk state. */
  VEHICLE_BODY_TRUNK_RIGHT_DOOR_ISOPEN = 'vehicle.body.trunk.right.door.isOpen',
  /** Upper door of trunk state. */
  VEHICLE_BODY_TRUNK_UPPER_DOOR_ISOPEN = 'vehicle.body.trunk.upper.door.isOpen',
  /** This value indicates whether the rear window is unlocked (TRUE) or closed (FALSE). */
  VEHICLE_BODY_TRUNK_WINDOW_ISOPEN = 'vehicle.body.trunk.window.isOpen',
  /** Timer State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when commu... */
  VEHICLE_CABIN_CLIMATE_TIMERS_OVERWRITETIMER_ACTION = 'vehicle.cabin.climate.timers.overwriteTimer.action',
  /** Hour setting of climate timer as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_OVERWRITETIMER_HOUR = 'vehicle.cabin.climate.timers.overwriteTimer.hour',
  /** Minute setting of climate timer as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_OVERWRITETIMER_MINUTE = 'vehicle.cabin.climate.timers.overwriteTimer.minute',
  /** Timer 1 State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when com... */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER1_ACTION = 'vehicle.cabin.climate.timers.weekdaysTimer1.action',
  /** Hour setting of climate timer 1 as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER1_HOUR = 'vehicle.cabin.climate.timers.weekdaysTimer1.hour',
  /** Minute setting of climate timer 1 as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER1_MINUTE = 'vehicle.cabin.climate.timers.weekdaysTimer1.minute',
  /** Timer 2 State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when com... */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER2_ACTION = 'vehicle.cabin.climate.timers.weekdaysTimer2.action',
  /** Hour setting of climate timer 2 as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER2_HOUR = 'vehicle.cabin.climate.timers.weekdaysTimer2.hour',
  /** Minute setting of climate timer 2 as per vehicle-configured timezone. */
  VEHICLE_CABIN_CLIMATE_TIMERS_WEEKDAYSTIMER2_MINUTE = 'vehicle.cabin.climate.timers.weekdaysTimer2.minute',
  /** Convertible Roof Retractable State. BMW Mini vehicles have the additionally option to only open t... */
  VEHICLE_CABIN_CONVERTIBLE_ROOFRETRACTABLESTATUS = 'vehicle.cabin.convertible.roofRetractableStatus',
  /** Indicates the current status of the convertible roof at the time of data collection, e.g. whether... */
  VEHICLE_CABIN_CONVERTIBLE_ROOFSTATUS = 'vehicle.cabin.convertible.roofStatus',
  /** This value indicates whether the front left door was closed at the time of data collection (CLOSE... */
  VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN = 'vehicle.cabin.door.row1.driver.isOpen',
  /** Driver-side front door opening position in percent. 0% represents fully closed and 100% represent... */
  VEHICLE_CABIN_DOOR_ROW1_DRIVER_POSITION = 'vehicle.cabin.door.row1.driver.position',
  /** This value indicates whether the front right door was closed at the time of data collection (CLOS... */
  VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN = 'vehicle.cabin.door.row1.passenger.isOpen',
  /** Passenger-side front door opening position in percent. 0% represents fully closed and 100% repres... */
  VEHICLE_CABIN_DOOR_ROW1_PASSENGER_POSITION = 'vehicle.cabin.door.row1.passenger.position',
  /** This value indicates whether the rear left door was closed at the time of data collection (CLOSED... */
  VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN = 'vehicle.cabin.door.row2.driver.isOpen',
  /** Driver-side rear door opening position in percent. 0% represents fully closed and 100% represents... */
  VEHICLE_CABIN_DOOR_ROW2_DRIVER_POSITION = 'vehicle.cabin.door.row2.driver.position',
  /** This value indicates whether the rear right door was closed at the time of data collection (CLOSE... */
  VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN = 'vehicle.cabin.door.row2.passenger.isOpen',
  /** Passenger-side rear door opening position in percent. 0% represents fully closed and 100% represe... */
  VEHICLE_CABIN_DOOR_ROW2_PASSENGER_POSITION = 'vehicle.cabin.door.row2.passenger.position',
  /** This value indicates the status of the doors, but is only sporadically recorded and transmitted. ... */
  VEHICLE_CABIN_DOOR_STATUS = 'vehicle.cabin.door.status',
  /** Default settings for front driver seat cooling/ventilation of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW1_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.driverSide.cooling',
  /** Default settings for front driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW1_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.driverSide.heating',
  /** Default settings for front passenger seat cooling/ventilation of the seat for climate preconditio... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW1_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.passengerSide.cooling',
  /** Default settings for front passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW1_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.passengerSide.heating',
  /** Default settings for rear driver seat cooling/ventilation of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW2_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.driverSide.cooling',
  /** Default settings for rear driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW2_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.driverSide.heating',
  /** Default settings for rear passenger seat cooling/ventilation of the seat for climate precondition... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW2_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.passengerSide.cooling',
  /** Default settings for rear passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW2_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.passengerSide.heating',
  /** Default settings for third row driver seat cooling/ventilation of the seat for climate preconditi... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW3_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.driverSide.cooling',
  /** Default settings for third row driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW3_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.driverSide.heating',
  /** Default settings for third row passenger seat cooling/ventilation of the seat for climate precond... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW3_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.passengerSide.cooling',
  /** Default settings for third row passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_SEAT_ROW3_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.passengerSide.heating',
  /** Default settings for steering wheel heating for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_STEERINGWHEEL_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.steeringWheel.heating',
  /** Default settings for target temperature for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DEFAULTSETTINGS_TARGETTEMPERATURE = 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.targetTemperature',
  /** DirectStart settings for front driver seat cooling/ventilation of the seat for climate preconditi... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW1_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.driverSide.cooling',
  /** DirectStart settings for front driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW1_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.driverSide.heating',
  /** DirectStart settings for front passenger seat cooling/ventilation of the seat for climate precond... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW1_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.passengerSide.cooling',
  /** DirectStart settings for front passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW1_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.passengerSide.heating',
  /** DirectStart settings for rear driver seat cooling/ventilation of the seat for climate preconditio... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW2_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.driverSide.cooling',
  /** DirectStart settings for rear driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW2_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.driverSide.heating',
  /** DirectStart settings for rear passenger seat cooling/ventilation of the seat for climate precondi... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW2_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.passengerSide.cooling',
  /** DirectStart settings for rear passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW2_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.passengerSide.heating',
  /** DirectStart settings for third row driver seat cooling/ventilation of the seat for climate precon... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW3_DRIVERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.driverSide.cooling',
  /** DirectStart settings for third row driver seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW3_DRIVERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.driverSide.heating',
  /** DirectStart settings for third row passenger seat cooling/ventilation of the seat for climate pre... */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW3_PASSENGERSIDE_COOLING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.passengerSide.cooling',
  /** DirectStart settings for third row passenger seat heating of the seat for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_SEAT_ROW3_PASSENGERSIDE_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.passengerSide.heating',
  /** DirectStart settings for steering wheel heating for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_STEERINGWHEEL_HEATING = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.steeringWheel.heating',
  /** DirectStart settings for target temperature for climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_CONFIGURATION_DIRECTSTARTSETTINGS_TARGETTEMPERATURE = 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.targetTemperature',
  /** Status of the comfort state of the climate preconditioning. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_COMFORTSTATE = 'vehicle.cabin.hvac.preconditioning.status.comfortState',
  /** Current status of the exterior mirror heating. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_ISEXTERIORMIRRORHEATINGACTIVE = 'vehicle.cabin.hvac.preconditioning.status.isExteriorMirrorHeatingActive',
  /** Progress of the currently active climate preconditioning in percent. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_PROGRESS = 'vehicle.cabin.hvac.preconditioning.status.progress',
  /** Current status of the rear window heating. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_REARDEFROSTACTIVE = 'vehicle.cabin.hvac.preconditioning.status.rearDefrostActive',
  /** Remaining runtime of climate preconditioning in seconds. */
  VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_REMAININGRUNNINGTIME = 'vehicle.cabin.hvac.preconditioning.status.remainingRunningTime',
  /** Actual status of the air purification. */
  VEHICLE_CABIN_HVAC_STATUSAIRPURIFICATION = 'vehicle.cabin.hvac.statusAirPurification',
  /** This value indicates the units (kilometres or miles) in which distances are indicated on the vehi... */
  VEHICLE_CABIN_INFOTAINMENT_DISPLAYUNIT_DISTANCE = 'vehicle.cabin.infotainment.displayUnit.distance',
  /** Distance unit used in the current HMI */
  VEHICLE_CABIN_INFOTAINMENT_HMI_DISTANCEUNIT = 'vehicle.cabin.infotainment.hmi.distanceUnit',
  /** This value indicates whether a mobile phone was linked to the vehicle at the time of data collect... */
  VEHICLE_CABIN_INFOTAINMENT_ISMOBILEPHONECONNECTED = 'vehicle.cabin.infotainment.isMobilePhoneConnected',
  /** This value indicates the height of the vehicle above sea-level at the time of data collection.
T... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_ALTITUDE = 'vehicle.cabin.infotainment.navigation.currentLocation.altitude',
  /** GPS fix status. "NO_FIX" means when less than 3 satellites are found. "2D_GPS_FIX" is obtained wh... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_FIXSTATUS = 'vehicle.cabin.infotainment.navigation.currentLocation.fixStatus',
  /** This value indicates the orientation of the vehicle in degrees at the time of data collection. If... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING = 'vehicle.cabin.infotainment.navigation.currentLocation.heading',
  /** This value indicates the degree of latitude at which the vehicle was at the time of data collecti... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE = 'vehicle.cabin.infotainment.navigation.currentLocation.latitude',
  /** This value indicates the degree of longitude at which the vehicle was at the time of data collect... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE = 'vehicle.cabin.infotainment.navigation.currentLocation.longitude',
  /** Number of GPS satellites used for positioning and relates to the reliability of the positioning. */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_NUMBEROFSATELLITES = 'vehicle.cabin.infotainment.navigation.currentLocation.numberOfSatellites',
  /** This value indicates the arrival time at the navigation destination and is given in hours and min... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_DESTINATIONSET_ARRIVALTIME = 'vehicle.cabin.infotainment.navigation.destinationSet.arrivalTime',
  /** This value indicates the distance to the active navigation destination in kilometres or miles at ... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_DESTINATIONSET_DISTANCE = 'vehicle.cabin.infotainment.navigation.destinationSet.distance',
  /** This value indicates how many POIs (points of interest) are still open in the navigation system. */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_POINTSOFINTERESTS_AVAILABLE = 'vehicle.cabin.infotainment.navigation.pointsOfInterests.available',
  /** This value indicates how many POIs (points of interest) can be stored in the navigation system. */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_POINTSOFINTERESTS_MAX = 'vehicle.cabin.infotainment.navigation.pointsOfInterests.max',
  /** This value indicates the remaining range of fuel in kilometres or miles at the time of data colle... */
  VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_REMAININGRANGE = 'vehicle.cabin.infotainment.navigation.remainingRange',
  /** Front driver seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW1_DRIVERSIDE_COOLING = 'vehicle.cabin.seat.row1.driverSide.cooling',
  /** Front driver seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW1_DRIVERSIDE_HEATING = 'vehicle.cabin.seat.row1.driverSide.heating',
  /** Front passenger seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW1_PASSENGERSIDE_COOLING = 'vehicle.cabin.seat.row1.passengerSide.cooling',
  /** Front passenger seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW1_PASSENGERSIDE_HEATING = 'vehicle.cabin.seat.row1.passengerSide.heating',
  /** Rear driver seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW2_DRIVERSIDE_COOLING = 'vehicle.cabin.seat.row2.driverSide.cooling',
  /** Rear driver seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW2_DRIVERSIDE_HEATING = 'vehicle.cabin.seat.row2.driverSide.heating',
  /** Rear passenger seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW2_PASSENGERSIDE_COOLING = 'vehicle.cabin.seat.row2.passengerSide.cooling',
  /** Rear passenger seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW2_PASSENGERSIDE_HEATING = 'vehicle.cabin.seat.row2.passengerSide.heating',
  /** Third row driver seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW3_DRIVERSIDE_COOLING = 'vehicle.cabin.seat.row3.driverSide.cooling',
  /** Third row driver seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW3_DRIVERSIDE_HEATING = 'vehicle.cabin.seat.row3.driverSide.heating',
  /** Third row passenger seat Cooling. 0 = off. +100 = max cold. */
  VEHICLE_CABIN_SEAT_ROW3_PASSENGERSIDE_COOLING = 'vehicle.cabin.seat.row3.passengerSide.cooling',
  /** Third row passenger seat heating. 0 = off. +100 = max heat. */
  VEHICLE_CABIN_SEAT_ROW3_PASSENGERSIDE_HEATING = 'vehicle.cabin.seat.row3.passengerSide.heating',
  /** Actual value of the steering wheel heating in percent. */
  VEHICLE_CABIN_STEERINGWHEEL_HEATING = 'vehicle.cabin.steeringWheel.heating',
  /** Overall status of the vehicle's sunroof. */
  VEHICLE_CABIN_SUNROOF_OVERALLSTATUS = 'vehicle.cabin.sunroof.overallStatus',
  /** Openingt state of the sunroof in percent. -100 means full tilt position. 0% represents fully clos... */
  VEHICLE_CABIN_SUNROOF_RELATIVEPOSITION = 'vehicle.cabin.sunroof.relativePosition',
  /** Item position. 0 = Start position 100 = End position. */
  VEHICLE_CABIN_SUNROOF_SHADE_POSITION = 'vehicle.cabin.sunroof.shade.position',
  /** This value indicates whether the sunroof (if the vehicle has one) was open (OPEN), half-open (INT... */
  VEHICLE_CABIN_SUNROOF_STATUS = 'vehicle.cabin.sunroof.status',
  /** This value indicates whether the sunroof (if the vehicle has one) was tilted (OPEN), half-tilted ... */
  VEHICLE_CABIN_SUNROOF_TILTSTATUS = 'vehicle.cabin.sunroof.tiltStatus',
  /** This value indicates whether the front left window was open (OPEN), half-open (INTERMEDIATE) or c... */
  VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS = 'vehicle.cabin.window.row1.driver.status',
  /** This value indicates whether the front right window was open (OPEN), half-open (INTERMEDIATE) or ... */
  VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS = 'vehicle.cabin.window.row1.passenger.status',
  /** This value indicates whether the rear left window was open (OPEN), half-open (INTERMEDIATE) or cl... */
  VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS = 'vehicle.cabin.window.row2.driver.status',
  /** This value indicates whether the rear right window was open (OPEN), half-open (INTERMEDIATE) or c... */
  VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS = 'vehicle.cabin.window.row2.passenger.status',
  /** These values indicate the time shown in the vehicle at the time of recording the data. */
  VEHICLE_CHANNEL_NGTP_TIMEVEHICLE = 'vehicle.channel.ngtp.timeVehicle',
  /** This value indicates at what time an Automatic Service Call (ASC) was initiated by the vehicle. */
  VEHICLE_CHANNEL_TELESERVICE_LASTAUTOMATICSERVICECALLTIME = 'vehicle.channel.teleservice.lastAutomaticServiceCallTime',
  /** This value indicates at what time the teleservice report call was initiated by the vehicle. The v... */
  VEHICLE_CHANNEL_TELESERVICE_LASTTELESERVICEREPORTTIME = 'vehicle.channel.teleservice.lastTeleserviceReportTime',
  /** This value indicates whether teleservices are available for this vehicle. */
  VEHICLE_CHANNEL_TELESERVICE_STATUS = 'vehicle.channel.teleservice.status',
  /** This value indicates the measured tyre pressure on the front left in kPa */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURE = 'vehicle.chassis.axle.row1.wheel.left.tire.pressure',
  /** This value indicates the target tyre pressure on the front left in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURETARGET = 'vehicle.chassis.axle.row1.wheel.left.tire.pressureTarget',
  /** Tire temperature in Celsius on the front left. */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_TEMPERATURE = 'vehicle.chassis.axle.row1.wheel.left.tire.temperature',
  /** This value indicates the measured tyre pressure on the front right in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURE = 'vehicle.chassis.axle.row1.wheel.right.tire.pressure',
  /** This value indicates the target tyre pressure on the front right in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURETARGET = 'vehicle.chassis.axle.row1.wheel.right.tire.pressureTarget',
  /** Tire temperature in Celsius on the front right. */
  VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_TEMPERATURE = 'vehicle.chassis.axle.row1.wheel.right.tire.temperature',
  /** This value indicates the measured tyre pressure on the rear left in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURE = 'vehicle.chassis.axle.row2.wheel.left.tire.pressure',
  /** This value indicates the target tyre pressure on the rear left in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURETARGET = 'vehicle.chassis.axle.row2.wheel.left.tire.pressureTarget',
  /** Tire temperature in Celsius on the rear left. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_TEMPERATURE = 'vehicle.chassis.axle.row2.wheel.left.tire.temperature',
  /** This value indicates the measured tyre pressure on the rear right in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURE = 'vehicle.chassis.axle.row2.wheel.right.tire.pressure',
  /** This value indicates the target tyre pressure on the rear right in kPa. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURETARGET = 'vehicle.chassis.axle.row2.wheel.right.tire.pressureTarget',
  /** Tire temperature in Celsius on the rear right. */
  VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_TEMPERATURE = 'vehicle.chassis.axle.row2.wheel.right.tire.temperature',
  /** This value indicates the average electric consumption in [kWh/100 km or mi/kWh] at the time of da... */
  VEHICLE_DRIVETRAIN_AVGELECTRICRANGECONSUMPTION = 'vehicle.drivetrain.avgElectricRangeConsumption',
  /** This value indicates the size of the installed high-voltage battery. */
  VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_BATTERYSIZEMAX = 'vehicle.drivetrain.batteryManagement.batterySizeMax',
  /** This value indicates the current charging status of the vehicle at the time of data collection. */
  VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER = 'vehicle.drivetrain.batteryManagement.header',
  /** This value indicates the current energy content of the high-voltage battery. */
  VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_MAXENERGY = 'vehicle.drivetrain.batteryManagement.maxEnergy',
  /** This value indicates the maximum charging current for the most recent charging process in ampere ... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ACAMPERE = 'vehicle.drivetrain.electricEngine.charging.acAmpere',
  /** Response of ac restriction. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ACRESTRICTION_FACTOR = 'vehicle.drivetrain.electricEngine.charging.acRestriction.factor',
  /** The first value indicates whether the charging current used to charge the vehicle is limited.

T... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ACRESTRICTION_ISCHOSEN = 'vehicle.drivetrain.electricEngine.charging.acRestriction.isChosen',
  /** This value indicates the charging voltage for the most recent charging process (only when chargin... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ACVOLTAGE = 'vehicle.drivetrain.electricEngine.charging.acVoltage',
  /** Plug & Charge (Automatic Payment of Charging Services) authorization status of a charging session... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_AUTHENTICATION_STATUS = 'vehicle.drivetrain.electricEngine.charging.authentication.status',
  /** Current charging mode. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_CHARGINGMODE = 'vehicle.drivetrain.electricEngine.charging.chargingMode',
  /** This value indicates the charging process (CONDUCTIVE/INDUCTIVE) used to charge the vehicle at th... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_CONNECTIONTYPE = 'vehicle.drivetrain.electricEngine.charging.connectionType',
  /** Current condition of charging plug across all types (inductive, conductive), modes (AC, DC) and s... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_CONNECTORSTATUS = 'vehicle.drivetrain.electricEngine.charging.connectorStatus',
  /** This value indicates the total energy supplied using charging cables. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_CONSUMPTIONOVERLIFETIME_OVERALL_GRIDENERGY = 'vehicle.drivetrain.electricEngine.charging.consumptionOverLifeTime.overall.gridEnergy',
  /** This value indicates the reason why a charging process was ended. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_HVPMFINISHREASON = 'vehicle.drivetrain.electricEngine.charging.hvpmFinishReason',
  /** Charging HV Status. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_HVSTATUS = 'vehicle.drivetrain.electricEngine.charging.hvStatus',
  /** This parameter contains the information that customer selected charging mode is overwritten due t... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ISIMMEDIATECHARGINGSYSTEMREASON = 'vehicle.drivetrain.electricEngine.charging.isImmediateChargingSystemReason',
  /** This value indicates whether the “instant charging” function is activated. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ISSINGLEIMMEDIATECHARGING = 'vehicle.drivetrain.electricEngine.charging.isSingleImmediateCharging',
  /** Reason of the last charging process. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_LASTCHARGINGREASON = 'vehicle.drivetrain.electricEngine.charging.lastChargingReason',
  /** Result of the last charging process. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_LASTCHARGINGRESULT = 'vehicle.drivetrain.electricEngine.charging.lastChargingResult',
  /** This value describes whether the vehicle was charged with direct current (DC) or alternating curr... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_METHOD = 'vehicle.drivetrain.electricEngine.charging.method',
  /** This parameter contains the information of deviation to the customer selected charging mode due t... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_MODEDEVIATION = 'vehicle.drivetrain.electricEngine.charging.modeDeviation',
  /** This value indicates the number of phases in which the high-voltage battery will be charged. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PHASENUMBER = 'vehicle.drivetrain.electricEngine.charging.phaseNumber',
  /** Climatization Activation of Vehicle in Charging Profile, vehicle interior gets preconditioned for... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_CLIMATIZATIONACTIVE = 'vehicle.drivetrain.electricEngine.charging.profile.climatizationActive',
  /** Vehicles with a complete RCP (Remote Charging Profile) Configuration explicitly send values for a... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_ISRCPCONFIGCOMPLETE = 'vehicle.drivetrain.electricEngine.charging.profile.isRcpConfigComplete',
  /** The charging profile provides information about the charging mode most recently selected for your... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_MODE = 'vehicle.drivetrain.electricEngine.charging.profile.mode',
  /** Charging preference of current charging profile. This value depends on charge mode selection. For... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_PREFERENCE = 'vehicle.drivetrain.electricEngine.charging.profile.preference',
  /** Information if the upcoming departure time is relevant for the professional mode (bidirectional/u... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_SETTINGS_BIDIRECTIONALCHARGING_DEPARTURETIMERELEVANT = 'vehicle.drivetrain.electricEngine.charging.profile.settings.biDirectionalCharging.departureTimeRelevant',
  /** Allowing discharging in professional mode for the bidirectional power transfer function (BPT) is ... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_SETTINGS_BIDIRECTIONALCHARGING_DISCHARGEALLOWED = 'vehicle.drivetrain.electricEngine.charging.profile.settings.biDirectionalCharging.dischargeAllowed',
  /** Charging profile timer type (e.g., Weekdays or TwoTimesTimer) */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_PROFILE_TIMERTYPE = 'vehicle.drivetrain.electricEngine.charging.profile.timerType',
  /** Reason for the end of charging, from SP25 on. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_REASONCHARGINGEND = 'vehicle.drivetrain.electricEngine.charging.reasonChargingEnd',
  /** Indicates the charging status in cases where e-route charging is used by the customer for his jou... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_ROUTEOPTIMIZEDCHARGINGSTATUS = 'vehicle.drivetrain.electricEngine.charging.routeOptimizedChargingStatus',
  /** This value indicates the amount of energy required to fully charge the battery. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_SMEENERGYDELTAFULLYCHARGED = 'vehicle.drivetrain.electricEngine.charging.smeEnergyDeltaFullyCharged',
  /** This value indicates the current charging status of the vehicle at the time of data collection.
... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS = 'vehicle.drivetrain.electricEngine.charging.status',
  /** This value indicates the estimated remaining charging time in minutes. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMEREMAINING = 'vehicle.drivetrain.electricEngine.charging.timeRemaining',
  /** This value indicates the calculated time (in minutes) until the high-voltage battery is fully cha... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMETOFULLYCHARGED = 'vehicle.drivetrain.electricEngine.charging.timeToFullyCharged',
  /** Indicates a pre-defined time window in which the high-voltage battery of the vehicle should be ch... */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_WINDOWSELECTION = 'vehicle.drivetrain.electricEngine.charging.windowSelection',
  /** This value indicates the remaining electric range at the time of data collection. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE = 'vehicle.drivetrain.electricEngine.kombiRemainingElectricRange',
  /** This value indicates the electric range predicted during charging. */
  VEHICLE_DRIVETRAIN_ELECTRICENGINE_REMAININGELECTRICRANGE = 'vehicle.drivetrain.electricEngine.remainingElectricRange',
  /** This value indicates whether the ignition was on or off at the time of data collection or whether... */
  VEHICLE_DRIVETRAIN_ENGINE_ISACTIVE = 'vehicle.drivetrain.engine.isActive',
  /** This value indicates whether the engine was on or off at the time of data collection or whether t... */
  VEHICLE_DRIVETRAIN_ENGINE_ISIGNITIONON = 'vehicle.drivetrain.engine.isIgnitionOn',
  /** This value indicates the tank level in percent at the time of data collection. */
  VEHICLE_DRIVETRAIN_FUELSYSTEM_LEVEL = 'vehicle.drivetrain.fuelSystem.level',
  /** The value indicates the current fuel tank level in litres or gallons at the time of data collecti... */
  VEHICLE_DRIVETRAIN_FUELSYSTEM_REMAININGFUEL = 'vehicle.drivetrain.fuelSystem.remainingFuel',
  /** The value indicates the current coolant temperature in degrees centigrade or Fahrenheit at the ti... */
  VEHICLE_DRIVETRAIN_INTERNALCOMBUSTIONENGINE_ENGINE_ECT = 'vehicle.drivetrain.internalCombustionEngine.engine.ect',
  /** Last sent remaining range electric + fuel sent by the vehicle. Range from vehicle Kombi (Queried ... */
  VEHICLE_DRIVETRAIN_LASTREMAININGRANGE = 'vehicle.drivetrain.lastRemainingRange',
  /** This value indicates the total range predicted during charging (total of electric range and combu... */
  VEHICLE_DRIVETRAIN_TOTALREMAININGRANGE = 'vehicle.drivetrain.totalRemainingRange',
  /** The value indicates the state of charge of the low-voltage battery in percent measured at the tim... */
  VEHICLE_ELECTRICALSYSTEM_BATTERY_STATEOFCHARGE = 'vehicle.electricalSystem.battery.stateOfCharge',
  /** The value indicates the current battery voltage in the vehicle's electrical system.
This value i... */
  VEHICLE_ELECTRICALSYSTEM_BATTERY_VOLTAGE = 'vehicle.electricalSystem.battery.voltage',
  /** SoH (State of Health) of the 48V Battery that is shown to the customer. Created to fulfill EU Bat... */
  VEHICLE_ELECTRICALSYSTEM_BATTERY48V_STATEOFHEALTH_DISPLAYED = 'vehicle.electricalSystem.battery48V.stateOfHealth.displayed',
  /** The fault memory provides information about potential errors or technical faults in the vehicle. ... */
  VEHICLE_ELECTRONICCONTROLUNIT_DIAGNOSTICTROUBLECODES_RAW = 'vehicle.electronicControlUnit.diagnosticTroubleCodes.raw',
  /** This value indicates whether the vehicle was in motion at the time of data collection. */
  VEHICLE_ISMOVING = 'vehicle.isMoving',
  /** This value indicates whether a charging current limit was active at the time of data collection. */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_ACLIMIT_ISACTIVE = 'vehicle.powertrain.electric.battery.charging.acLimit.isActive',
  /** This value indicates the maximum available charging current, independently of the infrastructure ... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_ACLIMIT_MAX = 'vehicle.powertrain.electric.battery.charging.acLimit.max',
  /** This value indicates the minimum available charging current, independently of the infrastructure ... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_ACLIMIT_MIN = 'vehicle.powertrain.electric.battery.charging.acLimit.min',
  /** This value indicates the set limit of the charging current in amperes (A). */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_ACLIMIT_SELECTED = 'vehicle.powertrain.electric.battery.charging.acLimit.selected',
  /** This value indicates whether charging is limited due to noise emissions. */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_ACOUSTICLIMIT = 'vehicle.powertrain.electric.battery.charging.acousticLimit',
  /** The current charging power in Watt. This value should only be considered with respect to the curr... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_POWER = 'vehicle.powertrain.electric.battery.charging.power',
  /** This value indicates which “Smart Charging” option is being used to charge with. */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_CHARGING_PREFERENCESMARTCHARGING = 'vehicle.powertrain.electric.battery.charging.preferenceSmartCharging',
  /** Current state of toggle switch for automatic battery preconditioning. ON means automatic mode (na... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_PRECONDITIONING_AUTOMATICMODE_STATUSFEEDBACK = 'vehicle.powertrain.electric.battery.preconditioning.automaticMode.statusFeedback',
  /** Current state of button for manual battery preconditioning. Either for charging or driving. */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_PRECONDITIONING_MANUALMODE_STATUSFEEDBACK = 'vehicle.powertrain.electric.battery.preconditioning.manualMode.statusFeedback',
  /** Status of battery preconditioning activity. On legacy value only valid for legacy-project SP2021p... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_PRECONDITIONING_STATE = 'vehicle.powertrain.electric.battery.preconditioning.state',
  /** This value indicates the target charging status of the high-voltage battery in percent. This is d... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGET = 'vehicle.powertrain.electric.battery.stateOfCharge.target',
  /** Min target state of charge requested by customer for smart charging and V2X. */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGETMIN = 'vehicle.powertrain.electric.battery.stateOfCharge.targetMin',
  /** Contains the target state of charge that shall be used as target in professional mode. At least t... */
  VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGETSOCFORPROFESSIONALMODE = 'vehicle.powertrain.electric.battery.stateOfCharge.targetSoCForProfessionalMode',
  /** This value indicates whether the charging time is displayed in the vehicle. */
  VEHICLE_POWERTRAIN_ELECTRIC_CHARGINGDURATION_DISPLAYCONTROL = 'vehicle.powertrain.electric.chargingDuration.displayControl',
  /** This value indicates whether the departure time is displayed in the vehicle. */
  VEHICLE_POWERTRAIN_ELECTRIC_DEPARTURETIME_DISPLAYCONTROL = 'vehicle.powertrain.electric.departureTime.displayControl',
  /** Indicates if and how the electric range shall be displayed in the vehicle. */
  VEHICLE_POWERTRAIN_ELECTRIC_RANGE_DISPLAYCONTROL = 'vehicle.powertrain.electric.range.displayControl',
  /** This value indicates the remaining electric range at the time of data collection. This depends on... */
  VEHICLE_POWERTRAIN_ELECTRIC_RANGE_TARGET = 'vehicle.powertrain.electric.range.target',
  /** This field indicates if customer setting for opening the flap by myWay function (slider in the mo... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_ANYPOSITION_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_ANYPOSITION_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_ANYPOSITION_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.isPlugged',
  /** This field indicates if customer setting for opening the front left flap by myWay function (slide... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTLEFT_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if front left charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTLEFT_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the front left charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTLEFT_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.isPlugged',
  /** This field indicates if customer setting for opening the front middle flap by myWay function (sli... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTMIDDLE_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if front middle charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTMIDDLE_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the front middle charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTMIDDLE_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.isPlugged',
  /** This field indicates if customer setting for opening the front right flap by myWay function (slid... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTRIGHT_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.frontRight.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if front right charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTRIGHT_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.frontRight.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the front right charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_FRONTRIGHT_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.frontRight.isPlugged',
  /** This field indicates if customer setting for opening the rear left flap by myWay function (slider... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARLEFT_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if rear left charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARLEFT_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the rear left charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARLEFT_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.isPlugged',
  /** This field indicates if customer setting for opening the rear middle flap by myWay function (slid... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARMIDDLE_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if rear middle charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARMIDDLE_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the rear middle charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARMIDDLE_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.isPlugged',
  /** This field indicates if customer setting for opening the rear right flap by myWay function (slide... */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARRIGHT_FLAP_ISAUTOMATICOPENANDCLOSEACTIVE = 'vehicle.powertrain.tractionBattery.charging.port.rearRight.flap.isAutomaticOpenAndCloseActive',
  /** This signal indicates, if rear right charging port is open in the vehicle. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARRIGHT_FLAP_ISOPEN = 'vehicle.powertrain.tractionBattery.charging.port.rearRight.flap.isOpen',
  /** This signal indicates, if a charging cable is plugged in the rear right charging port. */
  VEHICLE_POWERTRAIN_TRACTIONBATTERY_CHARGING_PORT_REARRIGHT_ISPLUGGED = 'vehicle.powertrain.tractionBattery.charging.port.rearRight.isPlugged',
  /** The value specifies the maximum number of service notifications transmitted from the vehicle to B... */
  VEHICLE_STATUS_CONDITIONBASEDSERVICESCOUNT = 'vehicle.status.conditionBasedServicesCount',
  /** This value indicates how many kilometres or miles remain before the next service at the time of r... */
  VEHICLE_STATUS_SERVICEDISTANCE_NEXT = 'vehicle.status.serviceDistance.next',
  /** The static value indicated is stored in the vehicle and indicates the first time that the custome... */
  VEHICLE_STATUS_SERVICEDISTANCE_YELLOW = 'vehicle.status.serviceDistance.yellow',
  /** The threshold indicates how many months before the main and exhaust gas inspection is due the ser... */
  VEHICLE_STATUS_SERVICETIME_HUANDAUSERVICEYELLOW = 'vehicle.status.serviceTime.hUandAuServiceYellow',
  /** This value indicates when the next inspection is due.
A date will be shown respectively, for exa... */
  VEHICLE_STATUS_SERVICETIME_INSPECTIONDATELEGAL = 'vehicle.status.serviceTime.inspectionDateLegal',
  /** The static value indicated is stored in the vehicle and indicates the first time that the custome... */
  VEHICLE_STATUS_SERVICETIME_YELLOW = 'vehicle.status.serviceTime.yellow',
  /** This value indicates the number of stars which the driving style analysis has given to the accele... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_ACCELERATION_STARSAVERAGE = 'vehicle.trip.segment.accumulated.acceleration.starsAverage',
  /** This value indicates the number of stars which the driving style analysis has given to the 'pro-a... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_CHASSIS_BRAKE_STARSAVERAGE = 'vehicle.trip.segment.accumulated.chassis.brake.starsAverage',
  /** This indicates the electrical energy consumption (kWh) in COMFORT mode, measured at the time of d... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_DRIVETRAIN_ELECTRICENGINE_ENERGYCONSUMPTIONCOMFORT = 'vehicle.trip.segment.accumulated.drivetrain.electricEngine.energyConsumptionComfort',
  /** This value indicates the average electrical energy in kilowatt hours (kWh/100 km or kWh/62 mi) re... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_DRIVETRAIN_ELECTRICENGINE_RECUPERATIONTOTAL = 'vehicle.trip.segment.accumulated.drivetrain.electricEngine.recuperationTotal',
  /** Indicates the length of time for which ECO mode was activated during the most recent drive when d... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_DRIVETRAIN_TRANSMISSION_SETTING_FRACTIONDRIVEECOPRO = 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveEcoPro',
  /** Indicates the length of time for which ECO PLUS mode was activated during the most recent drive w... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_DRIVETRAIN_TRANSMISSION_SETTING_FRACTIONDRIVEECOPROPLUS = 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveEcoProPlus',
  /** This value indicates the distance covered with electrical energy during the most recent drive in ... */
  VEHICLE_TRIP_SEGMENT_ACCUMULATED_DRIVETRAIN_TRANSMISSION_SETTING_FRACTIONDRIVEELECTRIC = 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveElectric',
  /** This value indicates the charging status of the high-voltage battery at the end of the most recen... */
  VEHICLE_TRIP_SEGMENT_END_DRIVETRAIN_BATTERYMANAGEMENT_HVSOC = 'vehicle.trip.segment.end.drivetrain.batteryManagement.hvSoc',
  /** The time stamp contains the date and local time of the most recently logged and transmitted drive... */
  VEHICLE_TRIP_SEGMENT_END_TIME = 'vehicle.trip.segment.end.time',
  /** This value indicates the total mileage after the last drive logged. */
  VEHICLE_TRIP_SEGMENT_END_TRAVELLEDDISTANCE = 'vehicle.trip.segment.end.travelledDistance',
  /** Timestamp of the last alarm activation time. The value comes without timezone information. */
  VEHICLE_VEHICLE_ANTITHEFTALARMSYSTEM_ALARM_ACTIVATIONTIME = 'vehicle.vehicle.antiTheftAlarmSystem.alarm.activationTime',
  /** Anti theft alarm. Arming status. */
  VEHICLE_VEHICLE_ANTITHEFTALARMSYSTEM_ALARM_ARMSTATUS = 'vehicle.vehicle.antiTheftAlarmSystem.alarm.armStatus',
  /** Anti theft alarm is active (car is honking). */
  VEHICLE_VEHICLE_ANTITHEFTALARMSYSTEM_ALARM_ISON = 'vehicle.vehicle.antiTheftAlarmSystem.alarm.isOn',
  /** This value indicates the weekly average travelled in kilometres or miles over a period of 2 months. */
  VEHICLE_VEHICLE_AVERAGEWEEKLYDISTANCELONGTERM = 'vehicle.vehicle.averageWeeklyDistanceLongTerm',
  /** This indicates the average volume of the distance travelled in kilometres or miles per week. */
  VEHICLE_VEHICLE_AVERAGEWEEKLYDISTANCESHORTTERM = 'vehicle.vehicle.averageWeeklyDistanceShortTerm',
  /** This value indicates the power of the auxiliary users in kW at the time of data collection. This ... */
  VEHICLE_VEHICLE_AVGAUXPOWER = 'vehicle.vehicle.avgAuxPower',
  /** The value indicates the average speed driven by the vehicle in km/h or mph at the time of data co... */
  VEHICLE_VEHICLE_AVGSPEED = 'vehicle.vehicle.avgSpeed',
  /** This value indicates whether Deep Sleep Mode is activated (“true”) or deactivated (“false”) at th... */
  VEHICLE_VEHICLE_DEEPSLEEPMODEACTIVE = 'vehicle.vehicle.deepSleepModeActive',
  /** Current status of the pre-conditioning of the stationary air conditioning before commencing trave... */
  VEHICLE_VEHICLE_PRECONDITIONING_ACTIVITY = 'vehicle.vehicle.preConditioning.activity',
  /** Reason for not carrying out pre-conditioning of the stationary air conditioning at the time of da... */
  VEHICLE_VEHICLE_PRECONDITIONING_ERROR = 'vehicle.vehicle.preConditioning.error',
  /** This value indicates whether the engine was active during pre-conditioning of the stationary air ... */
  VEHICLE_VEHICLE_PRECONDITIONING_ISREMOTEENGINERUNNING = 'vehicle.vehicle.preConditioning.isRemoteEngineRunning',
  /** This value indicated whether permission was granted to use the engine for the pre-conditioning of... */
  VEHICLE_VEHICLE_PRECONDITIONING_ISREMOTEENGINESTARTALLOWED = 'vehicle.vehicle.preConditioning.isRemoteEngineStartAllowed',
  /** This value indicates the remaining duration for the pre-conditioning of the stationary air condit... */
  VEHICLE_VEHICLE_PRECONDITIONING_REMAININGTIME = 'vehicle.vehicle.preConditioning.remainingTime',
  /** Lower bound of the speed range in km/h. The Range includes the lower bound. Due to privacy reason... */
  VEHICLE_VEHICLE_SPEEDRANGE_LOWERBOUND = 'vehicle.vehicle.speedRange.lowerBound',
  /** Upper bound of the speed range in km/h. The Range excludes the upper bound. Due to privacy reason... */
  VEHICLE_VEHICLE_SPEEDRANGE_UPPERBOUND = 'vehicle.vehicle.speedRange.upperBound',
  /** This value indicates the current setting for the time display in the vehicle at the time of data ... */
  VEHICLE_VEHICLE_TIMESETTING = 'vehicle.vehicle.timeSetting',
  /** The value indicates the current mileage at the time of data collection. */
  VEHICLE_VEHICLE_TRAVELLEDDISTANCE = 'vehicle.vehicle.travelledDistance',
}

/** Telematic keys database (all 244 keys) */
const KEYS_DB: Array<{ k: string; d: string; c: TelematicCategory }> = [
  {
    k: 'vehicle.body.chargingPort.dcStatus',
    d: 'This value indicates whether the vehicle was connected to a DC charging plug at the time of data collection (CONNECTED) or not (DISCONNECTED).',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.chargingPort.isHospitalityActive',
    d: 'This value indicates whether the charging plug is automatically unlocked (HOSPITALITY_ACTIVE) or remains locked (HOSPITALITY_INACTIVE) after charging is completed.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.chargingPort.plugEventId',
    d: 'Unique identifier which increases each time the customer plugs in his electrified vehicle (EXCEPT if the time between unplug and plug-in is less than 90 seconds). This value should be unique for each charging session. See ElectricEngine.Charging.PlugStatus.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.chargingPort.status',
    d: 'This value indicates whether the vehicle was connected to a charging plug at the time of data collection (CONNECTED) or not (DISCONNECTED).',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.chargingPort.statusClearText',
    d: 'Required alongside Vehicle.Body.ChargingPort.Status to ensure correct handling of charging sessions for G08 BEV vehicles (for details, contact DE-3-E; onboard fix expected by 2021-03)',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.flap.isLocked',
    d: 'This value indicates whether the charging flap is locked at the time of data collection.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.flap.isPermanentlyUnlocked',
    d: 'This value indicates whether the charging flap is locked independently of the central locking at the time of data collection.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.hood.isOpen',
    d: "This value indicates whether the vehicle's hood was closed at the time of data collection (CLOSED) or open (OPEN).",
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.lights.isRunningOn',
    d: 'This value indicates whether the vehicle light was on or off at the time of data collection or whether the status is unknown.',
    c: TelematicCategory.BODY,
  },
  { k: 'vehicle.body.trunk.door.isOpen', d: 'Trunk door state.', c: TelematicCategory.BODY },
  {
    k: 'vehicle.body.trunk.isLocked',
    d: 'Indicated weather the trunk is locked or not.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.isOpen',
    d: 'This value indicates whether the boot lid was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.left.door.isOpen',
    d: 'Left door of trunk state.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.lower.door.isOpen',
    d: 'Lower door of trunk state.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.right.door.isOpen',
    d: 'Right door of trunk state.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.upper.door.isOpen',
    d: 'Upper door of trunk state.',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.body.trunk.window.isOpen',
    d: 'This value indicates whether the rear window is unlocked (TRUE) or closed (FALSE).',
    c: TelematicCategory.BODY,
  },
  {
    k: 'vehicle.cabin.climate.timers.overwriteTimer.action',
    d: 'Timer State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when communicating timer to the vehicle).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.overwriteTimer.hour',
    d: 'Hour setting of climate timer as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.overwriteTimer.minute',
    d: 'Minute setting of climate timer as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer1.action',
    d: 'Timer 1 State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when communicating timer 1 to the vehicle).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer1.hour',
    d: 'Hour setting of climate timer 1 as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer1.minute',
    d: 'Minute setting of climate timer 1 as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer2.action',
    d: 'Timer 2 State/Action with states Activate (On), Deactivate (Off) and NoAction (Only used when communicating timer 2 to the vehicle).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer2.hour',
    d: 'Hour setting of climate timer 2 as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.climate.timers.weekdaysTimer2.minute',
    d: 'Minute setting of climate timer 2 as per vehicle-configured timezone.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.convertible.roofRetractableStatus',
    d: 'Convertible Roof Retractable State. BMW Mini vehicles have the additionally option to only open the folding roof. This signal represents the Mini folding roof state. It should be read together with the convertible roof state as well, see Vehicle.Cabin.Convertible.RoofStatus.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.convertible.roofStatus',
    d: 'Indicates the current status of the convertible roof at the time of data collection, e.g. whether it was closed (CLOSED), open (OPEN) or – in an emergency – locked (EMERGENCYLOCKED).  The following additional status values are possible:  CLOSEDSECURED = convertible roof closed, vehicle secured  OPENSECURED = convertible roof open, vehicle secured  HARDTOPMOUNTED = hard top mounted and closed (removable hard top)  INTERMEDIATEPOSITION = convertible roof in intermediate position  LOADINGPOSITION = roof is in a position that allows for easy loading of the boot  LOADINGPOSITIONIMMEDIATE = roof is in a position that allows for easy loading of the boot',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row1.driver.isOpen',
    d: 'This value indicates whether the front left door was closed at the time of data collection (CLOSED) or open (OPEN).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row1.driver.position',
    d: 'Driver-side front door opening position in percent. 0% represents fully closed and 100% represents fully opened.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row1.passenger.isOpen',
    d: 'This value indicates whether the front right door was closed at the time of data collection (CLOSED) or open (OPEN).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row1.passenger.position',
    d: 'Passenger-side front door opening position in percent. 0% represents fully closed and 100% represents fully opened.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row2.driver.isOpen',
    d: 'This value indicates whether the rear left door was closed at the time of data collection (CLOSED) or open (OPEN).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row2.driver.position',
    d: 'Driver-side rear door opening position in percent. 0% represents fully closed and 100% represents fully opened.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row2.passenger.isOpen',
    d: 'This value indicates whether the rear right door was closed at the time of data collection (CLOSED) or open (OPEN).',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.row2.passenger.position',
    d: 'Passenger-side rear door opening position in percent. 0% represents fully closed and 100% represents fully opened.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.door.status',
    d: 'This value indicates the status of the doors, but is only sporadically recorded and transmitted.  Note: It is recommended to use only the individual door status instead of this value.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.driverSide.cooling',
    d: 'Default settings for front driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.driverSide.heating',
    d: 'Default settings for front driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.passengerSide.cooling',
    d: 'Default settings for front passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row1.passengerSide.heating',
    d: 'Default settings for front passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.driverSide.cooling',
    d: 'Default settings for rear driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.driverSide.heating',
    d: 'Default settings for rear driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.passengerSide.cooling',
    d: 'Default settings for rear passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row2.passengerSide.heating',
    d: 'Default settings for rear passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.driverSide.cooling',
    d: 'Default settings for third row driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.driverSide.heating',
    d: 'Default settings for third row driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.passengerSide.cooling',
    d: 'Default settings for third row passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.seat.row3.passengerSide.heating',
    d: 'Default settings for third row passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.steeringWheel.heating',
    d: 'Default settings for steering wheel heating for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.defaultSettings.targetTemperature',
    d: 'Default settings for target temperature for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.driverSide.cooling',
    d: 'DirectStart settings for front driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.driverSide.heating',
    d: 'DirectStart settings for front driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.passengerSide.cooling',
    d: 'DirectStart settings for front passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row1.passengerSide.heating',
    d: 'DirectStart settings for front passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.driverSide.cooling',
    d: 'DirectStart settings for rear driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.driverSide.heating',
    d: 'DirectStart settings for rear driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.passengerSide.cooling',
    d: 'DirectStart settings for rear passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row2.passengerSide.heating',
    d: 'DirectStart settings for rear passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.driverSide.cooling',
    d: 'DirectStart settings for third row driver seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.driverSide.heating',
    d: 'DirectStart settings for third row driver seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.passengerSide.cooling',
    d: 'DirectStart settings for third row passenger seat cooling/ventilation of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.seat.row3.passengerSide.heating',
    d: 'DirectStart settings for third row passenger seat heating of the seat for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.steeringWheel.heating',
    d: 'DirectStart settings for steering wheel heating for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.configuration.directStartSettings.targetTemperature',
    d: 'DirectStart settings for target temperature for climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.status.comfortState',
    d: 'Status of the comfort state of the climate preconditioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.status.isExteriorMirrorHeatingActive',
    d: 'Current status of the exterior mirror heating.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.status.progress',
    d: 'Progress of the currently active climate preconditioning in percent.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.status.rearDefrostActive',
    d: 'Current status of the rear window heating.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.preconditioning.status.remainingRunningTime',
    d: 'Remaining runtime of climate preconditioning in seconds.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.hvac.statusAirPurification',
    d: 'Actual status of the air purification.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.displayUnit.distance',
    d: 'This value indicates the units (kilometres or miles) in which distances are indicated on the vehicle instrument panel.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.hmi.distanceUnit',
    d: 'Distance unit used in the current HMI',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.isMobilePhoneConnected',
    d: 'This value indicates whether a mobile phone was linked to the vehicle at the time of data collection or whether the connection status is unknown.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.altitude',
    d: 'This value indicates the height of the vehicle above sea-level at the time of data collection.  The value range reaches from -100m to 6000m or from -328ft to 19685ft.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.fixStatus',
    d: 'GPS fix status. "NO_FIX" means when less than 3 satellites are found. "2D_GPS_FIX" is obtained when at least 3 satellites are found. "3D_GPS_FIX" is obtained when at least 4 satellites are found.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.heading',
    d: 'This value indicates the orientation of the vehicle in degrees at the time of data collection. If the value is 180, the vehicle is pointing directly south. If the value is 0, the vehicle is pointing directly north. The values thus range from 0 to 359. The determined orientation of the vehicle may differ from its actual orientation due to inaccuracies in the GPS positioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.latitude',
    d: 'This value indicates the degree of latitude at which the vehicle was at the time of data collection.  The degree of latitude could range from 0 (at the equator) to a maximum of +90 in the northern hemisphere or respectively -90 in the southern hemisphere. The GPS position is transferred independently of whether the GPS positioning has been activated or deactivated in your vehicle via the settings menu.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.longitude',
    d: 'This value indicates the degree of longitude at which the vehicle was at the time of data collection.  The degree of longitude could range from 0 (at the Greenwich meridian / Great Britain) to a maximum of +180 east or respectively -180 west of the meridian. The GPS position is transferred independently of whether the GPS positioning has been activated or deactivated in your vehicle via the settings menu.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.currentLocation.numberOfSatellites',
    d: 'Number of GPS satellites used for positioning and relates to the reliability of the positioning.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.destinationSet.arrivalTime',
    d: 'This value indicates the arrival time at the navigation destination and is given in hours and minutes.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.destinationSet.distance',
    d: 'This value indicates the distance to the active navigation destination in kilometres or miles at the time of data collection.  The values range from 0 km to 100000 km or from 0mi to 62137mi.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.pointsOfInterests.available',
    d: 'This value indicates how many POIs (points of interest) are still open in the navigation system.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.pointsOfInterests.max',
    d: 'This value indicates how many POIs (points of interest) can be stored in the navigation system.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.infotainment.navigation.remainingRange',
    d: 'This value indicates the remaining range of fuel in kilometres or miles at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row1.driverSide.cooling',
    d: 'Front driver seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row1.driverSide.heating',
    d: 'Front driver seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row1.passengerSide.cooling',
    d: 'Front passenger seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row1.passengerSide.heating',
    d: 'Front passenger seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row2.driverSide.cooling',
    d: 'Rear driver seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row2.driverSide.heating',
    d: 'Rear driver seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row2.passengerSide.cooling',
    d: 'Rear passenger seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row2.passengerSide.heating',
    d: 'Rear passenger seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row3.driverSide.cooling',
    d: 'Third row driver seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row3.driverSide.heating',
    d: 'Third row driver seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row3.passengerSide.cooling',
    d: 'Third row passenger seat Cooling. 0 = off. +100 = max cold.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.seat.row3.passengerSide.heating',
    d: 'Third row passenger seat heating. 0 = off. +100 = max heat.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.steeringWheel.heating',
    d: 'Actual value of the steering wheel heating in percent.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.sunroof.overallStatus',
    d: "Overall status of the vehicle's sunroof.",
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.sunroof.relativePosition',
    d: 'Openingt state of the sunroof in percent. -100 means full tilt position. 0% represents fully closed and 100% represents fully opened.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.sunroof.shade.position',
    d: 'Item position. 0 = Start position 100 = End position.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.sunroof.status',
    d: 'This value indicates whether the sunroof (if the vehicle has one) was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.sunroof.tiltStatus',
    d: 'This value indicates whether the sunroof (if the vehicle has one) was tilted (OPEN), half-tilted (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.window.row1.driver.status',
    d: 'This value indicates whether the front left window was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.window.row1.passenger.status',
    d: 'This value indicates whether the front right window was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.window.row2.driver.status',
    d: 'This value indicates whether the rear left window was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.cabin.window.row2.passenger.status',
    d: 'This value indicates whether the rear right window was open (OPEN), half-open (INTERMEDIATE) or closed (CLOSED) at the time of data collection.',
    c: TelematicCategory.CABIN,
  },
  {
    k: 'vehicle.channel.ngtp.timeVehicle',
    d: 'These values indicate the time shown in the vehicle at the time of recording the data.',
    c: TelematicCategory.CHANNEL,
  },
  {
    k: 'vehicle.channel.teleservice.lastAutomaticServiceCallTime',
    d: 'This value indicates at what time an Automatic Service Call (ASC) was initiated by the vehicle.',
    c: TelematicCategory.CHANNEL,
  },
  {
    k: 'vehicle.channel.teleservice.lastTeleserviceReportTime',
    d: 'This value indicates at what time the teleservice report call was initiated by the vehicle. The vehicle collects measured values or error data for the teleservice report call, and automatically sends them according to defined cycles.',
    c: TelematicCategory.CHANNEL,
  },
  {
    k: 'vehicle.channel.teleservice.status',
    d: 'This value indicates whether teleservices are available for this vehicle.',
    c: TelematicCategory.CHANNEL,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.left.tire.pressure',
    d: 'This value indicates the measured tyre pressure on the front left in kPa',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.left.tire.pressureTarget',
    d: 'This value indicates the target tyre pressure on the front left in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.left.tire.temperature',
    d: 'Tire temperature in Celsius on the front left.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.right.tire.pressure',
    d: 'This value indicates the measured tyre pressure on the front right in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.right.tire.pressureTarget',
    d: 'This value indicates the target tyre pressure on the front right in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row1.wheel.right.tire.temperature',
    d: 'Tire temperature in Celsius on the front right.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.left.tire.pressure',
    d: 'This value indicates the measured tyre pressure on the rear left in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.left.tire.pressureTarget',
    d: 'This value indicates the target tyre pressure on the rear left in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.left.tire.temperature',
    d: 'Tire temperature in Celsius on the rear left.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.right.tire.pressure',
    d: 'This value indicates the measured tyre pressure on the rear right in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.right.tire.pressureTarget',
    d: 'This value indicates the target tyre pressure on the rear right in kPa.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.chassis.axle.row2.wheel.right.tire.temperature',
    d: 'Tire temperature in Celsius on the rear right.',
    c: TelematicCategory.CHASSIS,
  },
  {
    k: 'vehicle.drivetrain.avgElectricRangeConsumption',
    d: 'This value indicates the average electric consumption in [kWh/100 km or mi/kWh] at the time of data collection.  Note: Not available for the models i3 and i8.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.batteryManagement.batterySizeMax',
    d: 'This value indicates the size of the installed high-voltage battery.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.batteryManagement.header',
    d: 'This value indicates the current charging status of the vehicle at the time of data collection.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.batteryManagement.maxEnergy',
    d: 'This value indicates the current energy content of the high-voltage battery.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.acAmpere',
    d: 'This value indicates the maximum charging current for the most recent charging process in ampere (A) (only when charging with alternating current).  Values between 0 and 25 are possible. Both the vehicle and charging station could be individually charged with a certain maximum charging current. The value displayed here is the greater of these two figures.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.acRestriction.factor',
    d: 'Response of ac restriction.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.acRestriction.isChosen',
    d: 'The first value indicates whether the charging current used to charge the vehicle is limited.   The second value describes the type of limit (reduced or minimum).',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.acVoltage',
    d: 'This value indicates the charging voltage for the most recent charging process (only when charging with alternating current).  This value is usually in the region of 230 V.  However, charging voltages may range from 0 to 300.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.authentication.status',
    d: 'Plug & Charge (Automatic Payment of Charging Services) authorization status of a charging session. "AUTHORIZATION_SUCCESSFUL" - Authentication with PlugAndCharge successful, "TRANSPORT_LAYER_ERROR" - TLS connection to EVSE not possible, "HIGH_LEVEL_COMMUNICATION_ERROR" - High Level communication with ISO15118 error, "CONTRACT_SERVICE_NOT_SUPPORTED_ERROR" - EVSE doesn\'t support Authentication via PlugAndCharge, "AUTHORIZATION_TIMEOUT" - Authorization run in an error, "AUTHORIZATION_TIMEOUT" - authentication not finished after 120s, "NVM_READ_CERTIFICATE_ERROR" - Certificates couldn\'t be red from Charging Control Unit storrage, "CERTIFICATE_UPDATE_ERROR" - update of contract via powerline failed, "XML_SECURITY_ERROR" - Schema validation error of transfered data.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.chargingMode',
    d: 'Current charging mode.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.connectionType',
    d: 'This value indicates the charging process (CONDUCTIVE/INDUCTIVE) used to charge the vehicle at the time of data collection.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.connectorStatus',
    d: 'Current condition of charging plug across all types (inductive, conductive), modes (AC, DC) and service packs.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.consumptionOverLifeTime.overall.gridEnergy',
    d: 'This value indicates the total energy supplied using charging cables.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.hvpmFinishReason',
    d: 'This value indicates the reason why a charging process was ended.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.hvStatus',
    d: 'Charging HV Status.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.isImmediateChargingSystemReason',
    d: 'This parameter contains the information that customer selected charging mode is overwritten due to system reasons.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.isSingleImmediateCharging',
    d: 'This value indicates whether the “instant charging” function is activated.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.lastChargingReason',
    d: 'Reason of the last charging process.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.lastChargingResult',
    d: 'Result of the last charging process.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.method',
    d: 'This value describes whether the vehicle was charged with direct current (DC) or alternating current (AC) and which charging plug was used for this purpose.  The indicated technical value AC_TYPE1PLUG, for example, indicates that the high-voltage battery was charged in alternating current mode, making use of a charging plug of Type 1.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.modeDeviation',
    d: 'This parameter contains the information of deviation to the customer selected charging mode due to system reasons.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.phaseNumber',
    d: 'This value indicates the number of phases in which the high-voltage battery will be charged.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.climatizationActive',
    d: 'Climatization Activation of Vehicle in Charging Profile, vehicle interior gets preconditioned for next departure time.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.isRcpConfigComplete',
    d: 'Vehicles with a complete RCP (Remote Charging Profile) Configuration explicitly send values for all charging profile attributes. For Vehicles without a complete RCP Configuration, some defaults are applied.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.mode',
    d: 'The charging profile provides information about the charging mode most recently selected for your vehicle. Where appropriate, CarData element may also be used to display individual attributes in cars without an electric drive, e.g. the preconditioning settings.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.preference',
    d: 'Charging preference of current charging profile. This value depends on charge mode selection. For Vehicle.ElectricEngine.Charging.Profile.Mode being "DELAYED_CHARGING", Vehicle.ElectricEngine.Charging.Profile.Preference is either "SMART_CHARGING" or "CHARGING_WINDOW". In case Vehicle.ElectricEngine.Charging.Profile.Mode is "IMMEDIATE_CHARGING", Vehicle.ElectricEngine.Charging.Profile.Preference is set to "NO_PRESELECTION".',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.settings.biDirectionalCharging.departureTimeRelevant',
    d: 'Information if the upcoming departure time is relevant for the professional mode (bidirectional/unidirectional) and the target state of energy shall be reached at this time.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.settings.biDirectionalCharging.dischargeAllowed',
    d: 'Allowing discharging in professional mode for the bidirectional power transfer function (BPT) is selected from customer or not (ON/OFF).',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.profile.timerType',
    d: 'Charging profile timer type (e.g., Weekdays or TwoTimesTimer)',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.reasonChargingEnd',
    d: 'Reason for the end of charging, from SP25 on.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.routeOptimizedChargingStatus',
    d: 'Indicates the charging status in cases where e-route charging is used by the customer for his journey. E-route charging sessions have two distinct phases. Route optimzed charging sessions override the customer target state of charge temporarily.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.smeEnergyDeltaFullyCharged',
    d: 'This value indicates the amount of energy required to fully charge the battery.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.status',
    d: "This value indicates the current charging status of the vehicle at the time of data collection.  For example, NOCHARGING means that the vehicle's high-voltage battery is currently not being charged.  INITIALIZATION means that the charging process is just being prepared, while CHARGINGACTIVE means that the battery is just being charged.  Other possible values are:  CHARGINGPAUSED (charging paused),  CHARGINGENDED (charging ended) and  CHARGINGERROR (charging error).",
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.timeRemaining',
    d: 'This value indicates the estimated remaining charging time in minutes.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.timeToFullyCharged',
    d: 'This value indicates the calculated time (in minutes) until the high-voltage battery is fully charged. If a navigation destination has been set, the time remaining until reaching the destination will be displayed.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.charging.windowSelection',
    d: 'Indicates a pre-defined time window in which the high-voltage battery of the vehicle should be charged.  The value could be either NOTCHOSEN or CHOSEN.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.kombiRemainingElectricRange',
    d: 'This value indicates the remaining electric range at the time of data collection.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.electricEngine.remainingElectricRange',
    d: 'This value indicates the electric range predicted during charging.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.engine.isActive',
    d: 'This value indicates whether the ignition was on or off at the time of data collection or whether the status is unknown.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.engine.isIgnitionOn',
    d: 'This value indicates whether the engine was on or off at the time of data collection or whether the status is unknown.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.fuelSystem.level',
    d: 'This value indicates the tank level in percent at the time of data collection.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.fuelSystem.remainingFuel',
    d: 'The value indicates the current fuel tank level in litres or gallons at the time of data collection. Depending on the position of the tank float, the specified value may differ by up to 6 litres or 1.6 gallons.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.internalCombustionEngine.engine.ect',
    d: 'The value indicates the current coolant temperature in degrees centigrade or Fahrenheit at the time of data collection.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.lastRemainingRange',
    d: 'Last sent remaining range electric + fuel sent by the vehicle. Range from vehicle Kombi (Queried for PHEV and CE vehicles). Delivers e-range + ce range for PHEV. Ce Range for CE vehicles. Likely 0 for BEV vehicles. This value should only be used for combustion cars. Electric cars should read Vehicle.Drivetrain.ElectricEngine.KombiRemainingElectricRange.',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.drivetrain.totalRemainingRange',
    d: 'This value indicates the total range predicted during charging (total of electric range and combustion engine range).',
    c: TelematicCategory.DRIVETRAIN,
  },
  {
    k: 'vehicle.electricalSystem.battery.stateOfCharge',
    d: 'The value indicates the state of charge of the low-voltage battery in percent measured at the time of data collection.',
    c: TelematicCategory.ELECTRICAL_SYSTEM,
  },
  {
    k: 'vehicle.electricalSystem.battery.voltage',
    d: "The value indicates the current battery voltage in the vehicle's electrical system.  This value is always given in voltage, e.g. 14.4 V.",
    c: TelematicCategory.ELECTRICAL_SYSTEM,
  },
  {
    k: 'vehicle.electricalSystem.battery48V.stateOfHealth.displayed',
    d: 'SoH (State of Health) of the 48V Battery that is shown to the customer. Created to fulfill EU Battery Regulation.',
    c: TelematicCategory.ELECTRICAL_SYSTEM,
  },
  {
    k: 'vehicle.electronicControlUnit.diagnosticTroubleCodes.raw',
    d: 'The fault memory provides information about potential errors or technical faults in the vehicle. This information is intended for workshops. Customer-relevant errors that are displayed to the driver in the vehicle can be found under the CarData Element “Check control messages”. Details about this are documented in the operating manual of the vehicle.',
    c: TelematicCategory.ELECTRONIC_CONTROL_UNIT,
  },
  {
    k: 'vehicle.isMoving',
    d: 'This value indicates whether the vehicle was in motion at the time of data collection.',
    c: TelematicCategory.IS_MOVING,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.acLimit.isActive',
    d: 'This value indicates whether a charging current limit was active at the time of data collection.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.acLimit.max',
    d: 'This value indicates the maximum available charging current, independently of the infrastructure and selected cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.acLimit.min',
    d: 'This value indicates the minimum available charging current, independently of the infrastructure and selected cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.acLimit.selected',
    d: 'This value indicates the set limit of the charging current in amperes (A).',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.acousticLimit',
    d: 'This value indicates whether charging is limited due to noise emissions.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.power',
    d: 'The current charging power in Watt. This value should only be considered with respect to the current timestamp.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.charging.preferenceSmartCharging',
    d: 'This value indicates which “Smart Charging” option is being used to charge with.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.preconditioning.automaticMode.statusFeedback',
    d: 'Current state of toggle switch for automatic battery preconditioning. ON means automatic mode (navigation based) of the predictive thermal management (vWM) is activated. OFF means automatic mode (navigation based) of the predictive thermal management (vWM) is deactivated. TEMP_OFF stands for temporary deactivation for current trip of the automatic predictive thermal management.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.preconditioning.manualMode.statusFeedback',
    d: 'Current state of button for manual battery preconditioning. Either for charging or driving.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.preconditioning.state',
    d: 'Status of battery preconditioning activity. On legacy value only valid for legacy-project SP2021plus.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.stateOfCharge.target',
    d: 'This value indicates the target charging status of the high-voltage battery in percent. This is displayed in 10% increments.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.stateOfCharge.targetMin',
    d: 'Min target state of charge requested by customer for smart charging and V2X.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.battery.stateOfCharge.targetSoCForProfessionalMode',
    d: 'Contains the target state of charge that shall be used as target in professional mode. At least this target state of charge will be reached by departure time.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.chargingDuration.displayControl',
    d: 'This value indicates whether the charging time is displayed in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.departureTime.displayControl',
    d: 'This value indicates whether the departure time is displayed in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.range.displayControl',
    d: 'Indicates if and how the electric range shall be displayed in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.electric.range.target',
    d: 'This value indicates the remaining electric range at the time of data collection. This depends on the set target value of the charging status.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.flap.isOpen',
    d: 'This signal indicates, if charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the front left flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.flap.isOpen',
    d: 'This signal indicates, if front left charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontLeft.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the front left charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the front middle flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.flap.isOpen',
    d: 'This signal indicates, if front middle charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontMiddle.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the front middle charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontRight.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the front right flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontRight.flap.isOpen',
    d: 'This signal indicates, if front right charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.frontRight.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the front right charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the rear left flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.flap.isOpen',
    d: 'This signal indicates, if rear left charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearLeft.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the rear left charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the rear middle flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.flap.isOpen',
    d: 'This signal indicates, if rear middle charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearMiddle.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the rear middle charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearRight.flap.isAutomaticOpenAndCloseActive',
    d: 'This field indicates if customer setting for opening the rear right flap by myWay function (slider in the mobile app) is active. If true, flap opens automatically when the vehicle is close to a charging station with the digital key in the pocket and closes automatically after unplugging the cable.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearRight.flap.isOpen',
    d: 'This signal indicates, if rear right charging port is open in the vehicle.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.powertrain.tractionBattery.charging.port.rearRight.isPlugged',
    d: 'This signal indicates, if a charging cable is plugged in the rear right charging port.',
    c: TelematicCategory.POWERTRAIN,
  },
  {
    k: 'vehicle.status.conditionBasedServicesCount',
    d: 'The value specifies the maximum number of service notifications transmitted from the vehicle to BMW via telematics. The actual number of service notifications transmitted (see separate CBS key) varies depending on how the vehicle is used and whether relevant thresholds have been reached. Note: Not all Condition Based service messages which occur in the vehicle are also transferred.',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.status.serviceDistance.next',
    d: 'This value indicates how many kilometres or miles remain before the next service at the time of recording the data.  Note: This value is calculated based on the individual CBS scopes and is not determined with every data transfer. For more details, see "Condition Based Service".',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.status.serviceDistance.yellow',
    d: 'The static value indicated is stored in the vehicle and indicates the first time that the customer receives a mileage-related message to inform him that the vehicle will soon be due for a service.  It is given in kilometres or miles (for example 2000 km or 1243 mi).',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.status.serviceTime.hUandAuServiceYellow',
    d: 'The threshold indicates how many months before the main and exhaust gas inspection is due the service advisor will be notified.',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.status.serviceTime.inspectionDateLegal',
    d: 'This value indicates when the next inspection is due.  A date will be shown respectively, for example 30.09.2018 23:00 UTC or 09.30.2018 23:00 UTC.',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.status.serviceTime.yellow',
    d: 'The static value indicated is stored in the vehicle and indicates the first time that the customer receives a message to inform them that the vehicle will soon be due for a service.  This is given in weeks (for example 4).',
    c: TelematicCategory.STATUS,
  },
  {
    k: 'vehicle.trip.segment.accumulated.acceleration.starsAverage',
    d: 'This value indicates the number of stars which the driving style analysis has given to the acceleration behaviour of the driver at the time of data collection.  The system allocates 0 to 5 stars.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.chassis.brake.starsAverage',
    d: "This value indicates the number of stars which the driving style analysis has given to the 'pro-active driving' behaviour of the driver at the time of data collection.  The system allocates 0 to 5 stars.",
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.drivetrain.electricEngine.energyConsumptionComfort',
    d: 'This indicates the electrical energy consumption (kWh) in COMFORT mode, measured at the time of data collection.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.drivetrain.electricEngine.recuperationTotal',
    d: 'This value indicates the average electrical energy in kilowatt hours (kWh/100 km or kWh/62 mi) recuperated during the last logged drive per 100 kilometres or 62 miles. The values range from 0 to 254.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveEcoPro',
    d: 'Indicates the length of time for which ECO mode was activated during the most recent drive when data were recorded.  The values range from 0 to 100.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveEcoProPlus',
    d: 'Indicates the length of time for which ECO PLUS mode was activated during the most recent drive when data were recorded.  The values range from 0 to 100.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.accumulated.drivetrain.transmission.setting.fractionDriveElectric',
    d: 'This value indicates the distance covered with electrical energy during the most recent drive in percentage.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.end.drivetrain.batteryManagement.hvSoc',
    d: 'This value indicates the charging status of the high-voltage battery at the end of the most recently logged drive (in percentage).',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.end.time',
    d: 'The time stamp contains the date and local time of the most recently logged and transmitted drive, for example 15.05.2017 15:51:00 UTC or 05/15/2017 15:51:00 UTC.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.trip.segment.end.travelledDistance',
    d: 'This value indicates the total mileage after the last drive logged.',
    c: TelematicCategory.TRIP,
  },
  {
    k: 'vehicle.vehicle.antiTheftAlarmSystem.alarm.activationTime',
    d: 'Timestamp of the last alarm activation time. The value comes without timezone information.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.antiTheftAlarmSystem.alarm.armStatus',
    d: 'Anti theft alarm. Arming status.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.antiTheftAlarmSystem.alarm.isOn',
    d: 'Anti theft alarm is active (car is honking).',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.averageWeeklyDistanceLongTerm',
    d: 'This value indicates the weekly average travelled in kilometres or miles over a period of 2 months.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.averageWeeklyDistanceShortTerm',
    d: 'This indicates the average volume of the distance travelled in kilometres or miles per week.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.avgAuxPower',
    d: 'This value indicates the power of the auxiliary users in kW at the time of data collection. This is the on-board power consumption including the power for the air conditioning.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.avgSpeed',
    d: 'The value indicates the average speed driven by the vehicle in km/h or mph at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.deepSleepModeActive',
    d: 'This value indicates whether Deep Sleep Mode is activated (“true”) or deactivated (“false”) at the time of the request. If the customer has activated Deep Sleep Mode, the vehicle can be parked for a longer time without charging the battery. In this mode, most consumers are deactivated to save energy. The customer can end Deep Sleep Mode by deactivating it or starting the vehicle.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.preConditioning.activity',
    d: 'Current status of the pre-conditioning of the stationary air conditioning before commencing travel at the time of data collection. The value “Inactive” may be transmitted if the pre-conditioning has not been booked or if the pre-conditioning is not active at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.preConditioning.error',
    d: 'Reason for not carrying out pre-conditioning of the stationary air conditioning at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.preConditioning.isRemoteEngineRunning',
    d: 'This value indicates whether the engine was active during pre-conditioning of the stationary air conditioning at the time of data collection. The value “Inactive” may be transmitted if the pre-conditioning has not been booked or if the pre-conditioning is not active at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.preConditioning.isRemoteEngineStartAllowed',
    d: 'This value indicated whether permission was granted to use the engine for the pre-conditioning of the stationary air conditioning at the time of data collection. This is determined by the customer.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.preConditioning.remainingTime',
    d: 'This value indicates the remaining duration for the pre-conditioning of the stationary air conditioning in minutes at the time of data collection. This value may also be transmitted if the pre-conditioning has not been booked or if the pre-conditioning status of the stationary air conditioning is not active (“inactive”) at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.speedRange.lowerBound',
    d: 'Lower bound of the speed range in km/h. The Range includes the lower bound. Due to privacy reasons some functions are not allowed to transmit the current driving speed and should use the SpeedRange attribute.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.speedRange.upperBound',
    d: 'Upper bound of the speed range in km/h. The Range excludes the upper bound. Due to privacy reasons some functions are not allowed to transmit the current driving speed and should use the SpeedRange attribute.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.timeSetting',
    d: 'This value indicates the current setting for the time display in the vehicle at the time of data collection. For example, this may be winter time, summer time, UTC or manual.',
    c: TelematicCategory.VEHICLE,
  },
  {
    k: 'vehicle.vehicle.travelledDistance',
    d: 'The value indicates the current mileage at the time of data collection.',
    c: TelematicCategory.VEHICLE,
  },
];

/** Get all telematic keys with full metadata */
export function getAllTelematicKeys(): TelematicKeyDescriptor[] {
  return KEYS_DB.map(({ k, d, c }) => ({ key: k, description: d, category: c }));
}

/** Get all available categories with metadata */
export function getCategories(): Array<{
  category: TelematicCategory;
  description: string;
  keyCount: number;
}> {
  const categories = new Map<TelematicCategory, number>();
  KEYS_DB.forEach(({ c }) => {
    categories.set(c, (categories.get(c) ?? 0) + 1);
  });

  return Array.from(categories.entries()).map(([category, count]) => ({
    category,
    description: getCategoryDescription(category),
    keyCount: count,
  }));
}

/** Get description for category */
function getCategoryDescription(category: TelematicCategory): string {
  const descriptions: Record<TelematicCategory, string> = {
    [TelematicCategory.BODY]: 'Body elements (hood, trunk, lights, charging port)',
    [TelematicCategory.CABIN]: 'Cabin elements (doors, windows, seats, HVAC, infotainment)',
    [TelematicCategory.CHANNEL]: 'Data channel information',
    [TelematicCategory.CHASSIS]: 'Chassis and tire information',
    [TelematicCategory.DRIVETRAIN]: 'Drivetrain (engine, battery, fuel, transmission)',
    [TelematicCategory.ELECTRICAL_SYSTEM]: 'Electrical system (12V battery)',
    [TelematicCategory.ELECTRONIC_CONTROL_UNIT]: 'ECU diagnostic information',
    [TelematicCategory.IS_MOVING]: 'Vehicle movement status',
    [TelematicCategory.POWERTRAIN]: 'Powertrain electric components',
    [TelematicCategory.STATUS]: 'Vehicle status and service information',
    [TelematicCategory.TRIP]: 'Trip data and driving statistics',
    [TelematicCategory.VEHICLE]: 'General vehicle information and settings',
  };
  return descriptions[category] || category;
}

/** Get keys for specific category */
export function getKeysByCategory(category: TelematicCategory): TelematicKeyDescriptor[] {
  return KEYS_DB.filter(({ c }) => c === category).map(({ k, d, c }) => ({
    key: k,
    description: d,
    category: c,
  }));
}

/** Get description for specific key */
export function getKeyDescription(key: TelematicKey | string): string | undefined {
  const item = KEYS_DB.find(({ k }) => k === key);
  return item?.d;
}

/** Get category for specific key */
export function getKeyCategory(key: TelematicKey | string): TelematicCategory | undefined {
  const item = KEYS_DB.find(({ k }) => k === key);
  return item?.c;
}

/** Get all keys as simple string array (for container creation) */
export function getAllKeys(): string[] {
  return KEYS_DB.map(({ k }) => k);
}

/**
 * Essential keys for complete VehicleStatus monitoring via API fallback.
 *
 * This array contains all telematic keys required by TelematicDataTransformer
 * to build a complete VehicleStatus object. Used for container creation.
 *
 * Total: 46 keys (well under 244 available keys)
 * Updated: 2025-01-16 (Task 6.6.1: Validated against transformer usage)
 */
export const ESSENTIAL_KEYS = [
  // Electric Battery & Charging Status (10 keys)
  TelematicKey.VEHICLE_ELECTRICALSYSTEM_BATTERY_STATEOFCHARGE, // 12V battery diagnostics
  TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS, // Charger connected
  TelematicKey.VEHICLE_BODY_CHARGINGPORT_DCSTATUS, // DC fast charging
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_REMAININGELECTRICRANGE, // Primary electric range
  TelematicKey.VEHICLE_DRIVETRAIN_BATTERYMANAGEMENT_HEADER, // HV battery SOC (fallback)
  TelematicKey.VEHICLE_TRIP_SEGMENT_END_DRIVETRAIN_BATTERYMANAGEMENT_HVSOC, // HV battery SOC (fallback)
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_KOMBIREMAININGELECTRICRANGE, // Combined electric range
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_STATUS, // Charging active/complete/error
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMETOFULLYCHARGED, // Minutes to full charge
  TelematicKey.VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGET, // Target SOC %

  // Combustion Fuel (3 keys)
  TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_LEVEL, // Fuel level %
  TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_REMAININGFUEL, // Fuel level liters
  TelematicKey.VEHICLE_DRIVETRAIN_TOTALREMAININGRANGE, // Total range (electric + fuel)
  TelematicKey.VEHICLE_DRIVETRAIN_LASTREMAININGRANGE, // Fallback range calculation

  // Location (4 keys)
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_ALTITUDE, // Future mapping features

  // Doors (4 keys)
  TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN,

  // Windows (4 keys)
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS,

  // Lock State (1 key) - CRITICAL for security monitoring
  TelematicKey.VEHICLE_CABIN_DOOR_STATUS, // SECURED/UNLOCKED/SELECTIVE_LOCKED

  // Trunk & Hood (3 keys)
  TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN,
  TelematicKey.VEHICLE_BODY_TRUNK_ISLOCKED,
  TelematicKey.VEHICLE_BODY_HOOD_ISOPEN,

  // Sunroof (1 key)
  TelematicKey.VEHICLE_CABIN_SUNROOF_STATUS, // User-requested feature

  // Vehicle Status (3 keys)
  TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE, // Mileage
  TelematicKey.VEHICLE_ISMOVING, // Motion detection
  TelematicKey.VEHICLE_DRIVETRAIN_ENGINE_ISACTIVE, // Engine running

  // Climate (2 keys)
  TelematicKey.VEHICLE_VEHICLE_PRECONDITIONING_ACTIVITY, // Heating/cooling/ventilation
  TelematicKey.VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_COMFORTSTATE,

  // Tire Pressures (8 keys) - CRITICAL for safety monitoring
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURE,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_LEFT_TIRE_PRESSURETARGET,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURE,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW1_WHEEL_RIGHT_TIRE_PRESSURETARGET,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURE,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_LEFT_TIRE_PRESSURETARGET,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURE,
  TelematicKey.VEHICLE_CHASSIS_AXLE_ROW2_WHEEL_RIGHT_TIRE_PRESSURETARGET,

  // Service (1 key)
  TelematicKey.VEHICLE_STATUS_CONDITIONBASEDSERVICESCOUNT, // Service alerts
] as const;

/** Type for essential keys */
export type EssentialKey = (typeof ESSENTIAL_KEYS)[number];
