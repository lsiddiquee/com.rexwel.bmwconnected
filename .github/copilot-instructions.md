# GitHub Copilot Instructions

This document provides context and guidance for GitHub Copilot when working on this project.

## Project Overview

This is a Homey smart home application for BMW and Mini vehicles. The app integrates with the official BMW CarData API to provide real-time vehicle monitoring and status updates within the Homey smart home platform.

## Technology Stack

- **Platform**: Homey Apps SDK v3
- **Language**: TypeScript 4.8.4
- **Target**: ES2019 (Node 12 compatibility required by Homey)
- **Build Tool**: TypeScript Compiler (tsc)
- **Linting**: ESLint 9 with flat config
- **Formatting**: Prettier with single quotes, 2 spaces

## TypeScript Guidelines

Follow the guidelines in `.github/instructions/typescript-4-es2019.instructions.md`:

- Target ES2019 (not ES2022) due to Node 12 requirement
- Use strict TypeScript settings
- Avoid any type; prefer unknown with type narrowing
- Use async/await with proper error handling
- Follow PascalCase for classes/interfaces, camelCase for everything else
- No I prefix for interfaces unless it improves clarity

## Project-Specific Patterns

### Domain Knowledge

Refer to `.github/.copilot/domain_knowledge/` for:

- BMW CarData API specifics
- Entity relationships
- Workflows and ubiquitous language

### Specifications

Refer to `.github/.copilot/specifications/` for:

- API client architecture
- Authentication patterns
- Data models

## Code Organization

### Directory Structure

```
com.rexwel.bmwconnected/
├── app.ts                 # Main Homey app
├── api.ts                 # Homey settings API
├── drivers/               # Device drivers (BMW, Mini)
│   ├── ConnectedDriver.ts # Base driver class
│   └── Vehicle.ts         # Base vehicle device
├── utils/                 # Utilities and helpers
│   ├── Logger.ts
│   ├── HomeyTokenStore.ts
│   └── ConfigurationManager.ts
└── lib/                   # NEW: Abstracted client library
    ├── client/            # API clients
    ├── models/            # Generic data models
    ├── auth/              # Authentication
    └── types/             # TypeScript types
```

### Naming Conventions

