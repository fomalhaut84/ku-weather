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

      await (weatherService as any).fetchWeatherAlerts('H', ['L1100000'], '12');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('wrn=H'),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('reg=L1100000'),
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '#START7777\n'
      });

      await weatherService.getWeatherAlerts(['H', 'R']);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should filter by region when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '#START7777\n'
      });

      await weatherService.getWeatherAlerts(undefined, ['L1100000']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('reg=L1100000'),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await weatherService.getWeatherAlerts();
      expect(result).toHaveLength(0);
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
        statusText: 'Internal Server Error'
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(0); // Should return empty array on error
    });

    it('should validate CSV parsing with various data formats', async () => {
      const mockResponse = `#Test data
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
      const mockResponse = `REG_UP,REG_UP_KO,REG_ID,REG_KO,TM_FC,TM_EF,WRN,LVL,CMD`;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should validate data format consistency', async () => {
      const mockResponse = `#Test
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

      const result = await (service as any).fetchWeatherAlerts();
      expect(result).toHaveLength(0);
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
      // 1단계: 초기 API 호출 (과거 7일)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const currentDate = new Date();
      
      const initialResponse = `#대상기간:${pastDate.getFullYear()}${(pastDate.getMonth()+1).toString().padStart(2,'0')}${pastDate.getDate().toString().padStart(2,'0')}0000~${currentDate.getFullYear()}${(currentDate.getMonth()+1).toString().padStart(2,'0')}${currentDate.getDate().toString().padStart(2,'0')}0000\nREG_ID,REG_NAME,TM_FC,TM_EF,WRN,LVL,CMD,TM_IN,STN,GRD,CNT,RPT,TM_ST,TM_ED,REG_SP,REG_UP,REG_KO,REG_UP_KO,STN_ID,TM_SEQ,MAN_FC,MAN_IN\nL1100000,서울특별시,202501070900,202501071000,H,2,1,202501070800,184,00,1,101,,,,L1000000,서울,서울특별시,184,,,\nL1100000,서울특별시,202501070930,202501071030,H,3,6,202501070830,184,00,2,101,,,,L1000000,서울,서울특별시,184,,,`;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(initialResponse)
      });

      const initialAlerts = await weatherService.getWeatherAlerts();
      expect(initialAlerts).toHaveLength(2);
      expect(initialAlerts[0].CMD).toBe('1'); // 발표
      expect(initialAlerts[1].CMD).toBe('6'); // 변경
      
      // 2단계: 새로운 변동사항 감지
      const updateResponse = `#대상기간:202501080900~202501080900\nREG_ID,REG_NAME,TM_FC,TM_EF,WRN,LVL,CMD,TM_IN,STN,GRD,CNT,RPT,TM_ST,TM_ED,REG_SP,REG_UP,REG_KO,REG_UP_KO,STN_ID,TM_SEQ,MAN_FC,MAN_IN\nL1100000,서울특별시,202501080900,202501081000,H,3,3,202501080800,184,00,3,101,,,,L1000000,서울,서울특별시,184,,,`;
      
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
      // 500개의 가짜 특보 데이터 생성 (메모리 제한 고려)
      const largeDataHeader = '#Large dataset test\nREG_ID,REG_NAME,TM_FC,TM_EF,WRN,LVL,CMD,TM_IN,STN,GRD,CNT,RPT,TM_ST,TM_ED,REG_SP,REG_UP,REG_KO,REG_UP_KO,STN_ID,TM_SEQ,MAN_FC,MAN_IN';
      const dataRows = [];
      
      for (let i = 0; i < 500; i++) {
        dataRows.push(`L${i.toString().padStart(7, '0')},테스트지역${i},202501070900,202501071000,${i % 2 === 0 ? 'H' : 'R'},${(i % 3) + 1},1,202501070800,184,00,1,101,,,,L1000000,테스트,테스트지역${i},184,,,`);
      }
      
      const largeResponse = largeDataHeader + '\n' + dataRows.join('\n');
      
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
      expect(alerts[0].REG_NAME).toBe('테스트지역0');
      expect(alerts[499].REG_NAME).toBe('테스트지역499');
    });

    it('should handle special characters in region names correctly', async () => {
      const specialCharResponse = `#Special chars test\nREG_ID,REG_NAME,TM_FC,TM_EF,WRN,LVL,CMD,TM_IN,STN,GRD,CNT,RPT,TM_ST,TM_ED,REG_SP,REG_UP,REG_KO,REG_UP_KO,STN_ID,TM_SEQ,MAN_FC,MAN_IN\nL1100000,서울특별시🌆&<test>,202501070900,202501071000,H,2,1,202501070800,184,00,1,101,,,,L1000000,서울,서울특별시🌆&<test>,184,,,`;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(specialCharResponse)
      });

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].REG_NAME).toBe('서울특별시🌆&<test>'); // 특수문자 유지
    });
  });

});