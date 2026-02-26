/** @type {import('jest').Config} */
module.exports = {
  // TypeScript 설정
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 테스트 파일 패턴
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // 커버리지 설정
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // 메인 진입점 제외
    '!src/server.ts', // Express 서버 부트스트랩 (통합 테스트 대상)
    '!src/examples/**', // 데모 스크립트
    '!src/**/index.ts', // Barrel export 파일
  ],
  
  // 모듈 해석
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // 테스트 설정
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  
  // 환경변수 설정
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // 타임아웃 설정 (API 테스트용)
  testTimeout: 10000,
};