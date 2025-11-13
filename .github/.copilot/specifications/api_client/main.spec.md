# API Client Architecture Specification

## Overview

This specification defines the architecture for the BMW CarData API client library. The client library is designed to be a standalone, reusable component that can eventually be extracted into a separate npm package.

## Context

The Homey plugin previously used the mw-connected-drive npm package which relied on the unofficial BMW mobile app API. BMW has added verification that blocks unofficial access. The official BMW CarData API provides a supported way to access vehicle data, though it is read-only and requires OAuth 2.0 Device Code Flow authentication.

## Requirements

### Functional Requirements

1. **FR-1**: Authenticate users using OAuth 2.0 Device Code Flow
2. **FR-2**: Retrieve list of vehicles mapped to user account
3. **FR-3**: Retrieve static vehicle information (basic data)
4. **FR-4**: Retrieve dynamic telematic data from vehicles
5. **FR-5**: Manage telematic data containers
6. **FR-6**: Automatically refresh access tokens before expiration
7. **FR-7**: Handle API rate limiting (50 requests per 24 hours)
8. **FR-8**: Transform API responses to generic models

### Non-Functional Requirements

1. **NFR-1**: Client library must be framework-agnostic (not tied to Homey)
2. **NFR-2**: All external dependencies must be clearly defined
3. **NFR-3**: Client must handle network errors gracefully with retries
4. **NFR-4**: Client must provide detailed logging for debugging
5. **NFR-5**: Client must support dependency injection for testing
6. **NFR-6**: Client must follow TypeScript best practices with full type safety
7. **NFR-7**: Client must be extractable to separate npm package with minimal changes

## Design Decisions

### Decision 1: Layered Architecture

**Context**: Need clear separation of concerns for maintainability and testability
**Decision**: Implement a layered architecture:

- **Auth Layer**: Handle OAuth 2.0 Device Code Flow and token management
- **HTTP Layer**: Handle HTTP requests, retries, and error handling
- **API Layer**: Implement CarData API endpoints
- **Transform Layer**: Convert API responses to generic models
- **Client Layer**: Provide high-level interface for consumers

**Consequences**:

- ✅ Clear separation of concerns
- ✅ Easy to test each layer independently
- ✅ Easy to replace implementations
- ⚠️ More files and complexity
- ⚠️ Requires good interface design

### Decision 2: Interface-Based Design

**Context**: Need to support dependency injection and enable testing
**Decision**: Define interfaces for all major components:

- IAuthProvider: Authentication operations
- ITokenStore: Token persistence
- IHttpClient: HTTP operations
- IVehicleClient: Vehicle data operations
- ILogger: Logging operations

**Consequences**:

- ✅ Easy to mock for testing
- ✅ Easy to swap implementations
- ✅ Clear contracts between components
- ⚠️ More boilerplate code

### Decision 3: Generic Data Models

**Context**: Avoid tight coupling to CarData API structure
**Decision**: Create generic models that represent domain concepts, not API responses:

- Vehicle: Generic vehicle representation
- VehicleStatus: Generic status representation
- TelematicDataPoint: Generic data point representation

Use transformers to map API responses to these models.

**Consequences**:

- ✅ Can adapt to API changes without changing public interface
- ✅ Models make sense from domain perspective
- ✅ Easier to migrate to different API if needed
- ⚠️ Requires transformation layer
- ⚠️ Some information might not map perfectly

### Decision 4: Rate Limiting Strategy

**Context**: CarData API has 50 requests per 24-hour limit
**Decision**: Implement request tracking and queuing:

- Track all requests with timestamps
- Calculate remaining quota
- Queue requests if quota is low
- Provide quota information to consumers

**Consequences**:

- ✅ Prevents hitting rate limit
- ✅ Transparent to consumers
- ⚠️ Requests may be delayed
- ⚠️ Requires persistent storage for request history

### Decision 5: Token Management Strategy

**Context**: Tokens expire and must be refreshed proactively
**Decision**: Implement automatic token refresh:

- Refresh access token 5 minutes before expiration
- Refresh refresh token 1 day before expiration
- Handle refresh failures with re-authentication
- Use token store for persistence

**Consequences**:

- ✅ Seamless user experience
- ✅ No expired token errors during requests
- ⚠️ Background refresh process needed
- ⚠️ Must handle clock skew

