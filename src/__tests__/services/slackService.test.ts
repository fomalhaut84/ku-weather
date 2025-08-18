import { SlackService } from '../../services/slackService';
import { WeatherAlert, AlertChange, CachedAlert } from '../../types/weather';

// fetch 모킹
const mockFetch = jest.fn();
global.fetch = mockFetch;

// logger 모킹
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('SlackService', () => {
  let slackService: SlackService;
  const testWebhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL';

  beforeEach(() => {
    slackService = new SlackService(testWebhookUrl);
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

  const createMockCachedAlert = (overrides: Partial<CachedAlert> = {}): CachedAlert => ({
    key: 'L1020110-H',
    regionId: 'L1020110',
    regionName: '서울강북',
    warningType: 'H',
    level: '2',
    command: '1',
    announcedAt: '202508011500',
    effectiveAt: '202508011600',
    lastUpdated: '2025-01-08T15:00:00.000Z',
    ...overrides
  });

  const createMockAlertChange = (overrides: Partial<AlertChange> = {}): AlertChange => ({
    type: 'NEW',
    current: createMockCachedAlert(),
    description: '서울강북 폭염 주의보 신규 발표',
    ...overrides
  });

  describe('constructor', () => {
    it('should throw error when webhook URL is not provided', () => {
      expect(() => new SlackService('')).toThrow('SLACK_WEBHOOK_URL이 제공되지 않았습니다');
    });

    it('should create instance with valid webhook URL', () => {
      expect(() => new SlackService(testWebhookUrl)).not.toThrow();
    });
  });

  describe('getWarningTypeName', () => {
    it('should return correct Korean name for warning codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningTypeName('H')).toBe('폭염');
      expect((service as any).getWarningTypeName('R')).toBe('호우');
      expect((service as any).getWarningTypeName('V')).toBe('풍랑');
      expect((service as any).getWarningTypeName('W')).toBe('강풍');
      expect((service as any).getWarningTypeName('T')).toBe('태풍');
    });

    it('should return original code for unknown warning codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningTypeName('X')).toBe('X');
    });

    it('should handle trimmed codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningTypeName(' H ')).toBe('폭염');
    });
  });

  describe('formatDateTime', () => {
    it('should format date string correctly', () => {
      const service = new SlackService(testWebhookUrl);
      
      // Mock toLocaleString to return predictable result
      const mockDate = new Date('2025-08-01T15:30:00');
      jest.spyOn(mockDate, 'toLocaleString').mockReturnValue('2025. 08. 01. 오후 3:30');
      
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      const result = (service as any).formatDateTime('2025-08-01T15:30:00');
      expect(result).toBe('2025. 08. 01. 오후 3:30');
      
      (global.Date as any).mockRestore();
    });

    it('should return formatted date for invalid dates that produce Invalid Date', () => {
      const service = new SlackService(testWebhookUrl);
      
      const result = (service as any).formatDateTime('invalid-date');
      expect(result).toBe('Invalid Date');
    });

    it('should return original string when toLocaleString throws an error', () => {
      const service = new SlackService(testWebhookUrl);
      
      // Date 생성자를 모킹해서 toLocaleString에서 에러가 발생하도록 설정
      const mockDate = {
        toLocaleString: jest.fn().mockImplementation(() => {
          throw new Error('toLocaleString error');
        })
      };
      
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      const result = (service as any).formatDateTime('2025-08-01T15:30:00');
      expect(result).toBe('2025-08-01T15:30:00');
      
      (global.Date as any).mockRestore();
    });
  });

  describe('sendAlert', () => {
    it('should send alert successfully', async () => {
      const mockAlert = createMockAlert();
      
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await slackService.sendAlert(mockAlert);

      expect(mockFetch).toHaveBeenCalledWith(
        testWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('🌦️ 기상특보 알림')
        })
      );
    });

    it('should include correct alert information in payload', async () => {
      const mockAlert = createMockAlert({
        WRN: 'H',
        CMD: '1',
        REG_NAME: '서울강북',
        TM_FC: '202508011500',
        TM_EF: '202508011600',
        LVL: '2',
        REG_UP_KO: '서울특별시'
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await slackService.sendAlert(mockAlert);

      const callArgs = mockFetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload).toMatchObject({
        text: '🌦️ 기상특보 알림',
        attachments: [
          expect.objectContaining({
            title: expect.stringContaining('폭염'),
            fields: expect.arrayContaining([
              { title: '지역', value: '서울강북', short: true },
              { title: '특보수준', value: '2', short: true },
              { title: '상위지역', value: '서울특별시', short: true }
            ])
          })
        ]
      });
    });

    it('should set correct color based on alert level', async () => {
      const dangerAlert = createMockAlert({ LVL: '1' });
      const warningAlert = createMockAlert({ LVL: '2' });
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendAlert(dangerAlert);
      let payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].color).toBe('danger');

      await slackService.sendAlert(warningAlert);
      payload = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(payload.attachments[0].color).toBe('warning');
    });

    it('should handle Slack API errors', async () => {
      const mockAlert = createMockAlert();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      await expect(slackService.sendAlert(mockAlert)).rejects.toThrow(
        'Slack 메시지 보내기 실패: 400 Bad Request'
      );
    });

    it('should handle network errors', async () => {
      const mockAlert = createMockAlert();
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(slackService.sendAlert(mockAlert)).rejects.toThrow('Network error');
    });
  });

  describe('sendWeatherAlert', () => {
    it('should do nothing when no alerts provided', async () => {
      await slackService.sendWeatherAlert([]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send single alert directly', async () => {
      const mockAlert = createMockAlert();
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendWeatherAlert([mockAlert]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send multiple alerts via sendMultipleAlerts', async () => {
      const mockAlerts = [
        createMockAlert({ REG_NAME: '서울강북' }),
        createMockAlert({ REG_NAME: '서울강남' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendWeatherAlert(mockAlerts);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', async () => {
      const mockAlert = createMockAlert();
      
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      await expect(slackService.sendWeatherAlert([mockAlert])).rejects.toThrow('API Error');
    });
  });

  describe('sendMultipleAlerts', () => {
    beforeEach(() => {
      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });
    });

    afterEach(() => {
      (global.setTimeout as any).mockRestore();
    });

    it('should do nothing when no alerts provided', async () => {
      await slackService.sendMultipleAlerts([]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send all alerts with delays', async () => {
      const mockAlerts = [
        createMockAlert({ REG_NAME: '서울강북' }),
        createMockAlert({ REG_NAME: '서울강남' }),
        createMockAlert({ REG_NAME: '경기남부' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendMultipleAlerts(mockAlerts);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(setTimeout).toHaveBeenCalledTimes(3);
    });

    it('should handle errors during multiple sends', async () => {
      const mockAlerts = [
        createMockAlert({ REG_NAME: '서울강북' }),
        createMockAlert({ REG_NAME: '서울강남' })
      ];
      
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Send error'));

      await expect(slackService.sendMultipleAlerts(mockAlerts)).rejects.toThrow('Send error');
    });

    it('should wait between sends to avoid rate limits', async () => {
      const mockAlerts = [
        createMockAlert({ REG_NAME: '서울강북' }),
        createMockAlert({ REG_NAME: '서울강남' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendMultipleAlerts(mockAlerts);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });
  });

  describe('getWarningLevel', () => {
    it('should return correct Korean name for level codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningLevel('1')).toBe('예비');
      expect((service as any).getWarningLevel('2')).toBe('주의보');
      expect((service as any).getWarningLevel('3')).toBe('경보');
    });

    it('should return original code for unknown level codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningLevel('9')).toBe('9');
    });

    it('should handle trimmed codes', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getWarningLevel(' 2 ')).toBe('주의보');
    });
  });

  describe('getChangeTypeConfig', () => {
    it('should return correct config for each change type', () => {
      const service = new SlackService(testWebhookUrl);
      
      expect((service as any).getChangeTypeConfig('NEW')).toEqual({
        emoji: '🆕',
        color: 'danger',
        title: '신규 발표'
      });
      
      expect((service as any).getChangeTypeConfig('RESOLVED')).toEqual({
        emoji: '✅',
        color: 'good',
        title: '해제'
      });
      
      expect((service as any).getChangeTypeConfig('LEVEL_UP')).toEqual({
        emoji: '⬆️',
        color: 'danger',
        title: '수준 상향'
      });
      
      expect((service as any).getChangeTypeConfig('LEVEL_DOWN')).toEqual({
        emoji: '⬇️',
        color: 'warning',
        title: '수준 하향'
      });
      
      expect((service as any).getChangeTypeConfig('TIME_EXTENDED')).toEqual({
        emoji: '⏰',
        color: 'warning',
        title: '시간 연장'
      });
      
      expect((service as any).getChangeTypeConfig('MODIFIED')).toEqual({
        emoji: '🔄',
        color: 'warning',
        title: '내용 변경'
      });
    });
  });

  describe('sendAlertChange', () => {
    it('should send NEW alert change successfully', async () => {
      const mockChange = createMockAlertChange({
        type: 'NEW',
        current: createMockCachedAlert(),
        description: '서울강북 폭염 주의보 신규 발표'
      });
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChange(mockChange);

      expect(mockFetch).toHaveBeenCalledWith(
        testWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('🆕 기상특보 신규 발표')
        })
      );
    });

    it('should include correct payload for NEW change', async () => {
      const mockChange = createMockAlertChange({
        type: 'NEW',
        current: createMockCachedAlert({
          regionName: '서울강북',
          warningType: 'H',
          level: '2'
        })
      });
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChange(mockChange);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload).toMatchObject({
        text: '🆕 기상특보 신규 발표',
        attachments: [
          expect.objectContaining({
            color: 'danger',
            fields: expect.arrayContaining([
              { title: '지역', value: '서울강북', short: true },
              { title: '특보종류', value: '폭염', short: true },
              { title: '특보수준', value: '주의보', short: true }
            ])
          })
        ]
      });
    });

    it('should send RESOLVED alert change successfully', async () => {
      const mockChange = createMockAlertChange({
        type: 'RESOLVED',
        previous: createMockCachedAlert(),
        current: undefined,
        description: '서울강북 폭염 주의보 해제'
      });
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChange(mockChange);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload).toMatchObject({
        text: '✅ 기상특보 해제',
        attachments: [
          expect.objectContaining({
            color: 'good',
            fields: expect.arrayContaining([
              { title: '해제된 수준', value: '주의보', short: true }
            ])
          })
        ]
      });
    });

    it('should send LEVEL_UP alert change with level comparison', async () => {
      const mockChange = createMockAlertChange({
        type: 'LEVEL_UP',
        previous: createMockCachedAlert({ level: '2' }),
        current: createMockCachedAlert({ level: '3' }),
        description: '서울강북 폭염 주의보 → 경보 수준 상향'
      });
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChange(mockChange);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].fields).toContainEqual({
        title: '수준 변화',
        value: '주의보 → 경보',
        short: false
      });
    });

    it('should send TIME_EXTENDED alert change with time comparison', async () => {
      const mockChange = createMockAlertChange({
        type: 'TIME_EXTENDED',
        previous: createMockCachedAlert({ effectiveAt: '202508011600' }),
        current: createMockCachedAlert({ effectiveAt: '202508011800' }),
        description: '서울강북 폭염 주의보 발효시각 연장'
      });
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChange(mockChange);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].fields).toContainEqual({
        title: '발효시각 변화',
        value: expect.stringContaining('→'),
        short: false
      });
    });

    it('should handle missing alert data gracefully', async () => {
      const mockChange = createMockAlertChange({
        type: 'NEW',
        current: undefined,
        previous: undefined
      });

      await slackService.sendAlertChange(mockChange);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle Slack API errors for alert changes', async () => {
      const mockChange = createMockAlertChange();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      await expect(slackService.sendAlertChange(mockChange)).rejects.toThrow(
        'Slack 메시지 보내기 실패: 400 Bad Request'
      );
    });
  });

  describe('sendAlertChanges', () => {
    it('should do nothing when no changes provided', async () => {
      await slackService.sendAlertChanges([]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send single change directly', async () => {
      const mockChange = createMockAlertChange();
      
      mockFetch.mockResolvedValueOnce({ ok: true });

      await slackService.sendAlertChanges([mockChange]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send multiple changes via sendMultipleAlertChanges', async () => {
      const mockChanges = [
        createMockAlertChange({ description: '서울강북 변동' }),
        createMockAlertChange({ description: '서울강남 변동' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendAlertChanges(mockChanges);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', async () => {
      const mockChange = createMockAlertChange();
      
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      await expect(slackService.sendAlertChanges([mockChange])).rejects.toThrow('API Error');
    });
  });

  describe('sendMultipleAlertChanges', () => {
    beforeEach(() => {
      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });
    });

    afterEach(() => {
      (global.setTimeout as any).mockRestore();
    });

    it('should do nothing when no changes provided', async () => {
      await slackService.sendMultipleAlertChanges([]);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send all changes with delays', async () => {
      const mockChanges = [
        createMockAlertChange({ description: '서울강북 변동' }),
        createMockAlertChange({ description: '서울강남 변동' }),
        createMockAlertChange({ description: '경기남부 변동' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendMultipleAlertChanges(mockChanges);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(setTimeout).toHaveBeenCalledTimes(3);
    });

    it('should handle errors during multiple sends', async () => {
      const mockChanges = [
        createMockAlertChange({ description: '서울강북 변동' }),
        createMockAlertChange({ description: '서울강남 변동' })
      ];
      
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Send error'));

      await expect(slackService.sendMultipleAlertChanges(mockChanges)).rejects.toThrow('Send error');
    });

    it('should wait between sends to avoid rate limits', async () => {
      const mockChanges = [
        createMockAlertChange({ description: '서울강북 변동' }),
        createMockAlertChange({ description: '서울강남 변동' })
      ];
      
      mockFetch.mockResolvedValue({ ok: true });

      await slackService.sendMultipleAlertChanges(mockChanges);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });
  });
});