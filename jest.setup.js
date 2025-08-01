// Jest 설정 파일
// 모든 테스트 실행 전에 로드됩니다

// 환경변수 설정 (테스트용)
process.env.NODE_ENV = 'test';
process.env.WEATHER_API_KEY = 'test-api-key';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
process.env.TARGET_REGION_IDS = 'test-region';
process.env.WARNING_TYPES = 'H,R';
process.env.CHECK_INTERVAL_MINUTES = '5';
process.env.DEBUG = 'false';

// fetch API 모킹을 위한 전역 설정
global.fetch = jest.fn();

// 테스트 타임존 설정
process.env.TZ = 'Asia/Seoul';