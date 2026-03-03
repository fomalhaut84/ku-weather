import { MultiplatformNotificationService } from '../../../services/notifications/MultiplatformNotificationService';
import { NotificationService, NotificationResult } from '../../../services/notifications/interfaces';
import { WeatherAlert, AlertChange } from '../../../types/weather';
import { CircuitState } from '../../../services/notifications/CircuitBreaker';

// logger 모킹
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

// Mock 알림 서비스 생성
class MockNotificationService implements NotificationService {
  public readonly platformName: string;
  private shouldFail: boolean;

  constructor(platformName: string, shouldFail: boolean = false) {
    this.platformName = platformName;
    this.shouldFail = shouldFail;
  }

  validateConfig(): boolean {
    return !this.shouldFail;
  }

  async sendAlert(alert: WeatherAlert): Promise<NotificationResult> {
    if (this.shouldFail) {
      throw new Error(`${this.platformName} service error`);
    }

    return {
      platform: this.platformName,
      success: true,
      responseTime: 100
    };
  }

  async sendAlertChange(change: AlertChange): Promise<NotificationResult> {
    if (this.shouldFail) {
      return {
        platform: this.platformName,
        success: false,
        error: 'Mock service failure',
        responseTime: 50
      };
    }

    return {
      platform: this.platformName,
      success: true,
      responseTime: 100
    };
  }

