module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
  moduleNameMapper: { '^@fernleaf/contracts$': '<rootDir>/packages/contracts/src/index.ts' },
  transform: {
    '^.+\\.tsx?$': [require.resolve('ts-jest'), { tsconfig: '<rootDir>/apps/api/tsconfig.json' }],
  },
  testTimeout: 30000,
  clearMocks: true,
};
