---
description: 'Standard patterns for mocking in unit tests to prevent common pitfalls'
applyTo: 'tests/**/*.test.ts'
---

# Testing Mock Patterns

> Critical patterns for creating reliable mocks in unit tests

## Mock Store Pattern (Simulating Persistent Storage)

### The Problem: Object Reference Pollution

When mocking persistent storage (like Homey's `setStoreValue`/`getStoreValue`), a common pitfall is storing objects **by reference** instead of **by value**. This causes mutations to the returned object to affect the stored data, leading to test pollution.

### Why This Happens

In production, Homey's storage layer:

1. **Serializes** objects when storing: `JSON.stringify(value)` → saves to disk
2. **Deserializes** objects when retrieving: `JSON.parse(savedData)` → returns NEW object
3. Mutations to retrieved objects **do not affect stored data** (immutable snapshots)

Our mocks must replicate this serialize/deserialize behavior!

### ❌ INCORRECT Pattern (Causes Pollution)

```typescript
let mockStore: Record<string, unknown>;

beforeEach(() => {
  mockStore = {};

  mockDevice = {
    getStoreValue: jest.fn((key: string) => mockStore[key]), // ❌ Returns SAME reference
    setStoreValue: jest.fn((key: string, value: unknown) => {
      mockStore[key] = value; // ❌ Stores SAME reference
      return Promise.resolve();
    }),
  };
});
```

**Problem**: When code loads an object, mutates it, and saves it back, the mutation **already happened** in `mockStore` before `setStoreValue` is even called!

```typescript
// Code under test
const data = device.getStoreValue('state'); // Gets mockStore['state'] reference
data.value = 'mutated'; // Mutates mockStore['state'] directly!
await device.setStoreValue('state', data); // Stores same reference (already mutated)
```

### ✅ CORRECT Pattern (Deep Clone)

```typescript
let mockStore: Record<string, unknown>;

beforeEach(() => {
  mockStore = {};

  mockDevice = {
    getStoreValue: jest
      .fn<(key: string) => unknown>()
      .mockImplementation((key: string) => mockStore[key]),
    setStoreValue: jest
      .fn<(key: string, value: unknown) => Promise<void>>()
      .mockImplementation((key: string, value: unknown) => {
        // ✅ Deep clone simulates serialize/deserialize
        mockStore[key] = JSON.parse(JSON.stringify(value));
        return Promise.resolve();
      }),
  };
});
```

**Why This Works**:

- `setStoreValue` stores a **copy** of the object (simulating serialization)
- `getStoreValue` returns the copy from `mockStore`
- Mutations affect the copy, not `mockStore`
- Next `getStoreValue` returns an unchanged immutable snapshot

### Real-World Example: DeviceStateManager Pattern

The issue was discovered in `DeviceStateManager` which uses this pattern:

```typescript
async updateCache(data: Record<string, TelematicDataPoint>) {
  const storeData = this.loadStoreData();  // Calls getStoreValue()

  // Mutates the returned object
  for (const [key, dataPoint] of Object.entries(data)) {
    storeData.telematicCache[key] = dataPoint;  // MUTATION
  }

  await this.saveStoreData(storeData);  // Calls setStoreValue()
}
```

**Without deep clone**:

1. `loadStoreData()` returns `mockStore['deviceState']` (reference)
2. Code mutates that object
3. `saveStoreData()` stores it: `mockStore['deviceState'] = storeData`
4. But `storeData` **IS** `mockStore['deviceState']` (same reference!)
5. Mutation already happened in `mockStore` before `setStoreValue`

**With deep clone**:

1. Previous `setStoreValue` stored a COPY
2. `loadStoreData()` returns the copy
3. Code mutates the copy
4. `saveStoreData()` stores a NEW copy
5. `mockStore` contains immutable snapshots

### When to Use Deep Clone

Use deep clone in storage mocks when:

- ✅ Code loads data, mutates it, and saves it back (read-modify-write pattern)
- ✅ Mocking persistent storage (Homey store, database, file system)
- ✅ Testing code that calls `getStoreValue()` multiple times in same test
- ✅ Objects contain nested data that will be mutated

Don't need deep clone when:

- ❌ Mocking simple getters/setters with primitives
- ❌ Code creates new objects instead of mutating loaded ones
- ❌ Using immutable data structures (e.g., Redux reducers)

## Testing Checklist

When writing tests with mock storage:

1. **Create fresh `mockStore` in `beforeEach()`** ✅
2. **Use `mockImplementation()` to capture variable reference** ✅
3. **Deep clone in `setStoreValue` mock** ✅
4. **Verify test isolation** by running tests with `.only` individually
5. **Check for object mutation** if tests pass alone but fail together

## Common Symptoms of Missing Deep Clone

- ✅ Test passes when run alone (`.only`)
- ❌ Test fails when run with other tests
- ❌ Unexpected values from "previous" tests appear
- ❌ Timestamp-based logic rejects "older" data that should be fresh
- ✅ `mockStore = {}` shows empty in `beforeEach()` logs
- ❌ But `getStoreValue()` returns data from previous tests

## Additional Resources

See test files for examples:

- `tests/utils/DeviceStateManager.cacheCoherence.test.ts` - Production example
- `tests/utils/mockStore-pollution-demo.test.ts` - Executable demonstration
- `tests/utils/WHY-DEEP-CLONE-NEEDED.md` - Detailed explanation

## Template for Storage Mocks

```typescript
describe('MyComponent Tests', () => {
  let mockStore: Record<string, unknown>;
  let mockDevice: jest.Mocked<Homey.Device>;

  beforeEach(() => {
    // Fresh empty store
    mockStore = {};

    // Mock device with proper cloning
    mockDevice = {
      getStoreValue: jest
        .fn<(key: string) => unknown>()
        .mockImplementation((key: string) => mockStore[key]),
      setStoreValue: jest
        .fn<(key: string, value: unknown) => Promise<void>>()
        .mockImplementation((key: string, value: unknown) => {
          // Deep clone to simulate serialize/deserialize
          mockStore[key] = JSON.parse(JSON.stringify(value));
          return Promise.resolve();
        }),
    } as unknown as jest.Mocked<Homey.Device>;
  });

  // Tests here...
});
```

## Key Takeaway

**Deep clone in storage mocks simulates real-world serialize/deserialize behavior where stored data is immutable snapshots, not live mutable references.**

Without this, "test pollution" occurs not from cross-test contamination (mockStore IS reset), but from intra-test object mutation affecting the mock store before the next read.
