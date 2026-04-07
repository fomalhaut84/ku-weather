import { WeatherForecast, ForecastResult } from '../../types/weather';
import { WeatherApiResponse, ForecastItem } from '../../types/api';
import { logger } from '../../utils/logger';

/**
 * 격자 좌표 정보 (기상청 API용)
 */
export interface GridCoordinateInfo {
  nx: number;
  ny: number;
  name: string;
}

/**
 * ForecastService 의존성
 */
interface ForecastServiceDeps {
  readonly getGridCoordinates: (regionId: string) => GridCoordinateInfo | null;
  readonly fetchWithRetry: (url: string, options?: RequestInit, maxRetries?: number, timeout?: number) => Promise<Response>;
  readonly getKSTNow: () => Date;
}

/**
 * 날씨 예보 서비스
 * 초단기예보(getUltraSrtFcst) + 단기예보(getVilageFcst) 데이터를 조회·합성
 */
export class ForecastService {
  private readonly authKey: string;
  private readonly getGridCoordinates: (regionId: string) => GridCoordinateInfo | null;
  private readonly fetchWithRetry: (url: string, options?: RequestInit, maxRetries?: number, timeout?: number) => Promise<Response>;
  private readonly getKSTNow: () => Date;

  private readonly ultraSrtFcstUrl = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst';
  private readonly vilageFcstUrl = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst';

  constructor(authKey: string, deps: ForecastServiceDeps) {
    if (!authKey) {
      throw new Error('WEATHER_API_KEY가 제공되지 않았습니다');
    }
    this.authKey = authKey;
    this.getGridCoordinates = deps.getGridCoordinates;
    this.fetchWithRetry = deps.fetchWithRetry;
    this.getKSTNow = deps.getKSTNow;
  }

  /**
   * 초단기예보 데이터 조회
   * @param regionId 지역 코드 (특보구역 코드)
   * @returns 날씨 예보 데이터
   */
  async getWeatherForecast(regionId: string): Promise<WeatherForecast | null> {
    const result = await this.getWeatherForecastWithResult(regionId);
    return result.data;
  }

