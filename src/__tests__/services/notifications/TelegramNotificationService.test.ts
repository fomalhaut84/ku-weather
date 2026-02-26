import { TelegramNotificationService } from '../../../services/notifications/TelegramNotificationService';
import { Config } from '../../../config';
import { WeatherAlert, AlertChange } from '../../../types/weather';
import { TelegramConfig } from '../../../services/notifications';

// Mock node-telegram-bot-api (Webhook 모드)
jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    setWebHook: jest.fn().mockResolvedValue(true),
    deleteWebHook: jest.fn().mockResolvedValue(true),
    getWebHookInfo: jest.fn().mockResolvedValue({
      url: 'https://test.com/webhook',
      pending_update_count: 0
    })
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
    getSubscriptions: jest.fn().mockReturnValue([]),
    getRelevantSubscriptions: jest.fn().mockReturnValue([
      {
        id: 'telegram:test-chat-id',
        platform: 'telegram',
        userId: 'test-chat-id',
        targetRegions: [],
        warningTypes: [],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]),
    getRelevantSubscriptionsForChange: jest.fn().mockReturnValue([
      {
        id: 'telegram:test-chat-id',
        platform: 'telegram',
        userId: 'test-chat-id',
        targetRegions: [],
        warningTypes: [],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ])
  }))
}));

