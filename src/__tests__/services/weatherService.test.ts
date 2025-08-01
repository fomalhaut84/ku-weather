import { WeatherService } from '../../services/weatherService';
import { WeatherAlert } from '../../types/weather';

// fetch 모킹
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('WeatherService', () => {
  let weatherService: WeatherService;
  const testApiKey = 'test-api-key';

  beforeEach(() => {
    weatherService = new WeatherService(testApiKey);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('API 키가 제공되지 않으면 에러를 던져야 한다', () => {
      expect(() => new WeatherService('')).toThrow('WEATHER_API_KEY가 제공되지 않았습니다');
    });

    it('유효한 API 키로 인스턴스를 생성해야 한다', () => {
      expect(() => new WeatherService(testApiKey)).not.toThrow();
    });
  });

  describe('CSV 파싱 테스트', () => {
    it('유효한 CSV 응답을 파싱해야 한다', async () => {
      const mockCsvResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202507301000, 202507301100, 202507300900, 143, L1072200,   H,   3,   6,  00,   4,   101, =
202507301000, 202507301100, 202507300926, 159, L1082500,   H,   2,   1,  00,   4,   101, =
#END7777`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCsvResponse),
      } as Response);

      const alerts = await weatherService.getWeatherAlerts();

      expect(alerts).toHaveLength(2);
      expect(alerts[0]).toMatchObject({
        TM_FC: '202507301000',
        REG_ID: 'L1072200',
        WRN: 'H',
        LVL: '3',
        CMD: '6',
        REG_NAME: '경기남부' // 수동 매핑된 지역명
      });
    });

    it('빈 CSV 응답을 처리해야 한다', async () => {
      const mockEmptyResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
#END7777`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockEmptyResponse),
      } as Response);

      const alerts = await weatherService.getWeatherAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('지역명 매핑 테스트', () => {
    it('수동 매핑된 지역 코드를 올바른 이름으로 변환해야 한다', async () => {
      const mockCsvResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202507301000, 202507301100, 202507300900, 143, L1020110,   H,   2,   1,  00,   4,   101, =
202507301000, 202507301100, 202507300900, 143, S1323200,   V,   2,   1,  00,   4,   101, =
#END7777`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCsvResponse),
      } as Response);

      const alerts = await weatherService.getWeatherAlerts();

      expect(alerts[0].REG_NAME).toBe('서울강북');
      expect(alerts[1].REG_NAME).toBe('서해중부근해');
    });

    it('매핑되지 않은 지역 코드를 기본 패턴으로 처리해야 한다', async () => {
      const mockCsvResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202507301000, 202507301100, 202507300900, 143, L9999999,   H,   2,   1,  00,   4,   101, =
202507301000, 202507301100, 202507300900, 143, S9999999,   V,   2,   1,  00,   4,   101, =
#END7777`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCsvResponse),
      } as Response);

      const alerts = await weatherService.getWeatherAlerts();

      expect(alerts[0].REG_NAME).toBe('육상지역(L9999999)');
      expect(alerts[1].REG_NAME).toBe('해상지역(S9999999)');
    });
  });

  describe('API 호출 에러 처리', () => {
    it('API 호출 실패 시 에러를 던져야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server Error'),
      } as Response);

      await expect(weatherService.getWeatherAlerts()).rejects.toThrow('API 호출 실패');
    });

    it('403 에러 시 API 활용신청 메시지를 포함해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied'),
      } as Response);

      await expect(weatherService.getWeatherAlerts()).rejects.toThrow('API 활용신청이 필요합니다');
    });

    it('잘못된 응답 형식에 대해 에러를 던져야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Invalid response format'),
      } as Response);

      await expect(weatherService.getWeatherAlerts()).rejects.toThrow('유효하지 않은 응답 형식');
    });
  });

  describe('날짜 형식 변환', () => {
    it('날짜를 API 형식으로 변환해야 한다', () => {
      const testDate = new Date('2025-08-01T15:30:45');
      // private 메서드 테스트를 위해 any로 캐스팅
      const result = (weatherService as any).formatDateForAPI(testDate);
      
      expect(result).toBe('202508011530');
    });
  });

  describe('특보 필터링', () => {
    it('지역 필터링이 작동해야 한다', async () => {
      const mockCsvResponse = `#START7777
#      TM_FC,        TM_EF,        TM_IN, STN,   REG_ID, WRN, LVL, CMD, GRD, CNT,   RPT, =
202507301000, 202507301100, 202507300900, 143, L1020110,   H,   2,   1,  00,   4,   101, =
202507301000, 202507301100, 202507300900, 143, L1072200,   H,   2,   1,  00,   4,   101, =
#END7777`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCsvResponse),
      } as Response);

      const alerts = await weatherService.getWeatherAlerts(['서울강북']);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].REG_NAME).toBe('서울강북');
    });
  });
});