  /**
   * 상세 결과 포함 날씨 예보 조회
   * 초단기예보(getUltraSrtFcst) + 단기예보(getVilageFcst) 데이터를 합성
   */
  async getWeatherForecastWithResult(regionId: string): Promise<ForecastResult> {
    const startTime = Date.now();

    try {
      // 1. 격자 좌표 조회 (CSV 우선, 하드코딩 fallback)
      const gridInfo = this.getGridCoordinates(regionId);
      if (!gridInfo) {
        return {
          success: false,
          data: null,
          error: `지역 코드 ${regionId}에 대한 격자 좌표를 찾을 수 없습니다`
        };
      }

      const now = this.getKSTNow();

      // 2. 초단기예보 + 단기예보 병렬 호출
      const [ultraSrtResult, vilageResult] = await Promise.allSettled([
        this.fetchUltraSrtFcst(gridInfo, now),
        this.fetchVilageFcst(gridInfo, now)
      ]);

      const ultraSrtData = ultraSrtResult.status === 'fulfilled' ? ultraSrtResult.value : null;
      const vilageData = vilageResult.status === 'fulfilled' ? vilageResult.value : null;

      if (!ultraSrtData && !vilageData) {
        return {
          success: false,
          data: null,
          error: '초단기예보와 단기예보 모두 조회 실패'
        };
      }

      // 3. 데이터 합성
      const forecast = this.mergeForecastData(ultraSrtData, vilageData, regionId, gridInfo.name);

      if (!forecast) {
        return {
          success: false,
          data: null,
          error: '예보 데이터 파싱 실패'
        };
      }

      const source = ultraSrtData && vilageData ? 'merged' as const
        : ultraSrtData ? 'ultra-short' as const
        : 'village' as const;

      const elapsedTime = Date.now() - startTime;
      logger.info(`지역 ${gridInfo.name}(${regionId}) 날씨 예보 조회 성공 (${source}, ${elapsedTime}ms)`);

      return { success: true, data: forecast, source };
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`날씨 예보 조회 실패 (지역: ${regionId}, ${elapsedTime}ms): ${errorMsg}`);
      return { success: false, data: null, error: errorMsg };
    }
  }

  /**
   * 초단기예보 API 호출 (getUltraSrtFcst)
   * 1시간 단위, 매 시간 30분 발표
   */
  private async fetchUltraSrtFcst(
    gridInfo: { nx: number; ny: number; name: string },
    now: Date
  ): Promise<ForecastItem[] | null> {
    const { baseTime, needsPreviousDay } = this.getUltraSrtBaseTime(now);
    const baseDateTime = needsPreviousDay ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
    const baseDate = this.formatDate(baseDateTime);

    const params = new URLSearchParams({
      authKey: this.authKey,
      base_date: baseDate,
      base_time: baseTime,
      nx: gridInfo.nx.toString(),
      ny: gridInfo.ny.toString(),
      dataType: 'JSON',
      numOfRows: '1000',
      pageNo: '1'
    });

    const url = `${this.ultraSrtFcstUrl}?${params.toString()}`;
    logger.debug(`초단기예보 API 호출: base_date=${baseDate}, base_time=${baseTime}, nx=${gridInfo.nx}, ny=${gridInfo.ny}`);

    return this.fetchForecastApi(url, '초단기예보');
  }

  /**
   * 단기예보 API 호출 (getVilageFcst)
   * 3시간 단위, 02/05/08/11/14/17/20/23시 발표
   */
  private async fetchVilageFcst(
    gridInfo: { nx: number; ny: number; name: string },
    now: Date
  ): Promise<ForecastItem[] | null> {
    const { baseTime, needsPreviousDay } = this.getVilageFcstBaseTime(now);
    const baseDateTime = needsPreviousDay ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
    const baseDate = this.formatDate(baseDateTime);

    const params = new URLSearchParams({
      authKey: this.authKey,
      base_date: baseDate,
      base_time: baseTime,
      nx: gridInfo.nx.toString(),
      ny: gridInfo.ny.toString(),
      dataType: 'JSON',
      numOfRows: '1000',
      pageNo: '1'
    });

    const url = `${this.vilageFcstUrl}?${params.toString()}`;
    logger.debug(`단기예보 API 호출: base_date=${baseDate}, base_time=${baseTime}, nx=${gridInfo.nx}, ny=${gridInfo.ny}`);

    return this.fetchForecastApi(url, '단기예보');
  }

  /**
   * 예보 API 공통 호출 로직
   */
  private async fetchForecastApi(url: string, apiName: string): Promise<ForecastItem[] | null> {
    try {
      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        logger.warn(`${apiName} API 호출 실패: ${response.status} ${response.statusText}`);
        return null;
      }

      const responseText = await response.text();
      let jsonData: WeatherApiResponse;

      try {
        jsonData = JSON.parse(responseText);
      } catch {
        if (responseText.includes('#START')) {
          logger.warn(`${apiName} API가 텍스트 형식 응답을 반환했습니다`);
        }
        return null;
      }

      if (!jsonData?.response?.header || jsonData.response.header.resultCode !== '00') {
        logger.warn(`${apiName} API 오류: ${jsonData?.response?.header?.resultMsg || 'Unknown'}`);
        return null;
      }

      const items = jsonData.response.body?.items?.item;
      if (!items || !Array.isArray(items) || items.length === 0) {
        logger.warn(`${apiName} 데이터가 비어있습니다`);
        return null;
      }

      return items;
    } catch (error) {
      logger.warn(`${apiName} 호출 중 오류:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * 초단기예보 + 단기예보 데이터를 합성
   * 초단기예보: T1H, RN1, SKY, PTY, WSD, REH, VEC, LGT (현재 기온, 강수량 등)
   * 단기예보: POP, TMN, TMX, T3H (강수확률, 최저/최고기온)
   */
  private mergeForecastData(
    ultraSrtItems: ForecastItem[] | null,
    vilageItems: ForecastItem[] | null,
    regionId: string,
    regionName: string
  ): WeatherForecast | null {
    // 실제 UTC 시각으로 비교 (parseForecastTime이 UTC Date를 반환하므로 일관성 유지)
    const nowUtc = new Date();
    const dataMap: Record<string, string> = {};
    let baseDate = '';
    let baseTimeStr = '';
    let forecastTimeKey: string | null = null;

    // 초단기예보 데이터 처리 (현재 기온, 풍속, 습도 등)
    if (ultraSrtItems && ultraSrtItems.length > 0) {
      baseDate = ultraSrtItems[0].baseDate;
      baseTimeStr = ultraSrtItems[0].baseTime;

      // 가장 가까운 미래 시간대 선택
      const { items: selectedItems, timeKey } = this.selectNearestTimeSlice(ultraSrtItems, nowUtc);
      if (timeKey) forecastTimeKey = timeKey;
      for (const item of selectedItems) {
        if (item.category && item.fcstValue !== undefined) {
          dataMap[item.category] = item.fcstValue;
        }
      }
    }

    // 단기예보 데이터 처리 (POP, TMN, TMX 등 - 초단기에 없는 데이터)
    if (vilageItems && vilageItems.length > 0) {
      if (!baseDate) {
        baseDate = vilageItems[0].baseDate;
        baseTimeStr = vilageItems[0].baseTime;
      }

      // TMN/TMX는 특정 시간에만 발표되므로 전체 아이템에서 검색
      for (const item of vilageItems) {
        if (item.category === 'TMN' || item.category === 'TMX') {
          if (!dataMap[item.category]) {
            dataMap[item.category] = item.fcstValue;
          }
        }
      }

      // POP, T3H 등은 초단기 선택 시간대에 가장 가까운 시간대에서 추출
      // (초단기 시간대가 있으면 그에 맞춰 정렬, 없으면 현재 시각 기준)
      const { items: selectedVilageItems, timeKey } = forecastTimeKey
        ? this.selectNearestTimeSlice(vilageItems, nowUtc, forecastTimeKey)
        : this.selectNearestTimeSlice(vilageItems, nowUtc);
      if (!forecastTimeKey && timeKey) forecastTimeKey = timeKey;
      for (const item of selectedVilageItems) {
        if (item.category && item.fcstValue !== undefined) {
          // 초단기예보 데이터가 없는 카테고리만 추가
          if (!dataMap[item.category]) {
            dataMap[item.category] = item.fcstValue;
          }
        }
      }
    }

    if (Object.keys(dataMap).length === 0) {
      return null;
    }

    // 강수량 파싱
    let precipitation: number | undefined;
    if (dataMap['RN1']) {
      const rn1 = dataMap['RN1'];
      if (rn1 === '강수없음' || rn1.includes('강수없음')) {
        precipitation = 0;
      } else if (rn1.includes('1mm 미만')) {
        precipitation = 0.1;
      } else {
        precipitation = this.parseNumber(rn1);
      }
    }

    // 기온: 초단기(T1H) 우선, 없으면 단기(T3H) 사용
    const temperature = this.parseNumber(dataMap['T1H']) ?? this.parseNumber(dataMap['T3H']);

    // forecastTime: 선택된 예보 시간대의 유효 시각 (조회 시각이 아님)
    const forecastTime = forecastTimeKey
      ? this.parseForecastTime(forecastTimeKey)
      : this.parseForecastTime(baseDate + baseTimeStr);

    const forecast: WeatherForecast = {
      regionId,
      regionName,
      baseTime: this.parseForecastTime(baseDate + baseTimeStr),
      forecastTime,
      temperature,
      humidity: this.parseNumber(dataMap['REH']),
      skyCondition: this.parseNumber(dataMap['SKY']),
      precipitationType: this.parseNumber(dataMap['PTY']),
      precipitation,
      windSpeed: this.parseNumber(dataMap['WSD']),
      windDirection: this.parseNumber(dataMap['VEC']),
      lightningProbability: this.parseNumber(dataMap['LGT']),
      // 단기예보 전용 데이터
      precipitationProbability: this.parseNumber(dataMap['POP']),
      minTemperature: this.parseNumber(dataMap['TMN']),
      maxTemperature: this.parseNumber(dataMap['TMX']),
    };

    // 체감온도 계산
    if (forecast.temperature !== undefined && forecast.windSpeed !== undefined) {
      forecast.feelsLike = this.calculateFeelsLike(
        forecast.temperature,
        forecast.windSpeed,
        forecast.humidity
      );
    }

    return forecast;
  }

  /**
   * 예보 아이템에서 가장 가까운 시간대 데이터를 선택
   * @param items 예보 아이템 배열
   * @param referenceUtc 비교 기준 시각 (실제 UTC Date)
   * @param referenceTimeKey 참조 시간 키 (다른 API에서 선택된 시간대에 맞추기 위해 사용, KST YYYYMMDDHHmm)
   * @returns 선택된 시간대의 아이템과 해당 시간 키
   */
  private selectNearestTimeSlice(
    items: ForecastItem[],
    referenceUtc: Date,
    referenceTimeKey?: string
  ): { items: ForecastItem[]; timeKey: string | null } {
    const timeSlices = new Map<string, ForecastItem[]>();

    for (const item of items) {
      if (item.fcstDate && item.fcstTime) {
        const timeKey = item.fcstDate + item.fcstTime;
        if (!timeSlices.has(timeKey)) {
          timeSlices.set(timeKey, []);
        }
        timeSlices.get(timeKey)!.push(item);
      }
    }

    if (timeSlices.size === 0) return { items: [], timeKey: null };

    const sortedTimes = Array.from(timeSlices.keys()).sort();

    // referenceTimeKey가 주어진 경우: 해당 시각에 가장 가까운 시간대 선택
    // (초단기에서 선택된 시간대에 맞춰 단기예보 시간대를 정렬)
    if (referenceTimeKey) {
      const refUtc = this.parseForecastTime(referenceTimeKey);
      let bestTime = sortedTimes[0];
      let bestDiff = Infinity;

      for (const timeKey of sortedTimes) {
        const diff = Math.abs(this.parseForecastTime(timeKey).getTime() - refUtc.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestTime = timeKey;
        }
      }

      return { items: timeSlices.get(bestTime) || [], timeKey: bestTime };
    }

    // 기본: 가장 가까운 미래 시간대 선택
    // 기본값: 가장 최근(마지막) 시간대 (모든 시간이 과거일 때)
    let selectedTime = sortedTimes[sortedTimes.length - 1];

    // parseForecastTime은 KST→UTC 변환하므로, referenceUtc (실제 UTC)와 일관된 비교 가능
    for (const timeKey of sortedTimes) {
      const forecastTime = this.parseForecastTime(timeKey);
      if (forecastTime >= referenceUtc) {
        selectedTime = timeKey;
        break;
      }
    }

    return { items: timeSlices.get(selectedTime) || [], timeKey: selectedTime };
  }

  /**
   * 날짜를 YYYYMMDD 형식으로 변환
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 초단기예보 기준시각 계산
   * 매 시간 30분에 발표되므로, 30분 이전이면 이전 시각, 30분 이후면 현재 시각
   * @returns baseTime: 시각(HHmm), needsPreviousDay: 전날 날짜가 필요한지 여부
   */
  private getUltraSrtBaseTime(date: Date): { baseTime: string; needsPreviousDay: boolean } {
    const hour = date.getHours();
    const minute = date.getMinutes();

    // 30분 이전이면 이전 시각
    const baseHour = minute < 30 ? hour - 1 : hour;

    // 0시 이전이면 23시로 (전날 날짜가 필요함)
    const needsPreviousDay = baseHour < 0;
    const adjustedHour = needsPreviousDay ? 23 : baseHour;

    return {
      baseTime: `${String(adjustedHour).padStart(2, '0')}30`,
      needsPreviousDay
    };
  }

  /**
   * 단기예보 기준시각 계산
   * 02:00, 05:00, 08:00, 11:00, 14:00, 17:00, 20:00, 23:00 에 발표
   * 각 발표 시각 + ~10분 후 API에서 제공 (여유를 두어 +15분 기준)
   */
  getVilageFcstBaseTime(date: Date): { baseTime: string; needsPreviousDay: boolean } {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const currentMinutes = hour * 60 + minute;

    // 발표 시각 목록 (분 단위) + API 제공 지연 15분
    const publishTimes = [
      { hour: 2, available: 2 * 60 + 15 },
      { hour: 5, available: 5 * 60 + 15 },
      { hour: 8, available: 8 * 60 + 15 },
      { hour: 11, available: 11 * 60 + 15 },
      { hour: 14, available: 14 * 60 + 15 },
      { hour: 17, available: 17 * 60 + 15 },
      { hour: 20, available: 20 * 60 + 15 },
      { hour: 23, available: 23 * 60 + 15 },
    ];

    // 현재 시각 기준으로 가장 최근 발표 시각 찾기
    let selectedHour = 23; // 기본값: 전날 23시
    let needsPreviousDay = true;

    for (let i = publishTimes.length - 1; i >= 0; i--) {
      if (currentMinutes >= publishTimes[i].available) {
        selectedHour = publishTimes[i].hour;
        needsPreviousDay = false;
        break;
      }
    }

    return {
      baseTime: `${String(selectedHour).padStart(2, '0')}00`,
      needsPreviousDay
    };
  }

  /**
   * 예보 시각 문자열을 Date 객체로 변환 (KST 기준)
   * 형식: YYYYMMDDHHmm
   * API 응답은 KST 시간이므로 UTC로 변환하여 저장
   */
  private parseForecastTime(timeStr: string): Date {
    if (!timeStr || timeStr.length < 12) {
      return this.getKSTNow();
    }

    const year = parseInt(timeStr.substring(0, 4));
    const month = parseInt(timeStr.substring(4, 6)) - 1;
    const day = parseInt(timeStr.substring(6, 8));
    const hour = parseInt(timeStr.substring(8, 10));
    const minute = parseInt(timeStr.substring(10, 12));

    // API 응답은 KST 시간(UTC+9)이므로, UTC로 변환
    // Date.UTC는 UTC 밀리초를 반환하므로, KST에서 9시간을 빼야 함
    const utcTime = Date.UTC(year, month, day, hour, minute) - 9 * 60 * 60 * 1000;
    return new Date(utcTime);
  }

  /**
   * 문자열을 숫자로 변환 (실패 시 undefined)
   */
  private parseNumber(value: string | undefined): number | undefined {
    if (!value || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 체감온도 계산 (Windchill & Heat Index)
   * @param temp 기온 (°C)
   * @param windSpeed 풍속 (m/s)
   * @param humidity 습도 (%)
   */
  private calculateFeelsLike(temp: number, windSpeed: number, humidity?: number): number {
    // 10°C 이하: Windchill (바람찬기 지수)
    if (temp <= 10 && windSpeed > 1.3) {
      const windKmh = windSpeed * 3.6; // m/s -> km/h
      const windchill = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
      return Math.round(windchill * 10) / 10;
    }

    // 27°C 이상 + 습도 40% 이상: Heat Index (불쾌지수)
    if (temp >= 27 && humidity !== undefined && humidity >= 40) {
      const tempF = temp * 9 / 5 + 32; // °C -> °F
      const heatIndex = -42.379 + 2.04901523 * tempF + 10.14333127 * humidity
        - 0.22475541 * tempF * humidity - 0.00683783 * tempF * tempF
        - 0.05481717 * humidity * humidity + 0.00122874 * tempF * tempF * humidity
        + 0.00085282 * tempF * humidity * humidity - 0.00000199 * tempF * tempF * humidity * humidity;
      const heatIndexC = (heatIndex - 32) * 5 / 9; // °F -> °C
      return Math.round(heatIndexC * 10) / 10;
    }

    // 그 외: 실제 기온 그대로
    return temp;
  }
}