- Files: PascalCase (e.g., `DeviceCodeAuthProvider.ts`)
- Classes: PascalCase (e.g., `DeviceCodeAuthProvider`)
- Interfaces: PascalCase, no I prefix (e.g., `VehicleClient`)
- Variables/functions: camelCase (e.g., `getTelematicData`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

## Homey-Specific Guidelines

### Homey Compose System

**IMPORTANT**: The `app.json` file is **auto-generated** during the Homey build process. Never edit `app.json` directly!

Instead, edit files in the `.homeycompose` directory:

- `.homeycompose/app.json` - Base app configuration
- `.homeycompose/drivers/templates/driver.json` - Shared driver configuration template
- `.homeycompose/capabilities/*.json` - Custom capability definitions
- `.homeycompose/flow/*.json` - Flow card definitions

The Homey CLI composes these files into `app.json` during build:

```bash
homey app build  # Generates app.json from .homeycompose/
```

Driver-specific configuration uses templating:

- `{{driverAssetsPath}}` - Replaced with driver's assets path
- `$template` property - References shared templates

Example: To change pairing flow for all drivers, update `.homeycompose/drivers/templates/driver.json`.

### Lifecycle Methods

Respect Homey's lifecycle:

- `onInit()` - Initialize app/driver/device
- `onAdded()` - Device paired
- `onDeleted()` - Device removed
- `onSettings()` - Settings changed **by user via UI only**

**CRITICAL: Device Data vs Settings vs Store:**

Homey provides three types of persistent storage for devices:

1. **Device Data** (`data` property during pairing, `getData()` method):
   - **Immutable** after pairing - cannot be changed
   - Used for device identity (e.g., VIN, serial number)
   - Set once during pairing, never modified

2. **Device Store** (`store` property during pairing, `getStoreValue()`/`setStoreValue()` methods):
   - **Dynamic, persistent** storage - can be modified anytime
   - Not exposed in UI
   - Perfect for authentication credentials, API tokens, container IDs
   - Changes don't trigger lifecycle methods

3. **Device Settings** (`settings` property during pairing, `getSettings()`/`setSettings()` methods):
   - **User-configurable** preferences shown in device settings UI
   - `setSettings()` does **NOT** trigger `onSettings()`
   - `onSettings()` only called when user changes settings via Homey UI
   - Used for user preferences (polling intervals, units, etc.)

**Architecture Pattern:**

```typescript
// Pairing flow - set all three types:
return {
  name: 'My Device',
  data: { id: vin }, // Immutable identity
  store: {
    clientId: authClientId, // Dynamic, not in UI
    containerId: apiContainerId,
  },
  settings: {
    // User preferences
    pollingInterval: 60,
    distanceUnit: 'metric',
  },
};

// Repair flow - update store (not settings):
await device.setStoreValue('clientId', newClientId);
await device.setStoreValue('containerId', newContainerId);
// MUST explicitly reinitialize:
await (device as VehicleDevice).reinitializeAfterAuth();

// Device initialization - read from store:
const clientId = this.getStoreValue('clientId') as string | undefined;
const containerId = this.getStoreValue('containerId') as string | undefined;
```

See:

- https://apps.developer.homey.app/the-basics/devices/pairing
- https://apps.developer.homey.app/the-basics/devices/settings

### Logging

Use Homey's built-in logging in drivers/devices:

- `this.log()` - Info level
- `this.error()` - Error level

Use custom Logger in library code:

- `logger.info()`
- `logger.error()`
- `logger.debug()`

### Capabilities

Homey capabilities follow convention:

- Read-only: No listener needed
- Writable: Add capability listener with `this.registerCapabilityListener()`

### Token Storage

Use `HomeyTokenStore` for secure credential storage:

- Implements `ITokenStore` interface
- Stores per device using Homey's settings system
- Never log or expose tokens

## Current Architecture

The application uses the BMW CarData API with the following key characteristics:

### Authentication

OAuth 2.0 Device Code Flow with PKCE:

1. Request device code with PKCE challenge
2. Display user code and verification URL to user
3. Poll for authorization completion
4. Store access and refresh tokens securely
5. Automatically refresh tokens before expiration

See `.github/.copilot/domain_knowledge/bmw-cardata-api.md` for details.

### API Capabilities

**Read-Only Monitoring** (All Supported):

- Vehicle location and tracking
- Battery/fuel levels
- Door/window/lock status
- Mileage and odometer
- Charging status (monitoring only)
- Climate status (monitoring only)

**Not Supported** (API Limitations):

- Remote lock/unlock
- Climate control
- Charging control
- Any vehicle command execution

### Rate Limiting

BMW CarData API has strict limits:

- **50 requests per 24 hours** per vehicle
- Adjust polling intervals accordingly (40+ minutes recommended)
- Track request count and timestamps
- Handle 429 (Too Many Requests) errors gracefully

### Error Handling

- Wrap all async operations in try/catch
- Use structured error types
- Log errors with context
- Surface user-friendly messages to Homey UI

### Data Transformation

The CarData API uses telematic keys (not direct properties):

- Transform responses to generic models
- Handle unit conversions (km/miles, L/gal)
- Map telematic keys to Homey capabilities

## Development Workflow

### Feature Development

1. **Plan**: Read relevant domain knowledge/specifications
2. **Design**: Consider SOLID principles and existing patterns
3. **Implement**: Follow TypeScript guidelines and write with tests
4. **Test**: Propose test cases first, then implement with 85% coverage
5. **Validate**: Run `npm run fix` and `npm test`

### Bug Fixes

Follow the Test-Driven Development (TDD) workflow documented in the Testing section below.

### Before Committing

Always run these commands:

```bash
npm run validate  # Format check + lint + markdown lint
npm run fix       # Auto-fix all issues
npm test          # Run all tests
npm run test:coverage  # Verify 85% coverage threshold
```

## Testing

### Test Coverage Requirements

**MANDATORY**: Maintain **minimum 85% code coverage** for all new and modified code.

### Test Development Workflow

**CRITICAL**: When adding tests, follow this two-step approval process:

1. **Propose Test Cases First**:
   - Before writing any test code, create a comprehensive list of test cases
   - Include test case name, purpose, and what it validates
   - Organize by component/module (e.g., "Authentication Tests", "MQTT Tests")
   - Cover happy paths, edge cases, error scenarios, and boundary conditions
   - **Get explicit user approval** on the test case list before implementation

2. **Implement Approved Tests**:
   - Only write tests that were approved in step 1
   - Focus on meaningful tests that validate behavior, not just coverage percentage
   - Avoid "coverage for coverage's sake" - every test must have clear value

**Why This Workflow?**:

- Ensures tests validate correct behavior, not just increase metrics
- Prevents wasted effort on unnecessary or redundant tests
- Gives user visibility into test strategy before implementation
- Results in higher quality, more maintainable test suite

### Bug Fix Workflow (Test-Driven Development)

**CRITICAL**: When fixing bugs, follow this strict TDD workflow to ensure proper validation:

1. **Create Failing Test First**:
   - Write a unit test that reproduces the bug
   - The test should **fail** with the current buggy implementation
   - Test name should describe the expected correct behavior (e.g., `should_preserveApiValue_when_staleMqttInCache`)
   - Include clear comments explaining what the bug is and what the test validates

2. **Validate Test Failure**:
   - Run the specific test: `npm test -- <test-file-name> -t "<test-name>"`
   - Confirm the test **fails** for the right reason (reproduces the bug)
   - Review the failure message to ensure it accurately reflects the bug
   - **Do NOT proceed** until you've confirmed the test fails

3. **Apply Bug Fix**:
   - Implement the minimal code change needed to fix the bug
   - Follow existing code patterns and TypeScript guidelines
   - Add comments explaining the fix if the logic is non-obvious
   - Keep the fix focused - don't introduce unrelated changes

4. **Validate Test Success**:
   - Run the same test again: `npm test -- <test-file-name> -t "<test-name>"`
   - Confirm the test **passes** with the fix applied
   - Run full test suite to ensure no regressions: `npm test`
   - Verify coverage remains at or above 85%: `npm run test:coverage`

**Why This Workflow?**:

- **Prevents false positives**: Ensures test actually validates the bug fix
- **Confirms root cause**: Failing test proves you understand the bug
- **Guards against regressions**: Passing test prevents bug reintroduction
- **Documents behavior**: Test serves as executable specification
- **Builds confidence**: Red-green cycle proves the fix works

**Example**:

```typescript
// Step 1 & 2: Create failing test (reproduces bug)
it('should_preserveApiValue_when_staleMqttInCache', () => {
  // Arrange - Bug: stale MQTT overrides fresh API data
  const apiData = { fuel_level: 80, timestamp: '2025-01-15T10:00:00Z' };
  const mqttData = { fuel_level: 50, timestamp: '2025-01-15T09:00:00Z' }; // 1hr old

  // Act
  const result = mergeData(apiData, mqttData);

  // Assert - Should use API (newer), not MQTT (stale)
  expect(result.fuel_level).toBe(80); // FAILS before fix
});

// Step 3: Apply fix (add timestamp comparison)
// Step 4: Rerun test - now PASSES
```

### Test Structure

- Split tests into **Arrange, Act, Assert** sections with comments
- Use descriptive test names: `should_returnValidToken_when_authenticationSucceeds`
- Group related tests using `describe()` blocks
- Use `beforeEach()` for common setup, `afterEach()` for cleanup
- Mock external dependencies (API calls, MQTT connections, Homey SDK)

### Mock Patterns

**CRITICAL**: When mocking persistent storage (Homey's `setStoreValue`/`getStoreValue`), **always use deep clone** to simulate serialize/deserialize behavior:

```typescript
setStoreValue: jest.fn().mockImplementation((key, value) => {
  // Deep clone simulates Homey's serialization behavior
  mockStore[key] = JSON.parse(JSON.stringify(value));
  return Promise.resolve();
});
```

**Why**: Without deep clone, code that loads→mutates→saves objects will mutate the stored reference directly, causing "test pollution" within a single test. See `.github/instructions/testing-mock-patterns.instructions.md` for detailed explanation and patterns.

### Test Categories

**Unit Tests** (Primary Focus):

- Authentication flows (device code, token refresh, PKCE)
- Data transformers (telematic data → VehicleStatus)
- API clients (HTTP client, CarDataClient, ContainerManager)
- MQTT streaming (connection, message parsing, validation)
- State management (DeviceStateManager, caching)
- Error handling (API errors, network failures, invalid data)
- Rate limiting (ApiPollingManager quota tracking)

**Integration Tests** (When Applicable):

- End-to-end pairing flow
- MQTT connection with mock broker
- API polling with rate limit simulation
- Multi-device scenarios

### Before Committing

Run these commands:

```bash
npm run validate  # Format check + lint + markdown lint
npm run fix       # Auto-fix all issues
npm test          # Run all tests
npm run test:coverage  # Verify 85% coverage threshold
```

### Coverage Thresholds

Configure in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    statements: 85,
    branches: 85,
    functions: 85,
    lines: 85
  }
}
```

## Current Architecture

The application uses the BMW CarData API with the following key characteristics:

### Authentication

OAuth 2.0 Device Code Flow with PKCE:

1. Request device code with PKCE challenge
2. Display user code and verification URL to user
3. Poll for authorization completion
4. Store access and refresh tokens securely
5. Automatically refresh tokens before expiration

See `.github/.copilot/domain_knowledge/bmw-cardata-api.md` for details.

### API Capabilities

**Read-Only Monitoring** (All Supported):

- Vehicle location and tracking
- Battery/fuel levels
- Door/window/lock status
- Mileage and odometer
- Charging status (monitoring only)
- Climate status (monitoring only)

**Not Supported** (API Limitations):

- Remote lock/unlock
- Climate control
- Charging control
- Any vehicle command execution

### Rate Limiting

## Key Principles

1. **Abstraction**: Build reusable library code in `lib/`
2. **SOLID**: Follow dependency injection patterns
3. **Type Safety**: Use strict TypeScript, avoid any
4. **Error Handling**: Always handle promises, network errors
5. **Security**: Never log tokens, use secure storage
6. **Documentation**: JSDoc for public APIs, comments for intent
7. **Testing**: Write comprehensive tests with 85% minimum coverage - propose test cases before implementation
8. **Homey Patterns**: Follow SDK conventions and lifecycle

## Resources

- [Homey Apps SDK v3 Documentation](https://apps-sdk-v3.developer.homey.app/)
- [BMW CarData API docs](https://bmw-cardata.bmwgroup.com/customer/public/api-documentation)

## Questions?

Refer to:

1. Domain knowledge files in `.github/.copilot/domain_knowledge/`
2. Specifications in `.github/.copilot/specifications/`
3. Language specific instructions for coding standards in `.github/instructions/`
