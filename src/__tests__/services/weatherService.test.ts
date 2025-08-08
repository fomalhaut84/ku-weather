import { WeatherService } from '../../services/weatherService';
import { WeatherAlert, WeatherRegion } from '../../types/weather';
import * as iconv from 'iconv-lite';

// fetch 모킹
const mockFetch = jest.fn();
global.fetch = mockFetch;

// logger 모킹
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }
}));

describe('WeatherService', () => {
  let weatherService: WeatherService;
  const testApiKey = 'test-api-key';

  beforeEach(() => {
    weatherService = new WeatherService(testApiKey);
    mockFetch.mockClear();
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
      const service = new WeatherService(testApiKey);
      const testDate = new Date('2025-08-01T15:30:45');
      
      // private method access를 위한 타입 캐스팅
      const result = (service as any).formatDateForAPI(testDate);
      
      expect(result).toBe('202508011530');
    });
  });

  describe('getRegionName', () => {
    it('should return manual mapping for known region codes', () => {
      const service = new WeatherService(testApiKey);
      
      const result = (service as any).getRegionName('L1020110');
      expect(result).toBe('강릉시평지');
    });

    it('should return cached region name when available', () => {
      const service = new WeatherService(testApiKey);
      const regionCache = (service as any).regionCache;
      
      regionCache.set('TEST001', '테스트지역');
      const result = (service as any).getRegionName('TEST001');
      
      expect(result).toBe('테스트지역');
    });

    it('should return pattern-based name for unknown land regions', () => {
      const service = new WeatherService(testApiKey);
      
      const result = (service as any).getRegionName('L9999999');
      expect(result).toBe('육상지역(L9999999)');
    });

    it('should return pattern-based name for unknown sea regions', () => {
      const service = new WeatherService(testApiKey);
      
      const result = (service as any).getRegionName('S9999999');
      expect(result).toBe('해상지역(S9999999)');
    });

    it('should return original code for unknown pattern', () => {
      const service = new WeatherService(testApiKey);
      
      const result = (service as any).getRegionName('X9999999');
      expect(result).toBe('X9999999');
    });
  });

  describe('parseCSVResponse', () => {
    it('should parse valid CSV response correctly', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =
202508011500, 202508011600, 202508011400, 143, S1323200,   V,   3,   6,  00,   4,   101, =`;

      const result = (service as any).parseCSVResponse(csvData);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        REG_ID: 'L1020110',
        REG_NAME: '강릉시평지',
        TM_FC: '202508011500',
        TM_EF: '202508011600',
        WRN: 'H',
        LVL: '2',
        CMD: '1',
        REG_UP: '',
        REG_KO: '',
        REG_UP_KO: ''
      });
    });

    it('should skip comment and empty lines', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
# This is a comment
      
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      const result = (service as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(1);
    });

    it('should handle malformed CSV lines gracefully', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
invalid line
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =
short,line
`;

      const result = (service as any).parseCSVResponse(csvData);
      expect(result).toHaveLength(1);
    });
  });

  describe('parseRegionCSVResponse', () => {
    it('should parse region CSV correctly', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =
S1323200, 202101010000, 202312312359, B, S1323000, 서해중부, 서해중부근해, =`;

      const result = (service as any).parseRegionCSVResponse(csvData);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        REG_ID: 'L1020110',
        TM_ST: '202101010000',
        TM_ED: '202312312359',
        REG_SP: 'A',
        REG_UP: 'L1020000',
        REG_KO: '서울강북',
        REG_NAME: '서울특별시 강북구'
      });
    });
  });

  describe('fetchWeatherAlerts', () => {
    it('should fetch weather alerts successfully', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await (service as any).fetchWeatherAlerts('H');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('wrn=H'));
      expect(result).toHaveLength(1);
      expect(result[0].WRN).toBe('H');
    });

    it('should handle API error responses', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Access denied'
      });

      await expect((service as any).fetchWeatherAlerts()).rejects.toThrow(
        'API 활용신청이 필요합니다'
      );
    });

    it('should handle invalid response format', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Invalid response format'
      });

      await expect((service as any).fetchWeatherAlerts()).rejects.toThrow(
        '유효하지 않은 응답 형식'
      );
    });

    it('should build correct API URL with parameters', async () => {
      const service = new WeatherService(testApiKey);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '#START7777\n'
      });

      await (service as any).fetchWeatherAlerts('H', '12');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/authKey=test-api-key.*wrn=H.*subcd=12/)
      );
    });
  });

  describe('getWeatherAlerts', () => {
    it('should fetch all warning types when none specified', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await service.getWeatherAlerts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringMatching(/wrn=/)
      );
      expect(result).toHaveLength(1);
    });

    it('should fetch specific warning types', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await service.getWeatherAlerts([], ['H']);

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('wrn=H'));
      expect(result).toHaveLength(1);
    });

    it('should filter by region when specified', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =
202508011500, 202508011600, 202508011400, 143, L1082200,   H,   2,   1,  00,   4,   101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await service.getWeatherAlerts(['강릉시평지']);

      expect(result).toHaveLength(1);
      expect(result[0].REG_NAME).toBe('강릉시평지');
    });

    it('should handle API errors gracefully', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getWeatherAlerts()).rejects.toThrow('Network error');
    });
  });

  describe('checkForNewAlerts', () => {
    it('should return alerts when API succeeds', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      const result = await service.checkForNewAlerts();

      expect(result).toHaveLength(1);
    });

    it('should return empty array when API fails', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await service.checkForNewAlerts();

      expect(result).toHaveLength(0);
    });
  });

  describe('fetchRegionData', () => {
    it('should fetch and cache region data successfully', async () => {
      const service = new WeatherService(testApiKey);
      const mockResponse = `#START7777
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse
      });

      await service.fetchRegionData();

      const regionName = (service as any).getRegionName('L1020110');
      expect(regionName).toBe('서울특별시 강북구');
    });

    it('should handle API errors gracefully', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error'
      });

      // Should not throw error, just log and return
      await expect(service.fetchRegionData()).resolves.not.toThrow();
    });

    it('should handle invalid response format', async () => {
      const service = new WeatherService(testApiKey);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Invalid format'
      });

      // Should not throw error, just log and return
      await expect(service.fetchRegionData()).resolves.not.toThrow();
    });
  });

  describe('additional error handling coverage', () => {
    it('should handle non-Error objects in fetchWeatherAlerts catch block', async () => {
      const service = new WeatherService(testApiKey);
      
      // 문자열 에러를 던져서 else 브랜치 테스트
      mockFetch.mockImplementation(() => {
        throw 'string error';
      });

      await expect((service as any).fetchWeatherAlerts('H')).rejects.toBe('string error');
    });

    it('should handle malformed CSV lines in parseCSVResponse', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
      , , , , , , , , , , ,  =
202508011500, 202508011600, 202508011400, 184, L1020110,   H,   2,   1,  00,   4,   101, =`;

      const result = (service as any).parseCSVResponse(csvData);
      
      // 실제로는 필드가 충분한 경우 빈 값으로도 파싱됨
      expect(result).toHaveLength(2);
      expect(result[0].REG_ID).toBe(''); // 첫 번째 라인의 빈 필드들
      expect(result[1].REG_ID).toBe('L1020110'); // 두 번째 라인의 실제 값
    });

    it('should handle malformed CSV lines in parseRegionCSVResponse', () => {
      const service = new WeatherService(testApiKey);
      const csvData = `#START7777
      , , , , , , , =
L1020110, 202101010000, 202312312359, A, L1020000, 서울강북, 서울특별시 강북구, =`;

      const result = (service as any).parseRegionCSVResponse(csvData);
      
      // 실제로는 필드가 충분한 경우 빈 값으로도 파싱됨
      expect(result).toHaveLength(2);
      expect(result[0].REG_ID).toBe(''); // 첫 번째 라인의 빈 필드들
      expect(result[1].REG_ID).toBe('L1020110'); // 두 번째 라인의 실제 값
    });

    it('should handle API error with status other than 403', async () => {
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

  describe('fetchCurrentWeatherAlerts', () => {
    it('should fetch current weather alerts successfully', async () => {
      const mockResponse = `# 현재 특보현황 API 응답
L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =`;

      // EUC-KR로 인코딩하여 실제 API 응답 시뮤레이션
      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const alerts = await weatherService.fetchCurrentWeatherAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toEqual({
        REG_UP: 'L1100000',
        REG_UP_KO: '서울특별시',
        REG_ID: 'L1100110',
        REG_KO: '서울강남구',
        TM_FC: '202501071000',
        TM_EF: '202501071100',
        WRN: 'H',
        LVL: '2',
        CMD: '1'
      });
    });

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(weatherService.fetchCurrentWeatherAlerts()).rejects.toThrow('API 인증 실패 (403 Forbidden)');
    });

    it('should handle invalid response format', async () => {
      const invalidData = 'invalid data';
      const eucKrBuffer = iconv.encode(invalidData, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const alerts = await weatherService.fetchCurrentWeatherAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should build correct API URL with parameters', async () => {
      const emptyResponse = '# empty';
      const eucKrBuffer = iconv.encode(emptyResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      await weatherService.fetchCurrentWeatherAlerts('e', '202501071000');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0];
      
      expect(calledUrl).toContain('https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php');
      expect(calledUrl).toContain('fe=e');
      expect(calledUrl).toContain('tm=202501071000');
      expect(calledUrl).toContain('help=0');
      expect(calledUrl).toContain('authKey=test-api-key');
    });
  });

  describe('parseCurrentWeatherCSVResponse', () => {
    it('should parse current weather CSV correctly', async () => {
      const mockResponse = `# 주석 라인
L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =
L1010000, 경기도, L1010200, 광명시, 202501071030, 202501071130, R, 3, 1, =`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const alerts = await weatherService.fetchCurrentWeatherAlerts();

      expect(alerts).toHaveLength(2);
      expect(alerts[0].REG_KO).toBe('서울강남구');
      expect(alerts[0].WRN).toBe('H');
      expect(alerts[0].LVL).toBe('2');
      expect(alerts[1].REG_KO).toBe('광명시');
      expect(alerts[1].WRN).toBe('R');
      expect(alerts[1].LVL).toBe('3');
    });

    it('should skip comment and empty lines', async () => {
      const mockResponse = `# 현재 특보현황
      
L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =

# 다른 주석
`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const alerts = await weatherService.fetchCurrentWeatherAlerts();
      expect(alerts).toHaveLength(1);
    });

    it('should handle malformed CSV lines gracefully', async () => {
      const mockResponse = `malformed line
L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =
incomplete, line`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const alerts = await weatherService.fetchCurrentWeatherAlerts();
      expect(alerts).toHaveLength(1);
    });
  });

  describe('convertCurrentToWeatherAlert', () => {
    it('should convert CurrentWeatherAlert to WeatherAlert correctly', async () => {
      const mockResponse = `L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      const currentAlerts = await weatherService.fetchCurrentWeatherAlerts();
      const convertedAlert = (weatherService as any).convertRawCurrentToWeatherAlert(currentAlerts[0]);

      expect(convertedAlert.REG_ID).toBe('L1100110');
      expect(convertedAlert.REG_NAME).toBe('서울강남구');
      expect(convertedAlert.WRN).toBe('H');
      expect(convertedAlert.LVL).toBe('2');
      expect(convertedAlert.CMD).toBe('1');
      expect(convertedAlert.TM_FC).toBe('202501071000');
      expect(convertedAlert.TM_EF).toBe('202501071100');
      expect(convertedAlert.REG_UP).toBe('L1100000');
      expect(convertedAlert.REG_KO).toBe('서울강남구');
      
      // 상위지역 정보 확인
      expect(convertedAlert.REG_UP_KO).toBe('서울특별시'); // 상위지역명
    });

    it('should handle region name fallback correctly', () => {
      // REG_KO가 없고, getRegionName이 매핑을 찾지 못하는 경우
      const mockResponse = `L9999999, 알수없는상위, L9999998, , 202501071000, 202501071100, H, 2, 1, =`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      return weatherService.fetchCurrentWeatherAlerts().then(currentAlerts => {
        const convertedAlert = (weatherService as any).convertRawCurrentToWeatherAlert(currentAlerts[0]);
        
        // REG_KO가 비어있고, getRegionName도 매핑을 찾지 못한 경우 REG_UP_KO를 사용
        expect(convertedAlert.REG_NAME).toBe('알수없는상위');
        expect(convertedAlert.REG_UP_KO).toBe('알수없는상위');
      });
    });
  });

  describe('initializeCacheWithCurrentAlerts', () => {
    it('should initialize cache with current alerts', async () => {
      const mockResponse = `L1100000, 서울특별시, L1100110, 서울강남구, 202501071000, 202501071100, H, 2, 1, =`;

      const eucKrBuffer = iconv.encode(mockResponse, 'euc-kr');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => eucKrBuffer.buffer
      });

      await weatherService.initializeCacheWithCurrentAlerts();

      const cachedAlerts = weatherService.getCachedAlerts();
      expect(cachedAlerts).toHaveLength(1);
      expect(cachedAlerts[0].regionName).toBe('서울강남구');
      expect(cachedAlerts[0].warningType).toBe('H');
      expect(cachedAlerts[0].level).toBe('2');
    });

    it('should handle errors during initialization', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(weatherService.initializeCacheWithCurrentAlerts()).rejects.toThrow('Network error');
    });
  });
});