  async sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]> {
    // 간단한 구현: 각 변동에 대해 개별 전송
    const results: NotificationResult[] = [];
    for (const change of changes) {
      results.push(await this.sendAlertChange(change));
    }
    return results;
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

describe('MultiplatformNotificationService', () => {
  let multiService: MultiplatformNotificationService;
  let mockSlackService: MockNotificationService;
  let mockTelegramService: MockNotificationService;

  beforeEach(() => {
    mockSlackService = new MockNotificationService('slack');
    mockTelegramService = new MockNotificationService('telegram');
    multiService = new MultiplatformNotificationService([mockSlackService, mockTelegramService]);
  });

  const createMockAlert = (overrides: Partial<WeatherAlert> = {}): WeatherAlert => ({
    TM_FC: '202508011500',
    TM_EF: '202508011600',
    TM_IN: '202508011400',
    STN: '184',
    REG_ID: 'L1020110',
    WRN: 'H',
    LVL: '2',
    CMD: '1',
    GRD: '00',
    CNT: '1',
    RPT: '101',
    TM_ST: '',
    TM_ED: '',
    REG_SP: '',
    REG_UP: '',
    REG_KO: '',
    REG_UP_KO: '서울특별시',
    REG_NAME: '서울강북',
    STN_ID: '184',
    TM_SEQ: '',
    MAN_FC: '',
    MAN_IN: '',
    ...overrides
  });

  const createMockChange = (
    type: 'NEW' | 'RESOLVED' | 'LEVEL_UP' | 'LEVEL_DOWN' | 'TIME_EXTENDED' | 'MODIFIED'
  ): AlertChange => ({
    type,
    description: `${type} 테스트`,
    current: {
      regionId: 'L1020110',
      regionName: '서울강북',
      warningType: 'H',
      level: '2',
      command: '1',
      announcedAt: '202508011500',
      effectiveAt: '202508011600',
      key: 'test-key',
      lastUpdated: '202508011400'
    }
  });

  describe('서비스 관리', () => {
    test('초기 서비스 목록 확인', () => {
      expect(multiService.getPlatformNames()).toEqual(['slack', 'telegram']);
    });

    test('서비스 추가', () => {
      const discordService = new MockNotificationService('discord');
      multiService.addService(discordService);
      
      expect(multiService.getPlatformNames()).toEqual(['slack', 'telegram', 'discord']);
    });

    test('서비스 제거', () => {
      const removed = multiService.removeService('telegram');
      
      expect(removed).toBe(true);
      expect(multiService.getPlatformNames()).toEqual(['slack']);
    });

    test('존재하지 않는 서비스 제거 시도', () => {
      const removed = multiService.removeService('nonexistent');
      
      expect(removed).toBe(false);
      expect(multiService.getPlatformNames()).toEqual(['slack', 'telegram']);
    });
  });

  describe('특보 알림 전송', () => {
    test('모든 플랫폼에 성공적으로 전송', async () => {
      const alert = createMockAlert();
      
      const results = await multiService.sendAlert(alert);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.map(r => r.platform)).toEqual(['slack', 'telegram']);
    });

    test('일부 플랫폼 전송 실패', async () => {
      const failingService = new MockNotificationService('failing', true);
      const testService = new MultiplatformNotificationService([mockSlackService, failingService]);
      
      const alert = createMockAlert();
      const results = await testService.sendAlert(alert);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);  // slack
      expect(results[1].success).toBe(false); // failing service
    });

    test('등록된 서비스가 없을 때', async () => {
      const emptyService = new MultiplatformNotificationService([]);
      const alert = createMockAlert();
      
      const results = await emptyService.sendAlert(alert);
      
      expect(results).toEqual([]);
    });
  });

  describe('특보 변동 알림 전송', () => {
    test('단일 변동 알림 전송', async () => {
      const change = createMockChange('NEW');
      
      const results = await multiService.sendAlertChange(change);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('다중 변동 알림 전송', async () => {
      const changes = [
        createMockChange('NEW'),
        createMockChange('RESOLVED')
      ];
      
      const results = await multiService.sendAlertChanges(changes);
      
      // 각 서비스가 2개의 변동에 대해 각각 결과를 반환 (총 4개)
      expect(results).toHaveLength(4);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('빈 변동 배열 전송', async () => {
      const results = await multiService.sendAlertChanges([]);
      
      expect(results).toEqual([]);
    });
  });

  describe('건강 상태 확인', () => {
    test('모든 서비스가 정상인 경우', async () => {
      const healthStatus = await multiService.healthCheck();
      
      expect(healthStatus).toEqual({
        slack: true,
        telegram: true
      });
    });

    test('일부 서비스가 비정상인 경우', async () => {
      const failingService = new MockNotificationService('failing', true);
      const testService = new MultiplatformNotificationService([mockSlackService, failingService]);
      
      const healthStatus = await testService.healthCheck();
      
      expect(healthStatus).toEqual({
        slack: true,
        failing: false
      });
    });

    test('등록된 서비스가 없을 때', async () => {
      const emptyService = new MultiplatformNotificationService([]);
      
      const healthStatus = await emptyService.healthCheck();
      
      expect(healthStatus).toEqual({});
    });
  });

  describe('재시도 기능', () => {
    test('첫 시도에 성공하는 경우', async () => {
      const alert = createMockAlert();
      
      const results = await multiService.sendAlertWithRetry(alert, 3, 10);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('재시도 후 성공하는 경우', async () => {
      // 실제로는 재시도 로직을 더 정교하게 테스트해야 하지만,
      // 여기서는 기본적인 구조만 테스트
      const alert = createMockAlert();
      
      const results = await multiService.sendAlertWithRetry(alert, 2, 10);
      
      expect(results).toHaveLength(2);
    });
  });

  describe('통계 기능', () => {
    test('통계 구조 확인', () => {
      const stats = multiService.getStatistics();
      
      // 현재는 빈 구조만 반환 (향후 구현 예정)
      expect(typeof stats).toBe('object');
    });
  });

  describe('에러 처리', () => {
    test('서비스에서 예외 발생 시 처리', async () => {
      const throwingService: NotificationService = {
        platformName: 'throwing',
        validateConfig: () => true,
        sendAlert: async () => {
          throw new Error('Service exception');
        },
        sendAlertChange: async () => {
          throw new Error('Service exception');
        },
        sendAlertChanges: async () => {
          throw new Error('Service exception');
        },
        healthCheck: async () => {
          throw new Error('Health check exception');
        }
      };

      const testService = new MultiplatformNotificationService([throwingService]);
      
      // 예외가 발생해도 서비스가 중단되지 않고 결과를 반환
      const alert = createMockAlert();
      const results = await testService.sendAlert(alert);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Service exception');
    });

    test('건강 상태 확인 중 예외 발생 시 처리', async () => {
      const throwingService: NotificationService = {
        platformName: 'throwing',
        validateConfig: () => true,
        sendAlert: async () => ({ platform: 'throwing', success: true }),
        sendAlertChange: async () => ({ platform: 'throwing', success: true }),
        sendAlertChanges: async () => [{ platform: 'throwing', success: true }],
        healthCheck: async () => {
          throw new Error('Health check exception');
        }
      };

      const testService = new MultiplatformNotificationService([throwingService]);
      const healthStatus = await testService.healthCheck();

      expect(healthStatus).toEqual({
        throwing: false
      });
    });
  });

  describe('getService', () => {
    test('should return service by platform name', () => {
      const service = multiService.getService('slack');
      expect(service).toBeDefined();
      expect(service!.platformName).toBe('slack');
    });

    test('should return undefined for non-existent platform', () => {
      expect(multiService.getService('nonexistent')).toBeUndefined();
    });
  });

  describe('구독 기반 알림', () => {
    test('sendAlertToSubscriptions: 구독자가 없으면 빈 배열 반환', async () => {
      const alert = createMockAlert();
      const results = await multiService.sendAlertToSubscriptions(alert);
      expect(results).toEqual([]);
    });

    test('sendAlertToSubscriptions: 구독자에게 전송 (폴백)', async () => {
      multiService.addSubscription('slack', 'user1', ['L1100000']);
      const alert = createMockAlert({ REG_ID: 'L1100000' });
      const results = await multiService.sendAlertToSubscriptions(alert);
      expect(results.length).toBeGreaterThan(0);
    });

    test('sendAlertChangeToSubscriptions: 구독자가 없으면 빈 배열 반환', async () => {
      const change: AlertChange = {
        type: 'NEW',
        current: {
          key: 'test', regionId: 'L1100000', regionName: '서울',
          warningType: 'H', level: '2', command: '1',
          announcedAt: '202601011200', effectiveAt: '202601011300',
          lastUpdated: new Date().toISOString()
        },
        description: '신규 특보'
      };
      const results = await multiService.sendAlertChangeToSubscriptions(change);
      expect(results).toEqual([]);
    });

    test('sendAlertChangesToSubscriptions: 빈 배열 반환', async () => {
      const results = await multiService.sendAlertChangesToSubscriptions([]);
      expect(results).toEqual([]);
    });

    test('addSubscription: 구독 추가', () => {
      const id = multiService.addSubscription('slack', 'userA', ['L1100000'], {
        warningTypes: ['H'], displayName: 'Test User'
      });
      expect(id).toBeTruthy();
    });

    test('removeSubscription: 구독 제거', () => {
      multiService.addSubscription('slack', 'userB', ['L1100000']);
      expect(multiService.removeSubscription('slack', 'userB')).toBe(true);
      expect(multiService.removeSubscription('slack', 'nonexistent')).toBe(false);
    });

    test('getSubscriptionStatistics: 통계 반환', () => {
      multiService.addSubscription('slack', 'userC', ['L1100000']);
      const stats = multiService.getSubscriptionStatistics();
      expect(stats.totalSubscriptions).toBeGreaterThanOrEqual(1);
    });

    test('getSubscriptionManager: 매니저 인스턴스 반환', () => {
      const manager = multiService.getSubscriptionManager();
      expect(manager).toBeDefined();
    });
  });

  describe('하이브리드 구독 시스템', () => {
    test('isHybridSubscriptionAvailable: false by default', () => {
      expect(multiService.isHybridSubscriptionAvailable()).toBe(false);
    });

    test('getHybridSubscriptionManager: undefined by default', () => {
      expect(multiService.getHybridSubscriptionManager()).toBeUndefined();
    });

    test('setHybridSubscriptionManager: sets and retrieves', () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue(['telegram']),
        getHelpMessage: jest.fn().mockResolvedValue('help'),
        getPlatformStats: jest.fn().mockResolvedValue({ total: 1 })
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      expect(multiService.isHybridSubscriptionAvailable()).toBe(true);
      expect(multiService.getHybridSubscriptionManager()).toBe(mockHybridManager);
    });

    test('processSubscriptionCommand: without hybrid manager', async () => {
      const result = await multiService.processSubscriptionCommand('telegram', 'u1', 'help');
      expect(result.success).toBe(false);
      expect(result.error).toBe('HYBRID_SYSTEM_NOT_AVAILABLE');
    });

    test('processSubscriptionCommand: with hybrid manager', async () => {
      const mockHybridManager = {
        processCommand: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const result = await multiService.processSubscriptionCommand('telegram', 'u1', 'help');
      expect(result.success).toBe(true);
    });

    test('processSubscriptionCommand: handles errors', async () => {
      const mockHybridManager = {
        processCommand: jest.fn().mockRejectedValue(new Error('fail')),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const result = await multiService.processSubscriptionCommand('telegram', 'u1', 'help');
      expect(result.success).toBe(false);
    });

    test('generateWebToken: without hybrid manager', async () => {
      const token = await multiService.generateWebToken('telegram', 'u1');
      expect(token).toBeNull();
    });

    test('generateWebToken: with hybrid manager', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn().mockResolvedValue({ token: 'abc123' }),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const token = await multiService.generateWebToken('telegram', 'u1');
      expect(token).toBe('abc123');
    });

    test('getHybridSubscriptionStats: without hybrid manager', async () => {
      const stats = await multiService.getHybridSubscriptionStats();
      expect(stats).toBeNull();
    });

    test('getHybridSubscriptionStats: with hybrid manager', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn().mockResolvedValue({ total: 5 })
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const stats = await multiService.getHybridSubscriptionStats();
      expect(stats).toEqual({ total: 5 });
    });

    test('getHybridPlatformNames: returns empty without manager', () => {
      expect(multiService.getHybridPlatformNames()).toEqual([]);
    });

    test('getHybridPlatformNames: returns platforms with manager', () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue(['telegram', 'slack']),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      expect(multiService.getHybridPlatformNames()).toEqual(['telegram', 'slack']);
    });

    test('getHybridHelpMessage: without hybrid manager', async () => {
      const help = await multiService.getHybridHelpMessage('telegram');
      expect(help).toBeNull();
    });

    test('getHybridHelpMessage: with hybrid manager', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn().mockResolvedValue('telegram help'),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const help = await multiService.getHybridHelpMessage('telegram');
      expect(help).toBe('telegram help');
    });

    test('generateWebToken: handles error gracefully', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn().mockRejectedValue(new Error('token error')),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const token = await multiService.generateWebToken('telegram', 'u1');
      expect(token).toBeNull();
    });

    test('getHybridSubscriptionStats: handles error gracefully', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn(),
        getPlatformStats: jest.fn().mockRejectedValue(new Error('stats error'))
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const stats = await multiService.getHybridSubscriptionStats();
      expect(stats).toBeNull();
    });

    test('getHybridHelpMessage: handles error gracefully', async () => {
      const mockHybridManager = {
        processCommand: jest.fn(),
        generateUserToken: jest.fn(),
        getRegisteredPlatforms: jest.fn().mockReturnValue([]),
        getHelpMessage: jest.fn().mockRejectedValue(new Error('help error')),
        getPlatformStats: jest.fn()
      } as any;

      multiService.setHybridSubscriptionManager(mockHybridManager);
      const help = await multiService.getHybridHelpMessage('telegram');
      expect(help).toBeNull();
    });
  });

  describe('서비스 없는 경우', () => {
    let emptyService: MultiplatformNotificationService;

    beforeEach(() => {
      emptyService = new MultiplatformNotificationService([]);
    });

    test('sendAlertChange: 빈 배열 반환', async () => {
      const change = createMockChange('NEW');
      const results = await emptyService.sendAlertChange(change);
      expect(results).toEqual([]);
    });

    test('sendAlertChanges: 빈 배열 반환', async () => {
      const changes = [createMockChange('NEW')];
      const results = await emptyService.sendAlertChanges(changes);
      expect(results).toEqual([]);
    });
  });

  describe('sendAlertChange 에러 처리', () => {
    test('서비스 에러 시 에러 결과 반환', async () => {
      const failService = new MockNotificationService('fail', true);
      const svc = new MultiplatformNotificationService([failService]);
      const change = createMockChange('NEW');
      const results = await svc.sendAlertChange(change);
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });
  });

  describe('sendAlertChanges 에러 처리', () => {
    test('서비스 에러 시 에러 결과 반환', async () => {
      const failService = new MockNotificationService('fail', true);
      const svc = new MultiplatformNotificationService([failService]);
      const changes = [createMockChange('NEW'), createMockChange('RESOLVED')];
      const results = await svc.sendAlertChanges(changes);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => !r.success)).toBe(true);
    });
  });

  describe('sendAlertWithRetry', () => {
    test('성공 시 바로 반환', async () => {
      const results = await multiService.sendAlertWithRetry(createMockAlert(), 2, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.success)).toBe(true);
    });

    test('실패 시 재시도 후 반환', async () => {
      const failService = new MockNotificationService('fail', true);
      const svc = new MultiplatformNotificationService([failService]);
      const results = await svc.sendAlertWithRetry(createMockAlert(), 2, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => !r.success)).toBe(true);
    });
  });

  describe('sendAlertToSubscriptions 상세', () => {
    test('구독자의 플랫폼 서비스가 없으면 실패 결과 반환', async () => {
      // discord 플랫폼 구독자를 추가하지만 discord 서비스는 등록하지 않음
      multiService.addSubscription('discord', 'user1', ['L1100000']);
      const alert = createMockAlert({ REG_ID: 'L1100000' });
      const results = await multiService.sendAlertToSubscriptions(alert);
      const discordResults = results.filter(r => r.platform === 'discord');
      // discord 서비스가 없으므로 실패 결과 (빈 배열이 아닌지 먼저 확인)
      expect(discordResults.length).toBeGreaterThan(0);
      for (const r of discordResults) {
        expect(r.success).toBe(false);
      }
    });
  });

  describe('sendAlertChangesToSubscriptions 상세', () => {
    test('여러 변동 처리', async () => {
      // createMockChange의 regionId(L1020110)와 일치하는 지역으로 구독
      multiService.addSubscription('slack', 'userX', ['L1020110']);
      const changes = [createMockChange('NEW'), createMockChange('RESOLVED')];
      const results = await multiService.sendAlertChangesToSubscriptions(changes);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('CircuitBreaker 통합', () => {
    test('각 플랫폼에 CircuitBreaker가 생성됨', () => {
      expect(multiService.getCircuitBreakerState('slack')).toBe(CircuitState.CLOSED);
      expect(multiService.getCircuitBreakerState('telegram')).toBe(CircuitState.CLOSED);
    });

    test('addService 시 새 CircuitBreaker 생성', () => {
      const discordService = new MockNotificationService('discord');
      multiService.addService(discordService);
      expect(multiService.getCircuitBreakerState('discord')).toBe(CircuitState.CLOSED);
    });

    test('존재하지 않는 플랫폼의 CircuitBreaker 상태 조회 시 undefined', () => {
      expect(multiService.getCircuitBreakerState('nonexistent')).toBeUndefined();
    });

    test('CircuitBreaker 수동 리셋 성공', () => {
      expect(multiService.resetCircuitBreaker('slack')).toBe(true);
    });

    test('존재하지 않는 플랫폼의 CircuitBreaker 리셋 실패', () => {
      expect(multiService.resetCircuitBreaker('nonexistent')).toBe(false);
    });

    test('통계에 CircuitBreaker 데이터가 포함됨', async () => {
      const alert = createMockAlert();
      await multiService.sendAlert(alert);

      const stats = multiService.getStatistics();
      expect(stats).toHaveProperty('slack');
      expect(stats).toHaveProperty('telegram');
      expect(stats.slack.total).toBeGreaterThan(0);
      expect(stats.slack.success).toBeGreaterThan(0);
      expect(stats.slack.successRate).toBeGreaterThan(0);
    });
  });

  describe('선별적 재시도', () => {
    test('서비스가 없을 때 빈 배열 반환', async () => {
      const emptyService = new MultiplatformNotificationService([]);
      const results = await emptyService.sendAlertWithRetry(createMockAlert(), 2, 10);
      expect(results).toEqual([]);
    });

    test('실패 플랫폼만 재시도하고 성공 결과는 보존', async () => {
      let callCount = 0;
      const intermittentService: NotificationService = {
        platformName: 'intermittent',
        validateConfig: () => true,
        sendAlert: async () => {
          callCount++;
          if (callCount <= 1) {
            throw new Error('temporary failure');
          }
          return { platform: 'intermittent', success: true, responseTime: 50 };
        },
        sendAlertChange: async () => ({ platform: 'intermittent', success: true }),
        sendAlertChanges: async () => [{ platform: 'intermittent', success: true }],
        healthCheck: async () => true,
      };

      const svc = new MultiplatformNotificationService([mockSlackService, intermittentService]);
      const results = await svc.sendAlertWithRetry(createMockAlert(), 3, 10);

      // slack은 첫 시도에 성공, intermittent는 두 번째 시도에 성공
      expect(results).toHaveLength(2);
      const slackResult = results.find(r => r.platform === 'slack');
      const intermittentResult = results.find(r => r.platform === 'intermittent');
      expect(slackResult?.success).toBe(true);
      expect(intermittentResult?.success).toBe(true);
    });

    test('모든 재시도 소진 후 최종 실패 결과 반환', async () => {
      const alwaysFailService: NotificationService = {
        platformName: 'always-fail',
        validateConfig: () => true,
        sendAlert: async () => {
          throw new Error('permanent failure');
        },
        sendAlertChange: async () => ({ platform: 'always-fail', success: false }),
        sendAlertChanges: async () => [{ platform: 'always-fail', success: false }],
        healthCheck: async () => false,
      };

      const svc = new MultiplatformNotificationService([alwaysFailService]);
      const results = await svc.sendAlertWithRetry(createMockAlert(), 2, 10);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].platform).toBe('always-fail');
    });
  });

  describe('상세 통계 (NotificationStats 통합)', () => {
    test('sendAlert 후 상세 통계에 기록됨', async () => {
      const alert = createMockAlert();
      await multiService.sendAlert(alert);

      const detailed = multiService.getDetailedStatistics();
      expect(detailed.length).toBeGreaterThanOrEqual(2);

      const slackStats = detailed.find(s => s.platform === 'slack');
      expect(slackStats).toBeDefined();
      expect(slackStats!.totalSent).toBe(1);
      expect(slackStats!.successCount).toBe(1);
      expect(slackStats!.successRate).toBe(1.0);
      expect(slackStats!.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
      expect(slackStats!.circuitBreakerState).toBe(CircuitState.CLOSED);
      expect(slackStats!.hourlyStats).toHaveLength(24);
    });

    test('getDetailedPlatformStats로 개별 플랫폼 조회', async () => {
      await multiService.sendAlert(createMockAlert());

      const slackStats = multiService.getDetailedPlatformStats('slack');
      expect(slackStats).toBeDefined();
      expect(slackStats!.platform).toBe('slack');
      expect(slackStats!.totalSent).toBe(1);
    });

    test('존재하지 않는 플랫폼은 undefined', () => {
      expect(multiService.getDetailedPlatformStats('nonexistent')).toBeUndefined();
    });

    test('실패 서비스도 통계에 기록됨', async () => {
      const failService = new MockNotificationService('fail-svc', true);
      const svc = new MultiplatformNotificationService([failService]);
      await svc.sendAlert(createMockAlert());

      const stats = svc.getDetailedPlatformStats('fail-svc');
      expect(stats).toBeDefined();
      expect(stats!.totalSent).toBe(1);
      expect(stats!.failureCount).toBe(1);
      expect(stats!.successRate).toBe(0);
    });

    test('resetStatistics로 특정 플랫폼 초기화', async () => {
      await multiService.sendAlert(createMockAlert());
      multiService.resetStatistics('slack');

      expect(multiService.getDetailedPlatformStats('slack')).toBeUndefined();
      expect(multiService.getDetailedPlatformStats('telegram')).toBeDefined();
    });

    test('resetStatistics로 전체 초기화', async () => {
      await multiService.sendAlert(createMockAlert());
      multiService.resetStatistics();

      expect(multiService.getDetailedStatistics()).toEqual([]);
    });

    test('lastSuccessAt이 성공 시 기록됨', async () => {
      await multiService.sendAlert(createMockAlert());

      const stats = multiService.getDetailedPlatformStats('slack');
      expect(stats!.lastSuccessAt).toBeInstanceOf(Date);
    });

    test('응답 시간이 측정됨', async () => {
      await multiService.sendAlert(createMockAlert());

      const stats = multiService.getDetailedPlatformStats('slack');
      expect(typeof stats!.averageResponseTimeMs).toBe('number');
      expect(stats!.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});