## Architecture

### Component Diagram

\\\mermaid
graph TB
subgraph "Client Library (lib/)"
Client[VehicleClient<br/>IVehicleClient]
Auth[DeviceCodeAuthProvider<br/>IAuthProvider]
Token[TokenManager]
HTTP[HttpClient<br/>IHttpClient]
API[CarDataApiClient]
Transform[ResponseTransformer]
RateLimit[RateLimiter]
Models[Generic Models]
end

    subgraph "External Dependencies"
        Store[TokenStore<br/>ITokenStore]
        Logger[Logger<br/>ILogger]
    end

    subgraph "BMW CarData API"
        AuthAPI[OAuth Endpoints]
        DataAPI[CarData Endpoints]
    end

    Client --> Auth
    Client --> API
    Client --> Transform

    Auth --> HTTP
    Auth --> Token
    Auth --> AuthAPI

    Token --> Store

    API --> HTTP
    API --> RateLimit
    API --> DataAPI

    Transform --> Models

    HTTP --> Logger
    RateLimit --> Logger

    style Client fill:#90EE90
    style Models fill:#90EE90

\\\

### Directory Structure

\\\
lib/
├── index.ts # Barrel export
├── client/
│ ├── VehicleClient.ts # Main client implementation
│ └── IVehicleClient.ts # Client interface
├── auth/
│ ├── DeviceCodeAuthProvider.ts
│ ├── IAuthProvider.ts
│ ├── TokenManager.ts
│ ├── PkceGenerator.ts
│ └── types.ts
├── http/
│ ├── HttpClient.ts
│ ├── IHttpClient.ts
│ ├── RateLimiter.ts
│ └── errors.ts
├── api/
│ ├── CarDataApiClient.ts
│ ├── endpoints.ts
│ └── types.ts
├── models/
│ ├── Vehicle.ts
│ ├── VehicleStatus.ts
│ ├── TelematicDataPoint.ts
│ ├── BasicVehicleData.ts
│ └── index.ts
├── transform/
│ ├── ResponseTransformer.ts
│ ├── CapabilityMapper.ts
│ └── UnitConverter.ts
├── types/
│ ├── ITokenStore.ts
│ ├── ILogger.ts
│ └── index.ts
└── utils/
├── constants.ts
└── helpers.ts
\\\

### Class Diagram

\\\mermaid
classDiagram
class IVehicleClient {
<<interface>>
+getVehicles() Promise~Vehicle[]~
+getVehicleStatus(vin) Promise~VehicleStatus~
+authenticate() Promise~void~
}

    class VehicleClient {
        -authProvider: IAuthProvider
        -apiClient: CarDataApiClient
        -transformer: ResponseTransformer
        +getVehicles() Promise~Vehicle[]~
        +getVehicleStatus(vin) Promise~VehicleStatus~
        +authenticate() Promise~void~
    }

    class IAuthProvider {
        <<interface>>
        +requestDeviceCode() Promise~DeviceCodeResponse~
        +pollForTokens() Promise~TokenSet~
        +refreshTokens() Promise~TokenSet~
        +getValidAccessToken() Promise~string~
    }

    class DeviceCodeAuthProvider {
        -httpClient: IHttpClient
        -tokenManager: TokenManager
        +requestDeviceCode() Promise~DeviceCodeResponse~
        +pollForTokens() Promise~TokenSet~
        +refreshTokens() Promise~TokenSet~
        +getValidAccessToken() Promise~string~
    }

    class TokenManager {
        -tokenStore: ITokenStore
        -logger: ILogger
        +getTokenSet() TokenSet
        +saveTokenSet(tokens) void
        +isAccessTokenExpired() boolean
        +isRefreshTokenExpired() boolean
    }

    class IHttpClient {
        <<interface>>
        +get(url, headers) Promise~Response~
        +post(url, data, headers) Promise~Response~
    }

    class HttpClient {
        -rateLimiter: RateLimiter
        -logger: ILogger
        +get(url, headers) Promise~Response~
        +post(url, data, headers) Promise~Response~
        -retry(fn, attempts) Promise~Response~
    }

    class CarDataApiClient {
        -httpClient: IHttpClient
        -authProvider: IAuthProvider
        +getVehicleMappings() Promise~Mapping[]~
        +getBasicData(vin) Promise~BasicData~
        +getTelematicData(vin, containerId) Promise~TelematicData~
    }

    class ResponseTransformer {
        +toVehicle(mapping, basicData) Vehicle
        +toVehicleStatus(telematicData) VehicleStatus
        +toTelematicDataPoints(data) TelematicDataPoint[]
    }

    IVehicleClient <|.. VehicleClient
    IAuthProvider <|.. DeviceCodeAuthProvider
    IHttpClient <|.. HttpClient

    VehicleClient --> IAuthProvider
    VehicleClient --> CarDataApiClient
    VehicleClient --> ResponseTransformer

    DeviceCodeAuthProvider --> IHttpClient
    DeviceCodeAuthProvider --> TokenManager

    CarDataApiClient --> IHttpClient
    CarDataApiClient --> IAuthProvider

    HttpClient --> RateLimiter

