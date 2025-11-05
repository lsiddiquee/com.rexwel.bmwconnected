module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.homeybuild/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^homey$': '<rootDir>/tests/__mocks__/homey.ts',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/.homeybuild'],
  // Force exit confirmed necessary for Jest worker pool management
  // All 15 test files verified to exit cleanly individually
  forceExit: true,
  // Coverage collection configuration
  collectCoverageFrom: [
    '**/*.ts',
    '!**/index.ts', // Index files are re-exporters
    '!drivers/**/device.ts', // Devices are Homey specific entry points but they are thin wrappers
    '!drivers/**/driver.ts', // Drivers are Homey specific entry points but they are thin wrappers
    '!utils/*Logger.ts',
    '!utils/ApiPollingManager.ts', // Explicitly excluding as not being used yet
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/build/**',
    '!**/build-tests/**',
    '!**/.homeybuild/**',
    '!**/tests/**',
    '!**/coverage/**',
  ],
};
