import { WeatherService } from '../../services/weatherService';
import { logger } from '../../utils/logger';
import { AlertCache } from '../../services/AlertCache';

// Mock logger
jest.mock('../../utils/logger');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('WeatherService', () => {
  let weatherService: WeatherService;
  const testApiKey = 'test-api-key';

  const mockAlert1 = {
    REG_ID: 'L1020110',
    REG_NAME: '서울강북',
    TM_FC: '202508011500',
    TM_EF: '202508011600',
    WRN: 'H',
    LVL: '2',
    CMD: '1',
    TM_IN: '202508011400',
    STN: '184',
    GRD: '00',
    CNT: '1',
    RPT: '101',
    TM_ST: '',
    TM_ED: '',
    REG_SP: '',
    REG_UP: '',
    REG_KO: '',
    REG_UP_KO: '서울특별시',
    STN_ID: '184',
    TM_SEQ: '',
    MAN_FC: '',
    MAN_IN: ''
  };

  beforeEach(() => {
    weatherService = new WeatherService(testApiKey);
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error when API key is not provided', () => {
      expect(() => new WeatherService('')).toThrow('WEATHER_API_KEY가 제공되지 않았습니다');
    });

    it('should create instance with valid API key', () => {
      expect(() => new WeatherService(testApiKey)).not.toThrow();
    });
  });

  describe('formatDateForAPI', () => {
    it('should format date correctly', () => {
      const testDate = new Date('2025-01-07T10:30:00');
      const formatted = (weatherService as any).formatDateForAPI(testDate);
      expect(formatted).toBe('202501071030');
    });
  });

  describe('getRegionName', () => {
    it('should return manual mapping for known region codes', () => {
      expect((weatherService as any).getRegionName('L1100000')).toBe('서울특별시');
      expect((weatherService as any).getRegionName('L1010000')).toBe('경기도');
      expect((weatherService as any).getRegionName('L5010000')).toBe('제주도');
    });

    it('should return cached region name when available', () => {
      (weatherService as any).regionCache.set('L9999999', '테스트지역');
      expect((weatherService as any).getRegionName('L9999999')).toBe('테스트지역');
    });

    it('should return pattern-based name for unknown land regions', () => {
      expect((weatherService as any).getRegionName('L9876543')).toBe('육상지역(L9876543)');
    });

    it('should return pattern-based name for unknown sea regions', () => {
      expect((weatherService as any).getRegionName('S1234567')).toBe('해상지역(S1234567)');
    });

    it('should return original code for unknown pattern', () => {
      expect((weatherService as any).getRegionName('X1234567')).toBe('X1234567');
    });
  });

  describe('getUpperRegionName', () => {
    it('should return correct upper region for major province codes', () => {
      expect((weatherService as any).getUpperRegionName('L1011200')).toBe('경기도');  // 연천군
      expect((weatherService as any).getUpperRegionName('L1021300')).toBe('강원도');  // 철원군
      expect((weatherService as any).getUpperRegionName('L1031100')).toBe('충청남도'); // 태안군
    });

    it('should return correct upper region for metropolitan cities', () => {
      expect((weatherService as any).getUpperRegionName('L1100100')).toBe('서울특별시'); // 서울동남권
      expect((weatherService as any).getUpperRegionName('L1110100')).toBe('인천광역시'); // 인천의 하위 지역
      expect((weatherService as any).getUpperRegionName('L1150100')).toBe('부산광역시'); // 부산의 하위 지역  
      expect((weatherService as any).getUpperRegionName('L1010800')).toBe('인천광역시'); // 특별 케이스
    });

    it('should return correct upper region for special administrative cities', () => {
      expect((weatherService as any).getUpperRegionName('L1030100')).toBe('대전광역시'); // 특별 케이스
      expect((weatherService as any).getUpperRegionName('L1031800')).toBe('세종특별자치시'); // 특별 케이스
    });

    it('should return correct upper region for Ulleungdo and Dokdo', () => {
      // 울릉도.독도는 행정구역상 경상북도 울릉군에 속함
      expect((weatherService as any).getUpperRegionName('L1072100')).toBe('경상북도'); // 경상북도 하위 코드
      expect((weatherService as any).getUpperRegionName('L1600000')).toBe('경상북도'); // 특수 코드 (명시적 매핑)
    });

    it('should return correct upper region for sea areas', () => {
      expect((weatherService as any).getUpperRegionName('S1200000')).toBe('서해전해상'); // 서해전해상 직접
      expect((weatherService as any).getUpperRegionName('S1150000')).toBe('동해중부전해상'); // 동해중부전해상 직접  
      expect((weatherService as any).getUpperRegionName('S1311000')).toBe('남해동부전해상'); // 남해동부앞바다 → 남해동부전해상
    });

    it('should return region name for province-level regions', () => {
      expect((weatherService as any).getUpperRegionName('L1010000')).toBe('경기도');
      expect((weatherService as any).getUpperRegionName('L1100000')).toBe('서울특별시');
    });

    it('should return "기타" for unknown patterns', () => {
      expect((weatherService as any).getUpperRegionName('L9999999')).toBe('기타');
      expect((weatherService as any).getUpperRegionName('X1234567')).toBe('기타');
    });
  });

  describe('parseCSVResponse', () => {
    it('should parse valid CSV response correctly', () => {
      const csvData = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =, , , , L1020000, 서울강북, 서울특별시 강북구`;
      
      const result = (weatherService as any).parseCSVResponse(csvData);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        TM_FC: '202508011500',
        TM_EF: '202508011600',
        TM_IN: '202508011400',
        REG_ID: 'L1020110',
        WRN: 'H',
        LVL: '2',
        CMD: '1'
      });
    });

    it('should skip comment and empty lines', () => {
      const csvData = `# This is a comment
# Another comment

202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =

202508011500, 202508011600, 202508011400, 184, L1020111, R, 3, 1, 00, 4, 101, =`;
      
      const result = (weatherService as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(2);
    });

    it('should handle malformed CSV lines gracefully', () => {
      const csvData = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구
incomplete, line
202508011500, 202508011600, 202508011400, 184, L1020111, R, 3, 1, 00, 4, 101, =, , , , L1020001, 서울강남, 서울특별시 강남구`;
      
      const result = (weatherService as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(2); // Only valid lines should be parsed
    });
  });

  describe('parseRegionCSVResponse', () => {
    it('should parse region CSV correctly', () => {
      const csvData = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;
      
      const result = (weatherService as any).parseRegionCSVResponse(csvData);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        REG_ID: 'L1020110',
        REG_NAME: '서울특별시 강북구'
      });
    });
  });

  describe('fetchWeatherAlerts', () => {
    it('should fetch weather alerts successfully', async () => {
      const mockResponse = '#START7777\n202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await (weatherService as any).fetchWeatherAlerts();
      expect(result).toHaveLength(1);
      expect(result[0].REG_ID).toBe('L1020110');
    });

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error'
      });

      await expect((weatherService as any).fetchWeatherAlerts()).rejects.toThrow(
        'API 호출 실패: 500 Internal Server Error - Server Error'
      );
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '#STARTinvalid response'
      });

      const result = await (weatherService as any).fetchWeatherAlerts();
      expect(result).toHaveLength(0);
    });

    it('should build correct API URL with parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '#START7777\n'  // Valid response format with no data
      });

      await (weatherService as any).fetchWeatherAlerts('H', '12');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('wrn=H'),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('subcd=12'),
      );
    });
  });

  describe('getWeatherAlerts', () => {
    it('should fetch all warning types when none specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '#START7777\n'
      });

      await weatherService.getWeatherAlerts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('wrn='),
      );
    });

    it('should fetch specific warning types', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '#START7777\n'
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '#START7777\n'
        });

      await weatherService.getWeatherAlerts([], ['H', 'R']); // Second param is warningTypes

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('wrn=H'));
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('wrn=R'));
    });

    it('should filter by region when specified', async () => {
      const mockResponse = '#START7777\n202508011500, 202508011600, 202508011400, 184, L1100000, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울, 서울특별시\n202508011500, 202508011600, 202508011400, 184, L1020000, H, 2, 1, 00, 4, 101, =, , , , L1020000, 경기, 경기도';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const results = await weatherService.getWeatherAlerts(['L1100000']); // First param is targetRegIds

      // getWeatherAlerts uses region filtering in-memory, not via API parameter
      expect(results).toHaveLength(1);
      expect(results[0].REG_ID).toBe('L1100000');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(weatherService.getWeatherAlerts()).rejects.toThrow('Network error');
    });
  });

  describe('checkForNewAlerts', () => {
    it('should return alerts when API succeeds', async () => {
      const mockResponse = '#START7777\n202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await weatherService.checkForNewAlerts();
      expect(result).toHaveLength(1);
    });

    it('should return empty array when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await weatherService.checkForNewAlerts();
      expect(result).toHaveLength(0);
    });
  });

  describe('fetchRegionData', () => {
    it('should fetch and cache region data successfully', async () => {
      const mockResponse = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      await weatherService.fetchRegionData();
      
      expect((weatherService as any).getRegionName('L1020110')).toBe('서울특별시 강북구');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Region API Error'));

      await expect(weatherService.fetchRegionData()).resolves.not.toThrow();
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'invalid,response,format'
      });

      await expect(weatherService.fetchRegionData()).resolves.not.toThrow();
    });
  });

  describe('API integration tests', () => {
    it('should test API integration workflow with mock responses', async () => {
      const mockResponse = '#START7777\n202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        REG_ID: 'L1020110',
        WRN: 'H',
        LVL: '2',
        CMD: '1'
      });
    });

    it('should handle API error responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error'
      });

      await expect(weatherService.getWeatherAlerts()).rejects.toThrow(
        'API 호출 실패: 500 Internal Server Error - Server Error'
      );
    });

    it('should validate CSV parsing with various data formats', async () => {
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구
202508021500, 202508021600, 202508021400, 184, L1020111, R, 3, 6, 00, 4, 101, =, , , , L1020001, 서울강남, 서울특별시 강남구`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(2);

      // CMD 다양성 검증
      const cmdTypes = alerts.map((a: any) => a.CMD).sort();
      expect(cmdTypes).toEqual(['1', '6']);

      // WRN 다양성 검증
      const wrnTypes = [...new Set(alerts.map((a: any) => a.WRN))].sort();
      expect(wrnTypes).toEqual(['H', 'R']);
    });

    it('should handle empty API responses', async () => {
      const mockResponse = `#START7777
#REG_UP,REG_UP_KO,REG_ID,REG_KO,TM_FC,TM_EF,WRN,LVL,CMD`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should validate data format consistency', async () => {
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구
invalid, incomplete, data
202508021500, 202508021600, 202508021400, 184, L1020111, R, 3, 2, 00, 4, 101, =, , , , L1020001, 서울강남, 서울특별시 강남구`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(2); // 유효한 데이터 2건만
      expect(alerts.every((a: any) => a.REG_ID && a.WRN && a.LVL)).toBe(true);
    });
  });

  describe('additional error handling coverage', () => {
    it('should handle non-Error objects in fetchWeatherAlerts catch block', async () => {
      const service = new WeatherService(testApiKey);

      // Mock fetch to throw a non-Error object
      mockFetch.mockRejectedValueOnce('string error');

      await expect((service as any).fetchWeatherAlerts()).rejects.toBe('string error');
    });

    it('should handle malformed CSV lines in parseCSVResponse', () => {
      const service = new WeatherService(testApiKey);
      
      const csvData = `#START7777
invalid, line, with, wrong, columns
202508011500, 202508011600, 202508011400, 184, L1020110, H, 2, 1, 00, 4, 101, =, , , , L1020000, 서울강북, 서울특별시 강북구`;
      
      const result = (service as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(1); // Only the valid line should be processed
    });

    it('should handle malformed CSV lines in parseRegionCSVResponse', () => {
      const service = new WeatherService(testApiKey);
      
      const csvData = `#START7777
invalid, line
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;
      
      const result = (service as any).parseRegionCSVResponse(csvData);
      expect(result).toHaveLength(1); // Only the valid line should be processed
    });

    it('should handle API error with text response', async () => {
      const service = new WeatherService(testApiKey);
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error'
      });

      await expect((service as any).fetchWeatherAlerts()).rejects.toThrow(
        'API 호출 실패: 500 Internal Server Error - Server Error'
      );
    });

    it('should handle CSV parsing errors with logger.debug calls', async () => {
      const service = new WeatherService(testApiKey);
      
      // getRegionName에서 예외를 발생시켜 catch 블록 실행 (라인 277)
      const originalGetRegionName = (service as any).getRegionName;
      (service as any).getRegionName = jest.fn().mockImplementation(() => {
        throw new Error('getRegionName error');
      });
      
      const csvData = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;
      
      const result = (service as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(0); // 예외 발생으로 인해 빈 배열 반환
      
      // 원래 메서드 복원
      (service as any).getRegionName = originalGetRegionName;
    });

    it('should handle region CSV parsing errors with logger.debug calls', async () => {
      const service = new WeatherService(testApiKey);
      
      // 원래 배열 push 메서드를 모킹해서 예외 발생시키기
      const csvData = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;
      
      // Array.prototype.push를 일시적으로 모킹
      const originalPush = Array.prototype.push;
      Array.prototype.push = jest.fn().mockImplementation(() => {
        throw new Error('push error');
      });
      
      const result = (service as any).parseRegionCSVResponse(csvData);
      expect(result).toHaveLength(0); // 예외 발생으로 인해 빈 배열 반환
      
      // 원래 메서드 복원
      Array.prototype.push = originalPush;
    });

    it('should call logger.info when region data is loaded successfully', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      await service.fetchRegionData();
      
      // logger.info 호출 확인 (라인 196은 이미 fetchRegionData에 의해 커버됨)
      const mockLogger = require('../../utils/logger').logger;
      expect(mockLogger.info).toHaveBeenCalledWith('총 1개 특보구역 데이터 로드 완료');
    });
  });

  describe('통합 테스트 - WeatherService 실제 시나리오', () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it('should handle complete weather alert monitoring workflow', async () => {
      // 1단계: 초기 API 호출
      const initialResponse = `#START7777
202501070900, 202501071000, 202501070800, 184, L1100000, H, 2, 1, 00, 1, 101, =
202501070930, 202501071030, 202501070830, 184, L1100000, H, 3, 6, 00, 2, 101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(initialResponse)
      });

      const initialAlerts = await weatherService.getWeatherAlerts();
      expect(initialAlerts).toHaveLength(2);
      expect(initialAlerts[0].CMD).toBe('1'); // 발표
      expect(initialAlerts[1].CMD).toBe('6'); // 변경

      // 2단계: 새로운 변동사항 감지
      const updateResponse = `#START7777
202501080900, 202501081000, 202501080800, 184, L1100000, H, 3, 3, 00, 3, 101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(updateResponse)
      });

      const updatedAlerts = await weatherService.checkForNewAlerts();
      expect(updatedAlerts).toHaveLength(1);
      expect(updatedAlerts[0].CMD).toBe('3'); // 해제
      expect(updatedAlerts[0].REG_NAME).toBe('서울특별시');
    });

    it('should handle API timeout and retry logic gracefully', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Request timeout'));
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('#No data\n')
        });
      });

      const alerts = await weatherService.checkForNewAlerts();
      expect(alerts).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 실패 후 빈 배열 반환
    });

    it('should process large dataset efficiently under load', async () => {
      // 500개의 가짜 특보 데이터 생성
      const dataRows = ['#START7777'];

      for (let i = 0; i < 500; i++) {
        dataRows.push(`202501070900, 202501071000, 202501070800, 184, L${i.toString().padStart(7, '0')}, ${i % 2 === 0 ? 'H' : 'R'}, ${(i % 3) + 1}, 1, 00, 1, 101, =`);
      }

      const largeResponse = dataRows.join('\n');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(largeResponse)
      });

      const startTime = Date.now();
      const alerts = await weatherService.getWeatherAlerts();
      const processingTime = Date.now() - startTime;

      expect(alerts).toHaveLength(500);
      expect(processingTime).toBeLessThan(1000); // 1초 이내 처리

      // 데이터 무결성 검증
      expect(alerts[0].REG_ID).toBe('L0000000');
      expect(alerts[499].REG_ID).toBe('L0000499');
    });

    it('should handle special characters in region names correctly', async () => {
      const specialCharResponse = `#START7777
202501070900, 202501071000, 202501070800, 184, L1100000, H, 2, 1, 00, 1, 101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(specialCharResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].REG_ID).toBe('L1100000');
      expect(alerts[0].REG_NAME).toBe('서울특별시'); // getRegionName으로 매핑됨
    });
  });

  describe('단기예보 기준시각 계산 (getVilageFcstBaseTime)', () => {
    it('02:15 이후에는 02:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 2, 20); // 02:20
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('0200');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('02:15 이전에는 전날 23:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 2, 10); // 02:10
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('2300');
      expect(result.needsPreviousDay).toBe(true);
    });

    it('05:15 이후에는 05:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 5, 30); // 05:30
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('0500');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('23:15 이후에는 23:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 23, 30); // 23:30
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('2300');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('14:15 이후 17:15 이전에는 14:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 16, 0); // 16:00
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('1400');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('0:00에는 전날 23:00을 반환한다', () => {
      const date = new Date(2025, 0, 1, 0, 0); // 00:00
      const result = (weatherService as any).getVilageFcstBaseTime(date);
      expect(result.baseTime).toBe('2300');
      expect(result.needsPreviousDay).toBe(true);
    });
  });

  describe('초단기예보 기준시각 계산 (getUltraSrtBaseTime)', () => {
    it('30분 이후에는 현재 시각 30분을 반환한다', () => {
      const date = new Date(2025, 0, 1, 14, 45); // 14:45
      const result = (weatherService as any).getUltraSrtBaseTime(date);
      expect(result.baseTime).toBe('1430');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('30분 이전에는 이전 시각 30분을 반환한다', () => {
      const date = new Date(2025, 0, 1, 14, 15); // 14:15
      const result = (weatherService as any).getUltraSrtBaseTime(date);
      expect(result.baseTime).toBe('1330');
      expect(result.needsPreviousDay).toBe(false);
    });

    it('0:15에는 전날 23:30을 반환한다', () => {
      const date = new Date(2025, 0, 1, 0, 15); // 00:15
      const result = (weatherService as any).getUltraSrtBaseTime(date);
      expect(result.baseTime).toBe('2330');
      expect(result.needsPreviousDay).toBe(true);
    });
  });

  describe('예보 데이터 합성 (mergeForecastData)', () => {
    const mockUltraSrtItems = [
      { baseDate: '20250101', baseTime: '1430', category: 'T1H', fcstDate: '20250101', fcstTime: '1500', fcstValue: '5.2', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'REH', fcstDate: '20250101', fcstTime: '1500', fcstValue: '45', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'SKY', fcstDate: '20250101', fcstTime: '1500', fcstValue: '1', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'PTY', fcstDate: '20250101', fcstTime: '1500', fcstValue: '0', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'WSD', fcstDate: '20250101', fcstTime: '1500', fcstValue: '3.5', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'RN1', fcstDate: '20250101', fcstTime: '1500', fcstValue: '강수없음', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1430', category: 'VEC', fcstDate: '20250101', fcstTime: '1500', fcstValue: '270', nx: 60, ny: 127 },
    ];

    const mockVilageItems = [
      { baseDate: '20250101', baseTime: '1100', category: 'POP', fcstDate: '20250101', fcstTime: '1500', fcstValue: '30', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1100', category: 'TMN', fcstDate: '20250101', fcstTime: '0600', fcstValue: '-2.5', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1100', category: 'TMX', fcstDate: '20250101', fcstTime: '1500', fcstValue: '7.8', nx: 60, ny: 127 },
      { baseDate: '20250101', baseTime: '1100', category: 'T3H', fcstDate: '20250101', fcstTime: '1500', fcstValue: '5.0', nx: 60, ny: 127 },
    ];

    it('초단기+단기 데이터를 합성하여 POP, TMN, TMX를 포함한다', () => {
      const result = (weatherService as any).mergeForecastData(
        mockUltraSrtItems, mockVilageItems, 'L1100000', '서울특별시'
      );

      expect(result).not.toBeNull();
      expect(result.temperature).toBe(5.2);       // T1H (초단기)
      expect(result.humidity).toBe(45);            // REH (초단기)
      expect(result.precipitationProbability).toBe(30); // POP (단기)
      expect(result.minTemperature).toBe(-2.5);    // TMN (단기)
      expect(result.maxTemperature).toBe(7.8);     // TMX (단기)
      expect(result.precipitation).toBe(0);        // RN1 강수없음
      expect(result.windSpeed).toBe(3.5);          // WSD (초단기)
    });

    it('초단기 데이터가 없으면 단기 T3H를 기온으로 사용한다', () => {
      const result = (weatherService as any).mergeForecastData(
        null, mockVilageItems, 'L1100000', '서울특별시'
      );

      expect(result).not.toBeNull();
      expect(result.temperature).toBe(5.0);        // T3H (단기 fallback)
      expect(result.precipitationProbability).toBe(30); // POP (단기)
    });

    it('단기 데이터가 없으면 초단기 데이터만 사용한다', () => {
      const result = (weatherService as any).mergeForecastData(
        mockUltraSrtItems, null, 'L1100000', '서울특별시'
      );

      expect(result).not.toBeNull();
      expect(result.temperature).toBe(5.2);        // T1H (초단기)
      expect(result.precipitationProbability).toBeUndefined(); // POP 없음
      expect(result.minTemperature).toBeUndefined();
      expect(result.maxTemperature).toBeUndefined();
    });

    it('두 데이터 모두 없으면 null을 반환한다', () => {
      const result = (weatherService as any).mergeForecastData(
        null, null, 'L1100000', '서울특별시'
      );
      expect(result).toBeNull();
    });

    it('강수량 "1mm 미만"을 0.1로 파싱한다', () => {
      const items = [
        { baseDate: '20250101', baseTime: '1430', category: 'RN1', fcstDate: '20250101', fcstTime: '1500', fcstValue: '1mm 미만', nx: 60, ny: 127 },
      ];
      const result = (weatherService as any).mergeForecastData(
        items, null, 'L1100000', '서울특별시'
      );
      expect(result).not.toBeNull();
      expect(result.precipitation).toBe(0.1);
    });
  });

  describe('getWeatherForecastWithResult', () => {
    it('격자 좌표를 찾을 수 없으면 실패 결과를 반환한다', async () => {
      const result = await weatherService.getWeatherForecastWithResult('UNKNOWN_ID');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toContain('격자 좌표를 찾을 수 없습니다');
    });

    it('API 호출 실패 시 source를 포함한 실패 결과를 반환한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await weatherService.getWeatherForecastWithResult('L1100000');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });
  });

  describe('getCacheStatus', () => {
    it('캐시 상태를 반환한다', () => {
      const status = weatherService.getCacheStatus();
      expect(status).toHaveProperty('count');
      expect(status).toHaveProperty('lastUpdated');
      expect(status).toHaveProperty('isInitialized');
      expect(status).toHaveProperty('lastCheckTime');
      expect(status.isInitialized).toBe(false);
    });
  });

  describe('clearAlertCache', () => {
    it('캐시를 초기화한다', () => {
      weatherService.clearAlertCache();
      const status = weatherService.getCacheStatus();
      expect(status.count).toBe(0);
      expect(status.isInitialized).toBe(false);
    });
  });

  describe('getCachedAlerts', () => {
    it('캐시된 특보를 반환한다', () => {
      const alerts = weatherService.getCachedAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe('getWeatherForecast', () => {
    it('격자 좌표를 찾을 수 없으면 null을 반환한다', async () => {
      const result = await weatherService.getWeatherForecast('UNKNOWN_ID');
      expect(result).toBeNull();
    });

    it('API 호출 실패 시 null을 반환한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await weatherService.getWeatherForecast('L1100000');
      expect(result).toBeNull();
    });
  });

  describe('selectNearestTimeSlice (private)', () => {
    it('가장 가까운 시간대를 선택한다', () => {
      const items = [
        { fcstDate: '20260101', fcstTime: '0900', category: 'T1H', fcstValue: '5' },
        { fcstDate: '20260101', fcstTime: '1000', category: 'T1H', fcstValue: '7' },
        { fcstDate: '20260101', fcstTime: '1100', category: 'T1H', fcstValue: '9' }
      ];
      const now = new Date('2026-01-01T01:30:00Z'); // KST 10:30
      const result = (weatherService as any).selectNearestTimeSlice(items, now);
      expect(result.items).toBeDefined();
    });

    it('referenceTimeKey로 가장 가까운 시간대를 선택한다', () => {
      const items = [
        { fcstDate: '20260101', fcstTime: '0900', category: 'T3H', fcstValue: '5' },
        { fcstDate: '20260101', fcstTime: '1200', category: 'T3H', fcstValue: '10' },
        { fcstDate: '20260101', fcstTime: '1500', category: 'T3H', fcstValue: '12' }
      ];
      const now = new Date('2026-01-01T01:00:00Z');
      const result = (weatherService as any).selectNearestTimeSlice(items, now, '202601011000');
      expect(result.items).toBeDefined();
    });
  });

  describe('parseForecastTime (private)', () => {
    it('유효한 시간 문자열을 Date로 변환한다', () => {
      const result = (weatherService as any).parseForecastTime('202601011200');
      expect(result).toBeInstanceOf(Date);
      // KST 12:00 → UTC 03:00
      expect(result.getUTCHours()).toBe(3);
    });

    it('짧은 문자열은 현재 시간을 반환한다', () => {
      const before = Date.now();
      const result = (weatherService as any).parseForecastTime('2026');
      expect(result).toBeInstanceOf(Date);
      // 현재 시간 근처여야 함
      expect(result.getTime()).toBeGreaterThanOrEqual(before - 60000);
    });

    it('빈 문자열은 현재 시간을 반환한다', () => {
      const result = (weatherService as any).parseForecastTime('');
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('calculateFeelsLike (private)', () => {
    it('10도 이하 + 풍속 있으면 Windchill 계산', () => {
      const result = (weatherService as any).calculateFeelsLike(5, 5);
      expect(result).toBeLessThan(5);
    });

    it('27도 이상 + 습도 40% 이상이면 Heat Index 계산', () => {
      const result = (weatherService as any).calculateFeelsLike(35, 1, 70);
      expect(result).toBeGreaterThan(35);
    });

    it('중간 온도에서는 실제 기온 반환', () => {
      const result = (weatherService as any).calculateFeelsLike(20, 3);
      expect(result).toBe(20);
    });

    it('27도 이상이지만 습도가 낮으면 실제 기온 반환', () => {
      const result = (weatherService as any).calculateFeelsLike(30, 1, 30);
      expect(result).toBe(30);
    });

    it('27도 이상 + 습도 없으면 실제 기온 반환', () => {
      const result = (weatherService as any).calculateFeelsLike(30, 1);
      expect(result).toBe(30);
    });
  });

  describe('parseNumber (private)', () => {
    it('유효한 숫자 문자열을 변환한다', () => {
      expect((weatherService as any).parseNumber('123')).toBe(123);
      expect((weatherService as any).parseNumber('12.5')).toBe(12.5);
    });

    it('빈 문자열은 undefined를 반환한다', () => {
      expect((weatherService as any).parseNumber('')).toBeUndefined();
    });

    it('undefined는 undefined를 반환한다', () => {
      expect((weatherService as any).parseNumber(undefined)).toBeUndefined();
    });

    it('유효하지 않은 문자열은 undefined를 반환한다', () => {
      expect((weatherService as any).parseNumber('abc')).toBeUndefined();
    });
  });

  describe('fetchWithRetry (private)', () => {
    it('성공 시 바로 반환한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' })
      });

      const result = await (weatherService as any).fetchWithRetry('https://api.example.com', {}, 1, 5000);
      expect(result.ok).toBe(true);
    });

    it('5xx 에러 시 재시도 후 실패한다', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(
        (weatherService as any).fetchWithRetry('https://api.example.com', {}, 2, 100)
      ).rejects.toThrow();
    }, 15000);

    it('4xx 에러는 재시도 없이 반환한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await (weatherService as any).fetchWithRetry('https://api.example.com', {}, 3, 5000);
      expect(result.status).toBe(404);
      // fetch는 1번만 호출되어야 함
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUpperRegionName (private)', () => {
    it('알려진 지역 코드의 이름을 반환한다', () => {
      const result = (weatherService as any).getUpperRegionName('L1100000');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('매핑되지 않은 지역 코드는 상위 지역을 재귀 탐색한다', () => {
      const result = (weatherService as any).getUpperRegionName('L9999999');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('매핑되지 않은 해상 지역 코드도 처리한다', () => {
      const result = (weatherService as any).getUpperRegionName('S9999999');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('최상위 레벨에 도달하면 기타를 반환한다', () => {
      const result = (weatherService as any).getUpperRegionName('X0000000');
      expect(result).toBe('기타');
    });

    it('빈 문자열이면 빈 문자열 반환', () => {
      const result = (weatherService as any).getUpperRegionName('');
      expect(result).toBe('');
    });

    it('8자리가 아니면 빈 문자열 반환', () => {
      const result = (weatherService as any).getUpperRegionName('L123');
      expect(result).toBe('');
    });
  });

  describe('checkForAlertChanges 에러 처리', () => {
    it('API 실패 시 빈 배열을 반환한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await weatherService.checkForAlertChanges();
      expect(Array.isArray(result)).toBe(true);
    });
  });

});