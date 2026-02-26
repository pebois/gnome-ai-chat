export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)\\.js$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/.flatpak-builder/',
    '<rootDir>/.flatpak-builddir/',
    '<rootDir>/.flatpak-repo/'
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/.flatpak-builder/',
    '<rootDir>/.flatpak-builddir/',
    '<rootDir>/.flatpak-repo/'
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true
      }
    ]
  }
}
