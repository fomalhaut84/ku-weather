// logger 모킹
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }
}));

// dotenv 모킹
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules(); // 모듈 캐시 초기화
    process.env = {}; // 환경변수 완전 초기화
  });

  afterAll(() => {
    process.env = originalEnv; // 원래 환경변수 복원
  });

  describe('validateConfig', () => {
    it('should load config successfully with required environment variables', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      const { config } = require('../../config/index');

      expect(config).toMatchObject({
        weatherApiKey: 'test-api-key',
        slackWebhookUrl: 'https://hooks.slack.com/test',
        targetRegionIds: [],
        warningTypes: [],
        subcd: undefined,
        checkIntervalMinutes: 30,
        nodeEnv: 'development',
        debug: false
      });
    });

    it('should parse TARGET_REGION_IDS correctly', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.TARGET_REGION_IDS = 'region1,region2, region3 ';

      const { config } = require('../../config/index');

      expect(config.targetRegionIds).toEqual(['region1', 'region2', ' region3 ']);
    });

    it('should parse WARNING_TYPES correctly', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.WARNING_TYPES = 'H,R, V ';

      const { config } = require('../../config/index');

      expect(config.warningTypes).toEqual(['H', 'R', ' V ']);
    });

    it('should handle SUBCD environment variable', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.SUBCD = '12';

      const { config } = require('../../config/index');

      expect(config.subcd).toBe('12');
    });

    it('should parse CHECK_INTERVAL_MINUTES correctly', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.CHECK_INTERVAL_MINUTES = '60';

      const { config } = require('../../config/index');

      expect(config.checkIntervalMinutes).toBe(60);
    });

    it('should use default CHECK_INTERVAL_MINUTES when not provided', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      const { config } = require('../../config/index');

      expect(config.checkIntervalMinutes).toBe(30);
    });

    it('should handle NODE_ENV correctly', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.NODE_ENV = 'production';

      const { config } = require('../../config/index');

      expect(config.nodeEnv).toBe('production');
    });

    it('should parse DEBUG flag correctly', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.DEBUG = 'true';

      const { config } = require('../../config/index');

      expect(config.debug).toBe(true);
    });

    it('should handle false DEBUG flag', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.DEBUG = 'false';

      const { config } = require('../../config/index');

      expect(config.debug).toBe(false);
    });

    it('should filter out empty strings from TARGET_REGION_IDS', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.TARGET_REGION_IDS = 'region1,,region2, , region3';

      const { config } = require('../../config/index');

      expect(config.targetRegionIds).toEqual(['region1', 'region2', ' region3']);
    });

    it('should filter out empty strings from WARNING_TYPES', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.WARNING_TYPES = 'H,,R, , V';

      const { config } = require('../../config/index');

      expect(config.warningTypes).toEqual(['H', 'R', ' V']);
    });

    it('should trim SUBCD value', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.SUBCD = '  12  ';

      const { config } = require('../../config/index');

      expect(config.subcd).toBe('12');
    });

    it('should handle empty SUBCD', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.SUBCD = '   ';

      const { config } = require('../../config/index');

      expect(config.subcd).toBe('');
    });
  });

  describe('validateConfig errors', () => {
    it('should throw error when WEATHER_API_KEY is missing', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      expect(() => {
        require('../../config/index');
      }).toThrow('WEATHER_API_KEY 환경변수가 설정되지 않았습니다');
    });

    it('should throw error when SLACK_WEBHOOK_URL is missing', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';

      expect(() => {
        require('../../config/index');
      }).toThrow('SLACK_WEBHOOK_URL 환경변수가 설정되지 않았습니다');
    });

    it('should throw error when CHECK_INTERVAL_MINUTES is invalid', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.CHECK_INTERVAL_MINUTES = 'invalid';

      expect(() => {
        require('../../config/index');
      }).toThrow('CHECK_INTERVAL_MINUTES는 양수여야 합니다');
    });

    it('should throw error when CHECK_INTERVAL_MINUTES is zero', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.CHECK_INTERVAL_MINUTES = '0';

      expect(() => {
        require('../../config/index');
      }).toThrow('CHECK_INTERVAL_MINUTES는 양수여야 합니다');
    });

    it('should throw error when CHECK_INTERVAL_MINUTES is negative', () => {
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.CHECK_INTERVAL_MINUTES = '-10';

      expect(() => {
        require('../../config/index');
      }).toThrow('CHECK_INTERVAL_MINUTES는 양수여야 합니다');
    });
  });

  describe('config logging', () => {
    it('should log config information with proper formatting', () => {
      const mockLogger = require('../../utils/logger').logger;
      
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.TARGET_REGION_IDS = 'region1,region2';
      process.env.WARNING_TYPES = 'H,R';
      process.env.SUBCD = '12';
      process.env.CHECK_INTERVAL_MINUTES = '45';
      process.env.NODE_ENV = 'test';
      process.env.DEBUG = 'true';

      require('../../config/index');

      expect(mockLogger.info).toHaveBeenCalledWith('설정 로드 완료:', {
        targetRegionIds: ['region1', 'region2'],
        warningTypes: ['H', 'R'],
        subcd: '12',
        checkIntervalMinutes: 45,
        nodeEnv: 'test',
        debug: true
      });
    });

    it('should log default values when arrays are empty', () => {
      const mockLogger = require('../../utils/logger').logger;
      
      process.env.WEATHER_API_KEY = 'test-api-key';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      require('../../config/index');

      expect(mockLogger.info).toHaveBeenCalledWith('설정 로드 완료:', {
        targetRegionIds: ['전국'],
        warningTypes: ['전체'],
        subcd: '전체',
        checkIntervalMinutes: 30,
        nodeEnv: 'development',
        debug: false
      });
    });
  });
});