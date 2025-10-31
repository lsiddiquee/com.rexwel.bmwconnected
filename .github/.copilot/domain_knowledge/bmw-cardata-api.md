# BMW CarData API Domain Knowledge

## Overview

This document describes the domain knowledge for the BMW CarData API, which is the official BMW Group API for customers to access their vehicle telematics data.

## Ubiquitous Language

### Core Entities

**VIN (Vehicle Identification Number)**

- A standardized 17-digit code used to uniquely identify a vehicle
- Required for all vehicle-specific API calls
- Example: WBY31AW090FP15359

**Mapping**

- The link between a Customer ID (GCID) and a VIN
- Allows a user to access vehicle data and functions
- Types: PRIMARY (main user/owner) or SECONDARY (co-user/joint user)

**Client ID**

- A unique identifier generated in the BMW customer portal
- Required for OAuth 2.0 Device Code Flow authentication
- Used to register devices and generate tokens

**Access Token**

- JWT token used to authenticate API requests
- Valid for 1 hour (3600 seconds)
- Included in the Authorization header of each request
- Scope: uthenticate_user openid cardata:api:read cardata:streaming:read

**Refresh Token**

- Used to obtain new access and ID tokens
- Valid for two weeks (1,209,600 seconds)
- Should be refreshed before expiration to maintain access

**ID Token**

- Used for accessing the CarData streaming API
- Valid for 1 hour (3600 seconds)
- Not used in REST API calls

**Telematic Data Key**

- An attribute or logically connected set of attributes containing vehicle data
- Examples: ehicle.drivetrain.electricEngine.charging.level, ehicle.cabin.infotainment.navigation.currentLocation.longitude
- Organized in a hierarchical structure

**Container**

- A data structure representing a specific use case
- Contains a collection of telematic data keys
- Maximum 10 containers per user
- States: ACTIVE or INACTIVE
- Example: "HV Battery" container with battery-related telematic keys

**Telematic Data Catalogue (TDC)**

- The single point of truth for available telematic data keys
- Contains descriptions and metadata for each key
- Available in multiple languages

**Basic Data**

- Static vehicle information (brand, model, color, construction date, etc.)
- Retrieved from /customers/vehicles/{vin}/basicData endpoint
- Does not count against telematic data retrieval

### Key Concepts

**Device Code Flow**

- OAuth 2.0 authorization method for devices with limited input capabilities
- User authorizes via browser on another device
- Steps:
  1. Generate code_challenge (PKCE)
  2. Request device_code and user_code
  3. Display user_code and verification_url to user
  4. Poll token endpoint until user authorizes
  5. Receive access_token, refresh_token, and id_token

**PKCE (Proof Key for Code Exchange)**

- Security extension for OAuth 2.0
- Uses code_verifier (random string) and code_challenge (SHA256 hash)
- Prevents authorization code interception attacks

**Rate Limiting**

- API has a quota of 50 requests per 24 hours
- Counter starts from first request and expires 24 hours later
- Streaming API recommended for frequent data access

**SIM Status**

- Vehicle must have ACTIVE SIM card for CarData access
- Vehicle must be in supported market (EU)
- Must have active ConnectedDrive contract

## Entity Relationships

`Customer (GCID)
  │
  ├─── Has Many: Mappings
  │       └─── Links to: Vehicle (VIN)
  │               ├─── Has One: BasicData
  │               └─── Has Many: TelematicData (via Container)
  │
  ├─── Has Many: Containers
  │       └─── Contains Many: TelematicDataKeys
  │
  └─── Has One: ClientID
          └─── Used for: Authentication
                  ├─── Generates: AccessToken (1 hour)
                  ├─── Generates: RefreshToken (2 weeks)
                  └─── Generates: IDToken (1 hour)`

## Workflows

### Initial Setup Workflow

