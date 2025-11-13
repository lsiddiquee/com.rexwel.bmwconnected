# BMW Connected

Monitor your BMW or Mini vehicle data in Homey using the official BMW CarData API.

This app provides **read-only** access to vehicle telematics data including location, battery/fuel levels, door/window status, charging information, and more. Real-time updates are delivered via MQTT streaming, with fallback to REST API polling when needed.

## Prerequisites

### 1. BMW CarData API Access

You must register for the BMW CarData API before pairing your vehicle:

1. Visit the [BMW ConnectedDrive Customer Portal](https://www.bmw.co.uk/en-gb/mybmw/vehicle-overview)
2. Log in with your BMW/Mini ConnectedDrive account
3. Navigate to **CarData** section
4. **Subscribe** to the **CarData API** service (free)
5. **Subscribe** to the **CarData Streaming** service (free, optional but recommended)
6. **Generate a Client ID** (save this for pairing)
7. Ensure your vehicle is mapped to your account as **PRIMARY** user

**Important**: Complete steps 1-6 **before** adding your vehicle in Homey.

### 2. Vehicle Requirements

- Vehicle must support BMW ConnectedDrive
- Active ConnectedDrive contract
- Active SIM card in vehicle
- Vehicle location: EU (currently supported region)
- User mapping: PRIMARY (not SECONDARY/co-user)

## Pairing Your Vehicle

1. Open the Homey app and go to **Devices** → **Add Device**
2. Select **BMW Connected** app
3. Choose your brand (BMW or Mini)
4. Follow the **OAuth Device Code Flow** pairing process:
   - Enter your **Client ID** from the BMW portal
   - A **user code** and **verification URL** will be displayed
   - If you cannot click the link, you can use another device to open the [link url here](https://customer.bmwgroup.com/oneid/#/link).
   - Visit the URL in a browser and enter the code
   - Authorize the app in the BMW portal
   - Return to Homey - pairing will complete automatically
5. **Container Selection** (optional):
   - A **container** is a BMW CarData API data structure that defines which telematic data keys (e.g., battery level, location, door status) the app can retrieve
   - If you have an existing container ID from the BMW portal, enter it here
   - If left empty, the app will **automatically create a new container** with the 46 essential telematic keys needed for Homey monitoring
   - The container will be named "Homey BMW Integration" with purpose "Vehicle telemetry for Homey smart home"
6. Select your vehicle from the list
7. Device will be created with real-time monitoring

## Features

### Homey Capabilities

This app displays the following data in Homey:

**All Vehicles:**

- Mileage (km/miles)
- Range (total remaining range)
- Location (GPS map view)
- Alarm (generic alarm status) (Door lock and/ir secured)

**Electric Vehicles (BEV/PHEV):**

- Battery level (%)
- Charging status (charging/not charging/complete)

**Plugin Hybrid Vehicles (PHEV):**

- Electric only range (km/miles)

**Combustion/Hybrid Vehicles:**

- Remaining fuel (liters/gallons)

**Note**: While the app collects additional vehicle data (door status, window status, lock status, tire pressures, etc.) via the BMW CarData API, these are not currently exposed as individual Homey capabilities. They are available internally for future enhancements.

### Flow Cards

**Triggers:**

- Location changed
- Battery level changed
- Fuel level changed (combustion/hybrid)
- Charging status changed (electric/hybrid)
- Refueling detected (combustion/hybrid)
- Trip completed (vehicle stopped after movement)

**Conditions:**

- Battery level is above/below X%
- Fuel level is above/below X%
- Vehicle is charging (yes/no)
- Vehicle is inside geofence (specific location)

**Actions:**

- None (read-only API)

## Data Delivery: MQTT Streaming vs API Polling

The BMW CarData API provides two methods for retrieving vehicle data:

### MQTT Streaming (Recommended)

**How it works:**

- Real-time push notifications via MQTT protocol
- Updates delivered within seconds when vehicle data changes
- **No impact on API quota** (unlimited)
- Battery-efficient for Homey

**Requirements:**

- CarData Streaming subscription (free, enabled in BMW portal)
- Configure which telematic data keys to receive in the portal

**Telematic Keys Used by Homey:**

This app subscribes to **46 essential telematic keys** out of 244 available keys for comprehensive vehicle monitoring. The keys are organized by category:

**Core Vehicle Data (46 keys total):**

- **Electric Battery & Charging** (10 keys): `vehicle.electricalSystem.battery.stateOfCharge`, `vehicle.body.chargingPort.status`, `vehicle.body.chargingPort.dcStatus`, `vehicle.drivetrain.electricEngine.remainingElectricRange`, `vehicle.drivetrain.batteryManagement.header`, `vehicle.drivetrain.electricEngine.kombiRemainingElectricRange`, `vehicle.drivetrain.electricEngine.charging.status`, `vehicle.drivetrain.electricEngine.charging.timeToFullyCharged`, `vehicle.powertrain.electric.battery.stateOfCharge.target`, plus trip segment HV SOC
- **Combustion Fuel** (3 keys): `vehicle.drivetrain.fuelSystem.level`, `vehicle.drivetrain.fuelSystem.remainingFuel`, `vehicle.drivetrain.totalRemainingRange`, `vehicle.drivetrain.lastRemainingRange`
- **Location** (4 keys): `vehicle.cabin.infotainment.navigation.currentLocation.latitude`, `vehicle.cabin.infotainment.navigation.currentLocation.longitude`, `vehicle.cabin.infotainment.navigation.currentLocation.heading`, `vehicle.cabin.infotainment.navigation.currentLocation.altitude`
- **Doors** (4 keys): `vehicle.cabin.door.row1.driver.isOpen`, `vehicle.cabin.door.row1.passenger.isOpen`, `vehicle.cabin.door.row2.driver.isOpen`, `vehicle.cabin.door.row2.passenger.isOpen`
- **Windows** (4 keys): `vehicle.cabin.window.row1.driver.status`, `vehicle.cabin.window.row1.passenger.status`, `vehicle.cabin.window.row2.driver.status`, `vehicle.cabin.window.row2.passenger.status`
- **Lock State** (1 key): `vehicle.cabin.door.status` (SECURED/UNLOCKED)
- **Trunk & Hood** (3 keys): `vehicle.body.trunk.isOpen`, `vehicle.body.trunk.isLocked`, `vehicle.body.hood.isOpen`
- **Sunroof** (1 key): `vehicle.cabin.sunroof.status`
- **Vehicle Status** (3 keys): `vehicle.vehicle.travelledDistance`, `vehicle.isMoving`, `vehicle.drivetrain.engine.isActive`
- **Climate** (2 keys): `vehicle.vehicle.preConditioning.activity`, `vehicle.cabin.hvac.preconditioning.status.comfortState`
- **Tire Pressures** (8 keys): All 4 wheels pressure + target values (`vehicle.chassis.axle.row1/row2.wheel.left/right.tire.pressure` and `pressureTarget`)
- **Service** (1 key): `vehicle.status.conditionBasedServicesCount`

**Trip Detection (3 keys):**

The app also monitors trip completion using these additional keys:

- `vehicle.trip.segment.end.time` - Timestamp when trip ended
- `vehicle.trip.segment.end.travelledDistance` - Mileage at trip end
- `vehicle.trip.segment.end.drivetrain.batteryManagement.hvSoc` - Battery SOC at trip end

These trip segment keys enable the app to detect when a journey is completed and trigger the "trip completed" flow card.

To configure streaming in the BMW portal:

1. Navigate to **CarData** → **Configure Data Stream**
2. Select the telematic keys you want to receive (Homey uses 46 keys)
3. Save configuration
4. Credentials will be visible for use

**Status:** Automatically enabled if streaming subscription is active.

### REST API Polling (Fallback)

**How it works:**

- Periodic HTTP requests to fetch vehicle data
- **Strict quota: 50 requests per 24 hours**
- Counter starts from first request, expires 24 hours later
- **Manually enabled/disabled in device settings**

**Rate Limit Implications:**

- 50 requests/24h = 1 request per ~29 minutes maximum
- Recommended: Use MQTT streaming instead
- API polling should only be used as fallback when MQTT unavailable

**Configuration:**

API polling is controlled via device settings:

- Navigate to **Device Settings** → **Enable API polling** (checkbox)
- Default: **Enabled** after pairing
- **Recommended**: Disable API polling once MQTT streaming is confirmed working to conserve quota

**Warning:** Do **not** enable frequent polling unless MQTT is unavailable. The 50 request limit is easily exhausted with polling intervals under 30 minutes.

## Settings

You can control data delivery methods in each device's settings:

- **Enable MQTT streaming** (checkbox, default: enabled): Real-time push updates via MQTT protocol
- **Enable API polling** (checkbox, default: enabled): Periodic REST API polling for vehicle data
- **API polling interval** (number, default: 60 minutes): How often to poll the API when enabled

**Recommended Configuration:**

1. After pairing, verify MQTT streaming is working (check logs or observe real-time updates)
2. Once confirmed, **disable API polling** to conserve the 50 req/24h quota
3. Use MQTT streaming as primary data source
4. Only re-enable API polling if MQTT streaming fails

The app automatically:

- Manages authentication token refresh (OAuth tokens expire after 1 hour)
- Handles container creation/validation for telematic data
- Retries failed API requests with exponential backoff
- Merges MQTT and API data intelligently (timestamp-based coherence)

## Acknowledgements

- Use at your own risk. I accept no responsibility for any damages caused by using this app.
- Reverse geo coding data is provided under ODbL and © OpenStreetMap contributors. Further details <https://www.openstreetmap.org/copyright>.

## Useful links

- [Latest release info](https://community.athom.com/t/app-bmw-connected/49199/2)
- [Changelog](https://community.athom.com/t/app-bmw-connected/49199/3)
- [FAQ](https://community.athom.com/t/app-bmw-connected/49199/4)
- [TODO List](https://community.athom.com/t/app-bmw-connected/49199/5)
