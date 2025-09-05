import { SlackNotificationService } from '../../../services/notifications/SlackNotificationService';
import { WeatherAlert, AlertChange } from '../../../types/weather';
import { SlackConfig } from '../../../services/notifications/interfaces';

// fetch 모킹
const mockFetch = jest.fn();
global.fetch = mockFetch;

// logger 모킹
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('SlackNotificationService', () => {
  let slackService: SlackNotificationService;
  const testConfig: SlackConfig = {
    enabled: true,
    webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
    batchMode: true
  };

  beforeEach(() => {
    slackService = new SlackNotificationService(testConfig, 'development');
    mockFetch.mockClear();
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
    type: 'NEW' | 'RESOLVED' | 'LEVEL_UP' | 'LEVEL_DOWN' | 'TIME_EXTENDED' | 'MODIFIED',
    current?: Partial<WeatherAlert>,
    previous?: Partial<WeatherAlert>
  ): AlertChange => ({
    type,
    description: `${type} 테스트`,
    current: current ? {
      regionId: 'L1020110',
      regionName: '서울강북',
      warningType: 'H',
      level: '2',
      command: '1',
      announcedAt: '202508011500',
      effectiveAt: '202508011600',
      key: 'test-key',
      lastUpdated: '202508011400'
    } : undefined,
    previous: previous ? {
      regionId: 'L1020110',
      regionName: '서울강북', 
      warningType: 'H',
      level: '1',
      command: '1',
      announcedAt: '202508011400',
      effectiveAt: '202508011500',
      key: 'test-key',
      lastUpdated: '202508011300'
    } : undefined
  });

  describe('생성자 및 초기화', () => {
    test('올바른 설정으로 인스턴스 생성', () => {
      expect(slackService.platformName).toBe('slack');
      expect(slackService.validateConfig()).toBe(true);
    });

    test('잘못된 webhook URL로 생성 시 에러 발생', () => {
      const invalidConfig: SlackConfig = {
        enabled: true,
        webhookUrl: 'invalid-url',
        batchMode: true
      };
      
      expect(() => new SlackNotificationService(invalidConfig)).toThrow('Slack 설정이 유효하지 않습니다');
    });
  });

  describe('설정 검증', () => {
    test('유효한 설정 검증', () => {
      expect(slackService.validateConfig()).toBe(true);
    });

    test('빈 webhook URL 검증 실패', () => {
      // 생성자에서 검증하므로 생성 시에 에러가 발생해야 함
      expect(() => new SlackNotificationService({
        enabled: true,
        webhookUrl: '',
        batchMode: true
      })).toThrow('Slack 설정이 유효하지 않습니다');
    });
  });

  describe('건강 상태 확인', () => {
    test('정상적인 건강 상태 확인', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await slackService.healthCheck();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        testConfig.webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    test('건강 상태 확인 실패', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await slackService.healthCheck();
      expect(result).toBe(false);
    });

    test('네트워크 오류 시 건강 상태 확인 실패', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await slackService.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('단일 특보 알림 전송', () => {
    test('정상적인 특보 알림 전송', async () => {
      const alert = createMockAlert();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const result = await slackService.sendAlert(alert);
      
      expect(result.platform).toBe('slack');
      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    test('특보 알림 전송 실패', async () => {
      const alert = createMockAlert();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      const result = await slackService.sendAlert(alert);
      
      expect(result.platform).toBe('slack');
      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 400: Bad Request');
    });

    test('네트워크 오류로 특보 알림 전송 실패', async () => {
      const alert = createMockAlert();
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await slackService.sendAlert(alert);
      
      expect(result.platform).toBe('slack');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('특보 변동 알림 전송', () => {
    test('신규 특보 변동 알림 전송', async () => {
      const change = createMockChange('NEW', {});
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const result = await slackService.sendAlertChange(change);
      
      expect(result.platform).toBe('slack');
      expect(result.success).toBe(true);
    });

    test('특보 해제 변동 알림 전송', async () => {
      const change = createMockChange('RESOLVED', undefined, {});
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const result = await slackService.sendAlertChange(change);
      
      expect(result.platform).toBe('slack');
      expect(result.success).toBe(true);
    });
  });

  describe('다중 특보 변동 알림 전송', () => {
    test('빈 배열 전송 시 빈 결과 반환', async () => {
      const result = await slackService.sendAlertChanges([]);
      expect(result).toEqual([]);
    });

    test('단일 변동 알림 - 개별 전송', async () => {
      const changes = [createMockChange('NEW', {})];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const results = await slackService.sendAlertChanges(changes);
      
      expect(results).toHaveLength(1);
      expect(results[0].platform).toBe('slack');
      expect(results[0].success).toBe(true);
    });

    test('다중 변동 알림 - 배치 모드', async () => {
      const changes = [
        createMockChange('NEW', {}),
        createMockChange('RESOLVED', undefined, {})
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const results = await slackService.sendAlertChanges(changes);
      
      expect(results).toHaveLength(1); // 배치 모드에서는 하나의 결과
      expect(results[0].platform).toBe('slack');
      expect(results[0].success).toBe(true);
    });

    test('다중 변동 알림 - 개별 모드', async () => {
      const individualModeService = new SlackNotificationService({
        ...testConfig,
        batchMode: false
      }, 'development');

      const changes = [
        createMockChange('NEW', {}),
        createMockChange('RESOLVED', undefined, {})
      ];
      
      // 각각의 개별 전송을 위한 모킹
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

      const results = await individualModeService.sendAlertChanges(changes);
      
      expect(results).toHaveLength(2); // 개별 모드에서는 개수만큼 결과
      expect(results[0].platform).toBe('slack');
      expect(results[1].platform).toBe('slack');
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('환경별 메시지 접두사', () => {
    test('development 환경 접두사', () => {
      const devService = new SlackNotificationService(testConfig, 'development');
      expect((devService as any).getEnvironmentPrefix()).toBe('[DEV] ');
    });

    test('production 환경 접두사', () => {
      const prodService = new SlackNotificationService(testConfig, 'production');
      expect((prodService as any).getEnvironmentPrefix()).toBe('');
    });

    test('staging 환경 접두사', () => {
      const stagingService = new SlackNotificationService(testConfig, 'staging');
      expect((stagingService as any).getEnvironmentPrefix()).toBe('[STAGING] ');
    });

    test('커스텀 환경 접두사', () => {
      const customService = new SlackNotificationService(testConfig, 'test');
      expect((customService as any).getEnvironmentPrefix()).toBe('[TEST] ');
    });
  });
});