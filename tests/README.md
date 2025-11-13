# Tests

This directory contains all test files for the project, organized to mirror the source code structure.

## Structure

```text
tests/
├── lib/
│   └── auth/
│       ├── DeviceCodeAuthProvider.test.ts        # Unit tests for OAuth Device Code Flow
│       └── DeviceCodeAuthProvider.integration.ts # Integration test for basic validation
└── README.md
```

## Running Tests

### Unit Tests

The unit tests are written for Node's built-in `assert` module and include comprehensive mocking. To run them, you'll need a test runner like:

- **Jest**: `npm install --save-dev jest @types/jest ts-jest`
- **Vitest**: `npm install --save-dev vitest`
- **Mocha**: `npm install --save-dev mocha @types/mocha ts-node`

Example with Vitest:

```bash
npm install --save-dev vitest
npx vitest tests/lib/auth/DeviceCodeAuthProvider.test.ts
```

### Integration Tests

Integration tests verify basic functionality without mocking external dependencies. Run with:

```bash
npm run build
node --require source-map-support/register build/tests/lib/auth/DeviceCodeAuthProvider.integration.js
```

## Test Coverage

### Authentication (`lib/auth/`)

- ✅ **DeviceCodeAuthProvider** - OAuth 2.0 Device Code Flow
  - Constructor initialization
  - Device code request with PKCE
  - Token polling with various OAuth error responses
  - Token refresh logic
  - Automatic token expiration handling
  - Token storage integration
  - Error handling

## Writing Tests

When adding new tests:

1. Mirror the source code directory structure
2. Name test files with `.test.ts` suffix
3. Name integration tests with `.integration.ts` suffix
4. Use descriptive test names with `describe` and `it` blocks
5. Include arrange, act, assert sections
6. Test both success and error paths

## Mock Implementations

Test files include mock implementations for:

- `MockTokenStore` - Implements `ITokenStore` with in-memory storage
- `MockLogger` - Implements `ILogger` with log capture
- `FetchMock` - Mocks the global `fetch` API for HTTP testing

These mocks can be reused across test files.