1. User logs into BMW ConnectedDrive customer portal
2. User navigates to CarData section
3. User generates Client ID
4. User subscribes to CarData API service
5. User maps vehicle to their account (if not already mapped)

### Authentication Workflow

1. Application generates code_verifier and code_challenge
2. Application requests device_code from /gcdm/oauth/device/code
3. Application displays user_code and verification_url to user
4. User visits verification_url in browser and enters user_code
5. User authorizes the application
6. Application polls /gcdm/oauth/token with device_code
7. Application receives access_token, refresh_token, and id_token
8. Application stores tokens securely

### Token Refresh Workflow

1. Application monitors token expiration
2. Before access_token expires (within ~5 minutes)
3. Application calls /gcdm/oauth/token with grant_type=refresh_token
4. Application receives new access_token, refresh_token, and id_token
5. Application updates stored tokens

### Vehicle Data Retrieval Workflow

1. Application retrieves vehicle mappings from /customers/vehicles/mappings
2. For each PRIMARY mapped vehicle:
   a. Retrieve basic data from /customers/vehicles/{vin}/basicData
   b. Create or retrieve container with desired telematic keys
   c. Retrieve telematic data from /customers/vehicles/{vin}/telematicData?containerId={id}
3. Transform API responses to application models
4. Update UI with vehicle data

### Container Management Workflow

1. Application checks if container exists for vehicle
2. If not, create container via POST /customers/containers/
   - Name: Application-specific name
   - Purpose: Description of use case
   - TelematicDataKeys: Array of technical descriptors
3. Store container ID for future requests
4. Container state must be ACTIVE for data retrieval

## Data Structures

### VehicleMapping Response

`Typescript
{
  mappedSince: string; // ISO 8601 timestamp
  mappingType: 'PRIMARY' | 'SECONDARY';
  vin: string;
}
`

### BasicData Response

`Typescript
{
  bodyType: string;
  brand: 'BMW' | 'MINI' | 'RollsRoyce' | 'ToyotaSupra';
  chargingModes: string[];
  colourCodeRaw: string;
  colourDescription: string;
  constructionDate: string; // ISO 8601
  countryCode: string;
  driveTrain: 'BEV' | 'PHEV' | 'ICE';
  engine: string;
  fullSAList: string; // Comma-separated equipment codes
  hasNavi: boolean;
  hasSunRoof: boolean;
  headUnit: string;
  modelKey: string;
  modelName: string;
  numberOfDoors: number;
  propulsionType: string;
  series: string;
  seriesDevt: string;
  simStatus: 'ACTIVE' | 'INACTIVE';
  steering: 'LL' | 'RL'; // Left/Right steering
}
`

### TelematicData Response

`Typescript
{
  telematicData: {
    [key: string]: {
      timestamp: string | null; // ISO 8601
      unit: string | null;
      value: string | null;
    }
  }
}
`

## API Endpoints

### Authentication

- **POST** /gcdm/oauth/device/code - Request device code
- **POST** /gcdm/oauth/token - Get or refresh tokens

### Vehicle Information

- **GET** /customers/vehicles/mappings - List mapped vehicles
- **GET** /customers/vehicles/{vin}/basicData - Get static vehicle data
- **GET** /customers/vehicles/{vin}/telematicData?containerId={id} - Get telematic data

### Container Management

- **GET** /customers/containers - List all containers
- **POST** /customers/containers - Create new container
- **GET** /customers/containers/{id} - Get container details
- **DELETE** /customers/containers/{id} - Mark container for deletion (INACTIVE)

## Constraints and Rules

### Business Rules

1. Only PRIMARY mapped vehicles can be accessed via API
2. User must be in supported market (EU currently)
3. Vehicle must have active SIM card
4. Active ConnectedDrive contract required
5. Maximum 10 containers per user
6. 50 API requests per 24-hour window

### Technical Rules

