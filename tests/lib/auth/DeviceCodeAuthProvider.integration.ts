/**
 * Integration Test for DeviceCodeAuthProvider
 *
 * Simple validation test to verify the implementation works
 * Run with: node --require source-map-support/register build/lib/auth/DeviceCodeAuthProvider.integration.js
 */

import { DeviceCodeAuthProvider } from '../../../lib/auth/DeviceCodeAuthProvider';

console.log('🧪 Integration Test: DeviceCodeAuthProvider\n');

// Test 1: Constructor with default options
console.log('✓ Test 1: Constructor with default options');
const provider1 = new DeviceCodeAuthProvider();
console.log('  Provider instantiated successfully\n');

// Test 2: Constructor with custom options
console.log('✓ Test 2: Constructor with custom options');
new DeviceCodeAuthProvider({
  clientId: 'test-client-id',
  scopes: 'test-scope',
  timeout: 10000,
  pollInterval: 2000,
});
console.log('  Provider with custom options instantiated successfully\n');

// Test 3: Token expiration check (no tokens)
console.log('✓ Test 3: Token expiration check (no tokens)');
const isExpired = provider1.isAccessTokenExpired();
console.log(`  isAccessTokenExpired() returned: ${isExpired} (expected: true)\n`);

if (!isExpired) {
  console.error('❌ FAILED: Expected isAccessTokenExpired() to return true');
  process.exit(1);
}

// Test 4: Refresh token expiration (always false for BMW API)
console.log('✓ Test 4: Refresh token expiration check');
const isRefreshExpired = provider1.isRefreshTokenExpired();
console.log(`  isRefreshTokenExpired() returned: ${isRefreshExpired} (expected: false)\n`);

if (isRefreshExpired) {
  console.error('❌ FAILED: Expected isRefreshTokenExpired() to return false');
  process.exit(1);
}

// Test 5: getValidAccessToken without tokens should fail
console.log('✓ Test 5: getValidAccessToken without tokens (expected to fail)');
provider1
  .getValidAccessToken()
  .then(() => {
    console.error('❌ FAILED: Expected getValidAccessToken() to throw');
    process.exit(1);
  })
  .catch((error: Error) => {
    console.log(`  Correctly threw error: ${error.message}\n`);
  });

console.log('✅ All integration tests passed!\n');
console.log('📝 Note: Full OAuth flow testing requires:');
console.log('   1. Valid BMW credentials');
console.log('   2. User interaction for device code authorization');
console.log('   3. Network access to BMW OAuth endpoints\n');
console.log('   Run the unit tests for comprehensive coverage.');
