module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.homeybuild/',
    '/tests/lib/auth/DeviceCodeAuthProvider.test.ts', // TODO: Update to new constructor signature
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
};
