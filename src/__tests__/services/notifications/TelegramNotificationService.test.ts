import { TelegramNotificationService } from '../../../services/notifications/TelegramNotificationService';
import { Config } from '../../../config';
import { WeatherAlert, AlertChange } from '../../../types/weather';
import { TelegramConfig } from '../../../services/notifications';

// Mock node-telegram-bot-api
jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    startPolling: jest.fn().mockResolvedValue(true),
    isPolling: jest.fn().mockReturnValue(false),
    stopPolling: jest.fn().mockResolvedValue(true)
  }));
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock SubscriptionManager
jest.mock('../../../services/notifications/SubscriptionManager', () => ({
  SubscriptionManager: jest.fn().mockImplementation(() => ({
    addSubscription: jest.fn(),
    removeSubscription: jest.fn(),
    getSubscriptions: jest.fn().mockReturnValue([])
  }))
}));

// Mock TelegramSubscriptionInterface
jest.mock('../../../services/subscriptions/TelegramSubscriptionInterface', () => ({
  TelegramSubscriptionInterface: jest.fn().mockImplementation(() => ({
    handleCommand: jest.fn().mockResolvedValue({
      success: true,
      message: 'Command executed successfully'
    })
  }))
}));

describe('TelegramNotificationService', () => {
  let service: TelegramNotificationService;
  let mockConfig: TelegramConfig;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      botToken: 'test-bot-token',
      chatId: 'test-chat-id'
      };

    service = new TelegramNotificationService(mockConfig);
  });

  describe('validateConfig', () => {
    it('should return true when bot token and chat id are provided', () => {
      expect(service.validateConfig()).toBe(true);
    });

    it('should return false when bot token is missing', () => {
      mockConfig.botToken = '';
      service = new TelegramNotificationService(mockConfig);
      expect(service.validateConfig()).toBe(false);
    });

    it('should return false when chat id is missing', () => {
      mockConfig.chatId = '';
      service = new TelegramNotificationService(mockConfig);
      expect(service.validateConfig()).toBe(false);
    });
  });

  describe('platformName', () => {
    it('should return telegram as platform name', () => {
      expect(service.platformName).toBe('telegram');
    });
  });

  describe('initialize', () => {
    it('should initialize bot successfully', async () => {
      await service.initialize();
      // Should not throw error
    });

    it('should handle concurrent initialization calls safely', async () => {
      // 동시에 여러 번 초기화 호출
      const promises = [
        service.initialize(),
        service.initialize(),
        service.initialize()
      ];

      // 모든 호출이 성공적으로 완료되어야 함 (에러 없이 resolve)
      await expect(Promise.all(promises)).resolves.toEqual([undefined, undefined, undefined]);
    });

    it('should skip initialization if already initialized', async () => {
      await service.initialize();
      await service.initialize(); // 두 번째 호출은 건너뛰어야 함
      // Should not throw error
    });
  });

  describe('healthCheck', () => {
    it('should return true when bot API is accessible', async () => {
      const result = await service.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('sendAlert', () => {
    it('should send weather alert message successfully', async () => {
      const mockAlert: WeatherAlert = {
        REG_ID: '11B00000',
        REG_UP: '11000000',
        REG_KO: '서울',
        REG_UP_KO: '서울특별시',
        REG_NAME: '서울특별시',
        TM_FC: '2025-01-28T12:00:00.000Z',
        TM_EF: '2025-01-28T13:00:00.000Z',
        TM_IN: '2025-01-28T12:00:00.000Z',
        STN: '108',
        WRN: 'H',
        LVL: '주의보',
        CMD: '1',
        GRD: '',
        CNT: '1',
        RPT: '1',
        TM_ST: '2025-01-28T13:00:00.000Z',
        TM_ED: '2025-01-29T12:00:00.000Z',
        REG_SP: '',
        STN_ID: '108',
        TM_SEQ: '1',
        MAN_FC: '예보관',
        MAN_IN: '입력자'
      };

      const result = await service.sendAlert(mockAlert);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
      expect(result.responseTime).toBeDefined();
    });
  });

  describe('sendAlertChange', () => {
    it('should send alert change message successfully', async () => {
      const mockChange: AlertChange = {
        type: 'NEW',
        current: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: '폭염',
          level: '주의보',
          command: '1',
          announcedAt: '2025-01-28T12:00:00.000Z',
          effectiveAt: '2025-01-28T13:00:00.000Z',
          lastUpdated: '2025-01-28T12:00:00.000Z'
        },
        description: '신규 폭염 주의보 발표'
      };

      const result = await service.sendAlertChange(mockChange);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
      expect(result.responseTime).toBeDefined();
    });
  });

  describe('sendAlertChanges', () => {
    it('should send multiple alert changes as batch', async () => {
      const mockChanges: AlertChange[] = [
        {
          type: 'NEW',
          current: {
            key: 'test-key-1',
            regionId: '11B00000',
            regionName: '서울특별시',
            warningType: '폭염',
            level: '주의보',
            command: '1',
            announcedAt: '202501281200',
            effectiveAt: '202501281300',
            lastUpdated: '202501281200'
          },
          description: '신규 폭염 주의보 발표'
        },
        {
          type: 'RESOLVED',
          previous: {
            key: 'test-key-2',
            regionId: '26110000',
            regionName: '부산광역시',
            warningType: '호우',
            level: '주의보',
            command: '3',
            announcedAt: '2025-01-28T08:00:00.000Z',
            effectiveAt: '2025-01-28T09:00:00.000Z',
            lastUpdated: '2025-01-28T12:00:00.000Z'
          },
          description: '호우 주의보 해제'
        }
      ];

      const result = await service.sendAlertChanges(mockChanges);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].success).toBe(true);
      expect(result[0].platform).toBe('telegram');
    });

    it('should handle single change by delegating to sendAlertChange', async () => {
      const mockChange: AlertChange = {
        type: 'NEW',
        current: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: '폭염',
          level: '주의보',
          command: '1',
          announcedAt: '2025-01-28T12:00:00.000Z',
          effectiveAt: '2025-01-28T13:00:00.000Z',
          lastUpdated: '2025-01-28T12:00:00.000Z'
        },
        description: '신규 폭염 주의보 발표'
      };

      const result = await service.sendAlertChanges([mockChange]);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].success).toBe(true);
      expect(result[0].platform).toBe('telegram');
    });

    it('should handle empty changes array', async () => {
      const result = await service.sendAlertChanges([]);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].success).toBe(true);
      expect(result[0].platform).toBe('telegram');
    });
  });

  describe('formatting methods', () => {
    it('should format weather alert with proper environment prefix', () => {
      const mockAlert: WeatherAlert = {
        REG_ID: '11B00000',
        REG_UP: '11000000',
        REG_KO: '서울',
        REG_UP_KO: '서울특별시',
        REG_NAME: '서울특별시',
        TM_FC: '2025-01-28T12:00:00.000Z',
        TM_EF: '2025-01-28T13:00:00.000Z',
        TM_IN: '2025-01-28T12:00:00.000Z',
        STN: '108',
        WRN: 'H',
        LVL: '경보',
        CMD: '1',
        GRD: '',
        CNT: '1',
        RPT: '1',
        TM_ST: '2025-01-28T13:00:00.000Z',
        TM_ED: '2025-01-29T12:00:00.000Z',
        REG_SP: '',
        STN_ID: '108',
        TM_SEQ: '1',
        MAN_FC: '예보관',
        MAN_IN: '입력자'
      };

      // Access private method through any cast for testing
      const formattedMessage = (service as any).formatWeatherAlert(mockAlert);

      // Test environment should not have prefix, so just check for basic content
      expect(formattedMessage).toContain('서울특별시');
      expect(formattedMessage).toContain('🚨'); // 경보 emoji
      expect(formattedMessage).toContain('한국 기상청 제공');
    });

    it('should format alert changes with proper emojis and titles', () => {
      const mockChange: AlertChange = {
        type: 'LEVEL_UP',
        current: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: '폭염',
          level: '경보',
          command: '2',
          announcedAt: '202501281200',
          effectiveAt: '202501281300',
          lastUpdated: '202501281300'
        },
        previous: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: '폭염',
          level: '주의보',
          command: '1',
          announcedAt: '2025-01-28T12:00:00.000Z',
          effectiveAt: '2025-01-28T13:00:00.000Z',
          lastUpdated: '2025-01-28T12:00:00.000Z'
        },
        description: '폭염 경보로 상향'
      };

      // Access private method through any cast for testing
      const formattedMessage = (service as any).formatAlertChange(mockChange);

      expect(formattedMessage).toContain('⬆️'); // LEVEL_UP emoji
      expect(formattedMessage).toContain('수준 상향');
      expect(formattedMessage).toContain('주의보 → 경보');
      expect(formattedMessage).toContain('서울특별시');
      expect(formattedMessage).toContain('폭염');
    });
  });
});