\\\

## Implementation Details

### Authentication Flow Implementation

\\\ ypescript
// Example usage
const authProvider = new DeviceCodeAuthProvider(
httpClient,
tokenManager,
clientId,
scope
);

// Initial authentication
const deviceCode = await authProvider.requestDeviceCode();
console.log(\Visit: \\);
console.log(\Enter code: \\);

const tokens = await authProvider.pollForTokens(deviceCode.device_code);
tokenManager.saveTokenSet(tokens);

// Subsequent requests
const accessToken = await authProvider.getValidAccessToken();
// Token is automatically refreshed if needed
\\\

### Rate Limiting Implementation

\\\ ypescript
class RateLimiter {
private requests: Array<{ timestamp: Date; endpoint: string }> = [];
private readonly maxRequests = 50;
private readonly windowMs = 24 _60_ 60 \* 1000; // 24 hours

    async checkAndWait(endpoint: string): Promise<void> {
        this.cleanOldRequests();

        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = this.windowMs - (Date.now() - oldestRequest.timestamp.getTime());

            if (waitTime > 0) {
                this.logger.warn(\Rate limit reached. Waiting \ms\);
                await this.sleep(waitTime);
            }
        }

        this.requests.push({ timestamp: new Date(), endpoint });
    }

    getRemainingQuota(): number {
        this.cleanOldRequests();
        return this.maxRequests - this.requests.length;
    }

}
\\\

### Data Transformation Implementation

\\\ ypescript
class ResponseTransformer {
toVehicleStatus(telematicData: TelematicDataResponse): VehicleStatus {
return {
vin: telematicData.vin,
batteryLevel: this.extractValue(
telematicData,
'vehicle.drivetrain.electricEngine.charging.level'
),
range: this.extractValue(
telematicData,
'vehicle.drivetrain.electricEngine.remainingElectricRange'
),
location: {
latitude: this.extractValue(
telematicData,
'vehicle.cabin.infotainment.navigation.currentLocation.latitude'
),
longitude: this.extractValue(
telematicData,
'vehicle.cabin.infotainment.navigation.currentLocation.longitude'
)
},
lastUpdated: new Date()
};
}

    private extractValue(data: TelematicDataResponse, key: string): any {
        const dataPoint = data.telematicData[key];
        if (!dataPoint || dataPoint.value === null) {
            return undefined;
        }
        return this.convertValue(dataPoint.value, dataPoint.unit);
    }

}
\\\

## Testing Strategy

### Unit Tests

- Test each class in isolation with mocked dependencies
- Test PKCE generation
- Test token expiration logic
- Test rate limiting logic
- Test data transformations

### Integration Tests

- Test authentication flow with BMW API (using test account)
- Test vehicle data retrieval
- Test token refresh
- Test rate limiting with real API

### Test Structure

\\\
lib/
└── **tests**/
├── auth/
│ ├── DeviceCodeAuthProvider.test.ts
│ ├── TokenManager.test.ts
│ └── PkceGenerator.test.ts
├── http/
│ ├── HttpClient.test.ts
│ └── RateLimiter.test.ts
├── transform/
│ └── ResponseTransformer.test.ts
└── integration/
└── CarDataClient.integration.test.ts
\\\

## References

- [BMW CarData API Documentation](../domain_knowledge/bmw-cardata-api.md)
- [OAuth 2.0 Device Authorization Grant RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)
- [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