1. All timestamps in ISO 8601 format with UTC timezone
2. Access token must be refreshed before 1-hour expiration
3. Refresh token must be refreshed before 2-week expiration
4. Container must be in ACTIVE state for data retrieval
5. INACTIVE containers automatically deleted after 29 days
6. VIN must be exactly 17 uppercase characters
7. Container ID is 13 characters
8. All API requests require Authorization header with Bearer token
9. API version header x-version: v1 required
10. Optional Accept-Language header for localized responses

## Error Handling

Common error codes:

- **CU-100**: No token sent
- **CU-101**: Authentication error
- **CU-102**: Token expired
- **CU-103**: Token scope is not CarData
- **CU-104**: No permission for specified VIN
- **CU-105**: No permission for specified containerId
- **CU-429**: API rate limit reached
- **CU-500**: Internal server error

## Streaming API

### Overview

The BMW CarData Streaming API provides real-time vehicle data via MQTT protocol, offering an alternative to the REST API that **does not count against the 50 requests per 24-hour quota**. This makes it ideal for applications requiring frequent updates.

**Reference Documentation**: <https://bmw-cardata.bmwgroup.com/customer/public/api-documentation/Id-Streaming>

### Key Characteristics

**Technology Stack:**

- **Protocol**: MQTT (Message Queuing Telemetry Transport)
- **Transport**: mqtts:// (MQTT over SSL/TLS)
- **Authentication**: OAuth ID Token (from Device Code Flow)
- **Security**: SSL/TLS encryption for all data in transit
- **Message Format**: JSON

**Availability:**

- ✅ BMW vehicles
- ✅ MINI vehicles
- ✅ Rolls-Royce vehicles
- ✅ Toyota Supra vehicles
- ❌ BMW Motorrad (not supported)

**Benefits:**

- Real-time data updates (no polling delay)
- Does not consume REST API quota
- Lower latency than REST polling
- Efficient bandwidth usage
- Push-based updates (only when data changes)

### Prerequisites

1. **Vehicle Mapping**: Vehicle must be mapped as PRIMARY user
2. **Client ID**: Generated in customer portal
3. **Streaming Subscription**: Must subscribe to "CarData Streaming" in portal (separate from API subscription)
4. **Correct Scopes**: Device must be registered with scope `cardata:streaming:read`
5. **ID Token**: Valid ID token from Device Code Flow (not access token)

**Important**: Streaming subscription must be completed **before** registering device with Device Code Flow.

### Connection Parameters

Retrieved from customer portal after configuring streaming:

```typescript
{
  host: string; // MQTT broker address (default: customer.streaming-cardata.bmwgroup.com)
  port: number; // SSL/TLS port (default: 9000)
  username: string; // Your GCID (Customer ID)
  password: string; // Current ID Token (expires in 1 hour)
  topic: string; // Format: "username/VIN" or "username/+" for all vehicles
}
```

### MQTT Topic Structure

**Single Vehicle:**

```
{gcid}/{vin}
```

Example: `G123456789/WBY31AW090FP15359`

**All Vehicles:**

```
{gcid}/+
```

Example: `G123456789/+`

### Streaming Configuration

Configure in customer portal which telematic data keys to receive:

1. Navigate to CarData section
2. Click "Configure data stream"
3. Select desired telematic data keys
4. Save configuration
5. Credentials become visible

**Message Format:**

```json
{
  "timestamp": "2025-10-17T15:30:00.000Z",
  "vin": "WBY31AW090FP15359",
  "data": {
    "vehicle.drivetrain.electricEngine.charging.level": {
      "value": "85",
      "unit": "%",
      "timestamp": "2025-10-17T15:29:45.000Z"
    },
    "vehicle.cabin.infotainment.navigation.currentLocation.longitude": {
      "value": "4.895168",
      "unit": "degrees",
      "timestamp": "2025-10-17T15:29:50.000Z"
    }
  }
}
```

### Connection Lifecycle

**1. Initial Connection:**