// Mock TelegramSubscriptionInterface
jest.mock('../../../services/subscriptions/TelegramSubscriptionInterface', () => ({
  TelegramSubscriptionInterface: jest.fn().mockImplementation(() => ({
    handleCommand: jest.fn().mockResolvedValue({
      success: true,
      message: 'Command executed successfully'
    }),
    setWebInterface: jest.fn()
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

    it('should return true when chat id is missing (chatId is now optional)', () => {
      delete mockConfig.chatId;
      service = new TelegramNotificationService(mockConfig);
      expect(service.validateConfig()).toBe(true);
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
        LVL: '2', // 주의보 = 2
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
          warningType: 'H',
          level: '2', // 주의보 = 2
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
            warningType: 'H',
            level: '2', // 주의보 = 2
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
            warningType: 'R',
            level: '2', // 주의보 = 2
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
          warningType: 'H',
          level: '2', // 주의보 = 2
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

  describe('sendAlert - no subscribers', () => {
    it('should return success with no subscribers', async () => {
      // Override mock to return no subscriptions
      const { SubscriptionManager } = require('../../../services/notifications/SubscriptionManager');
      const mockInstance = SubscriptionManager.mock.results[SubscriptionManager.mock.results.length - 1]?.value;
      if (mockInstance) {
        mockInstance.getRelevantSubscriptions.mockReturnValue([]);
      }

      const noSubService = new TelegramNotificationService({
        enabled: true,
        botToken: 'test-token'
      });

      const result = await noSubService.sendAlert({
        REG_ID: '11B00000', REG_UP: '11000000', REG_KO: '서울',
        REG_UP_KO: '서울특별시', REG_NAME: '서울특별시',
        TM_FC: '202501281200', TM_EF: '202501281300',
        TM_IN: '202501281200', STN: '108', WRN: 'H', LVL: '2',
        CMD: '1', GRD: '', CNT: '1', RPT: '1',
        TM_ST: '202501281300', TM_ED: '202501291200',
        REG_SP: '', STN_ID: '108', TM_SEQ: '1', MAN_FC: '', MAN_IN: ''
      });
      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
    });
  });

  describe('sendAlertChange - no subscribers', () => {
    it('should return success with no subscribers', async () => {
      const { SubscriptionManager } = require('../../../services/notifications/SubscriptionManager');
      const mockInstance = SubscriptionManager.mock.results[SubscriptionManager.mock.results.length - 1]?.value;
      if (mockInstance) {
        mockInstance.getRelevantSubscriptionsForChange.mockReturnValue([]);
      }

      const noSubService = new TelegramNotificationService({
        enabled: true,
        botToken: 'test-token'
      });

      const result = await noSubService.sendAlertChange({
        type: 'NEW',
        current: {
          key: 'test', regionId: '11B00000', regionName: '서울',
          warningType: 'H', level: '2', command: '1',
          announcedAt: '202501281200', effectiveAt: '202501281300',
          lastUpdated: '202501281200'
        },
        description: '테스트'
      });
      expect(result.success).toBe(true);
      expect(result.platform).toBe('telegram');
    });
  });

  describe('processWebhookUpdate', () => {
    it('should process message update', async () => {
      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          date: Date.now() / 1000,
          chat: { id: 123, type: 'private' as const },
          text: '/help'
        }
      };
      await expect(service.processWebhookUpdate(update)).resolves.not.toThrow();
    });

    it('should process callback query update', async () => {
      const update = {
        update_id: 2,
        callback_query: {
          id: 'cb1',
          from: { id: 123, is_bot: false, first_name: 'Test' },
          chat_instance: 'test',
          data: 'subscribe:seoul',
          message: {
            message_id: 1,
            date: Date.now() / 1000,
            chat: { id: 123, type: 'private' as const }
          }
        }
      };
      await expect(service.processWebhookUpdate(update)).resolves.not.toThrow();
    });

    it('should ignore non-command message', async () => {
      const update = {
        update_id: 3,
        message: {
          message_id: 1,
          date: Date.now() / 1000,
          chat: { id: 123, type: 'private' as const },
          text: 'Hello world'
        }
      };
      await expect(service.processWebhookUpdate(update)).resolves.not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop bot without error', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('setWebInterface', () => {
    it('should set web interface without error', () => {
      const mockWebInterface = {} as any;
      expect(() => service.setWebInterface(mockWebInterface)).not.toThrow();
    });
  });

  describe('getSubscriptionManager', () => {
    it('should return subscription manager', () => {
      expect(service.getSubscriptionManager()).toBeDefined();
    });
  });

  describe('constructor options', () => {
    it('should work without chatId (no legacy)', () => {
      const s = new TelegramNotificationService({
        enabled: true,
        botToken: 'test-token'
      });
      expect(s.platformName).toBe('telegram');
    });

    it('should accept webhookUrl and webDashboardUrl', () => {
      const s = new TelegramNotificationService({
        enabled: true,
        botToken: 'test-token',
        webhookUrl: 'https://example.com/webhook',
        webDashboardUrl: 'https://dashboard.example.com'
      });
      expect(s.platformName).toBe('telegram');
    });

    it('should accept external subscription manager', () => {
      const { SubscriptionManager } = require('../../../services/notifications/SubscriptionManager');
      const externalManager = new SubscriptionManager();
      const s = new TelegramNotificationService(
        { enabled: true, botToken: 'test-token' },
        undefined,
        externalManager
      );
      expect(s.platformName).toBe('telegram');
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
        TM_FC: '202501282100',
        TM_EF: '202501282200',
        TM_IN: '2025-01-28T12:00:00.000Z',
        STN: '108',
        WRN: 'H',
        LVL: '3', // 경보 = 3
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
      expect(formattedMessage).toContain('🔴'); // 경보 level emoji
      expect(formattedMessage).toContain('🔥'); // 폭염 warning type emoji
      expect(formattedMessage).toContain('한국 기상청 제공');
    });

    it('should format alert changes with proper emojis and titles', () => {
      const mockChange: AlertChange = {
        type: 'LEVEL_UP',
        current: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: 'H',
          level: '3', // 경보 = 3
          command: '2',
          announcedAt: '202501281200',
          effectiveAt: '202501281300',
          lastUpdated: '202501281300'
        },
        previous: {
          key: 'test-key',
          regionId: '11B00000',
          regionName: '서울특별시',
          warningType: 'H',
          level: '2', // 주의보 = 2
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

    it('should format RESOLVED alert change', () => {
      const change: AlertChange = {
        type: 'RESOLVED',
        previous: {
          key: 'k1', regionId: '11B00000', regionName: '서울특별시',
          warningType: 'H', level: '2', command: '3',
          announcedAt: '202501281200', effectiveAt: '202501281300',
          lastUpdated: '202501281200'
        },
        description: '해제'
      };
      const msg = (service as any).formatAlertChange(change);
      expect(msg).toContain('✅');
      expect(msg).toContain('특보 해제');
      expect(msg).toContain('해제수준');
    });

    it('should format TIME_EXTENDED alert change', () => {
      const change: AlertChange = {
        type: 'TIME_EXTENDED',
        current: {
          key: 'k1', regionId: '11B00000', regionName: '서울특별시',
          warningType: 'H', level: '2', command: '2',
          announcedAt: '202501281200', effectiveAt: '202501291300',
          lastUpdated: '202501281200'
        },
        description: '시간 연장'
      };
      const msg = (service as any).formatAlertChange(change);
      expect(msg).toContain('⏰');
      expect(msg).toContain('시간 연장');
      expect(msg).toContain('발효시각');
    });

    it('should format MODIFIED alert change', () => {
      const change: AlertChange = {
        type: 'MODIFIED',
        current: {
          key: 'k1', regionId: '11B00000', regionName: '서울특별시',
          warningType: 'R', level: '3', command: '2',
          announcedAt: '202501281200', effectiveAt: '202501281300',
          lastUpdated: '202501281200'
        },
        description: '내용 변경'
      };
      const msg = (service as any).formatAlertChange(change);
      expect(msg).toContain('🔄');
      expect(msg).toContain('내용 변경');
    });

    it('should format weather info with all fields', () => {
      const forecast = {
        temperature: 35,
        feelsLike: 38,
        precipitationProbability: 20,
        humidity: 70
      };
      const msg = (service as any).formatWeatherInfo(forecast);
      expect(msg).toContain('35°C');
      expect(msg).toContain('체감 38°C');
      expect(msg).toContain('20%');
      expect(msg).toContain('70%');
    });

    it('should return empty string for empty forecast', () => {
      const msg = (service as any).formatWeatherInfo({});
      expect(msg).toBe('');
    });

    it('should not show feelsLike when same as temperature', () => {
      const forecast = { temperature: 35, feelsLike: 35 };
      const msg = (service as any).formatWeatherInfo(forecast);
      expect(msg).toContain('35°C');
      expect(msg).not.toContain('체감');
    });
  });
});