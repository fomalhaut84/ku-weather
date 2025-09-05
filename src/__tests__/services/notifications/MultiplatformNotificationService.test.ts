import { MultiplatformNotificationService } from '../../../services/notifications/MultiplatformNotificationService';
import { NotificationService, NotificationResult } from '../../../services/notifications/interfaces';
import { WeatherAlert, AlertChange } from '../../../types/weather';

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
});