```typescript
// Using MQTT.js example
import mqtt from 'mqtt';

const client = mqtt.connect('mqtts://mqtt.bmwgroup.com:8883', {
  clientId: `homey_${Math.random().toString(16).slice(2, 10)}`,
  username: gcid,
  password: idToken,
  protocol: 'mqtts',
  rejectUnauthorized: true,
});
```

**2. Subscribe to Topic:**

```typescript
client.on('connect', () => {
  client.subscribe(`${gcid}/${vin}`, (err) => {
    if (!err) {
      console.log('Subscribed to vehicle stream');
    }
  });
});
```

**3. Receive Messages:**

```typescript
client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());
  // Process vehicle data
});
```

**4. Handle Token Expiration:**

```typescript
// ID Token expires after 1 hour
// Must disconnect and reconnect with new token
client.end();
// Refresh ID token via Device Code Flow
// Reconnect with new token
```

### Constraints and Limitations

1. **Single Connection per User**: Only one MQTT connection per GCID at a time
2. **Token Expiration**: ID Token valid for 1 hour, must reconnect with fresh token
3. **Scope Validation**: ID Token must have `cardata:streaming:read` scope
4. **Network Requirements**: Stable internet connection required
5. **Message Rate**: Depends on vehicle activity and selected data keys
6. **No Historical Data**: Only real-time updates (no historical replay)

### Error Handling

**Connection Errors:**

- Invalid ID Token → HTTP 401, connection refused
- Expired ID Token → Connection dropped after 1 hour
- Missing scopes → Connection refused
- Network interruption → Auto-reconnect with exponential backoff

**Recovery Strategy:**

1. Detect connection drop
2. Check ID Token expiration
3. If expired, refresh via Device Code Flow
4. Reconnect with new token
5. Resubscribe to topics

### Streaming vs REST API Comparison

| Feature            | REST API                   | Streaming API        |
| ------------------ | -------------------------- | -------------------- |
| **Rate Limit**     | 50 requests/24h            | No limit             |
| **Latency**        | Polling interval (minutes) | Real-time (seconds)  |
| **Bandwidth**      | Full response each time    | Only changed data    |
| **Use Case**       | Periodic checks            | Real-time monitoring |
| **Authentication** | Access Token               | ID Token             |
| **Connection**     | Stateless HTTP             | Persistent MQTT      |
| **Data Format**    | REST JSON                  | MQTT JSON            |

**Recommendation**: Use streaming for real-time updates, fallback to REST API if streaming unavailable.

## Integration Considerations

### Rate Limiting Strategy

- **Primary**: Use MQTT streaming for real-time data (no quota consumption)
- **Fallback**: Use REST API when streaming unavailable
- **Hybrid**: Streaming for frequent updates, REST for on-demand queries
- Track request count and timestamps for REST calls
- Implement request queuing for REST API
- Prioritize essential data requests
- Use longer polling intervals (40-60 minutes) if streaming not available

### Token Management Strategy

- **Access Token** (REST API): Refresh 5 minutes before expiration
- **ID Token** (Streaming): Reconnect 5 minutes before 1-hour expiration
- **Refresh Token**: Refresh 1 day before 2-week expiration
- Handle token refresh failures gracefully
- Re-authenticate if refresh token expires
- Store tokens securely per-device

### Streaming Connection Strategy

- Enable streaming by default for real-time data
- Implement auto-reconnect with exponential backoff
- Refresh ID token before expiration (55 minutes)
- Gracefully disconnect and reconnect with new token
- Handle network interruptions transparently
- Subscribe to all mapped vehicles with `{gcid}/+`
- Parse and validate incoming MQTT messages
- Update device capabilities from streaming data

### Data Caching Strategy

- Cache basic data (changes rarely)
- Cache telematic data from streaming messages
- Update cache on each MQTT message
- Invalidate cache on connection errors
- Store last successful update timestamp
- Fallback to REST API if streaming connection drops
