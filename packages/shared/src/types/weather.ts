/**
 * 기상특보 공유 타입 정의
 * 백엔드 API 응답 / 프론트엔드 공통으로 사용하는 타입
 */

/** 특보 종류 코드 */
export type WeatherWarningType = 'W' | 'R' | 'C' | 'D' | 'O' | 'N' | 'V' | 'T' | 'S' | 'Y' | 'H' | 'F';

/** 특보 수준 코드 */
export type WeatherWarningLevel = '1' | '2' | '3';

/** 특보 명령 코드 */
export type WeatherCommandCode = '1' | '2' | '3' | '4' | '5' | '6' | '7';

/**
 * 특보 변동 유형
 */
export type AlertChangeType =
  | 'NEW'
  | 'RESOLVED'
  | 'LEVEL_UP'
  | 'LEVEL_DOWN'
  | 'TIME_EXTENDED'
  | 'MODIFIED';

/**
 * 기상특보 DTO (DB/API 응답 형태)
 * Prisma WeatherAlert 모델과 동일한 필드
 */
export interface WeatherAlertDto {
  readonly id: string;
  readonly regionId: string;
  readonly regionName: string;
  readonly upperRegion: string | null;
  readonly warningType: string;
  readonly warningLevel: string;
  readonly command: string;
  readonly announcedAt: string;
  readonly effectiveAt: string;
  readonly endTime: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 캐시된 특보 데이터
 * 변동 감지를 위해 간소화된 특보 정보
 */
export interface CachedAlert {
  readonly key: string;
  readonly regionId: string;
  readonly regionName: string;
  readonly upperRegion?: string;
  readonly warningType: string;
  readonly level: string;
  readonly command: string;
  readonly announcedAt: string;
  readonly effectiveAt: string;
  readonly lastUpdated: string;
  readonly lastSeenAt?: string;
  readonly endTime?: string;
}

/**
 * 특보 변동 정보
 */
export interface AlertChange {
  readonly type: AlertChangeType;
  readonly current?: CachedAlert;
  readonly previous?: CachedAlert;
  readonly description: string;
}

/**
 * 단기예보 데이터
 */
export interface WeatherForecast {
  readonly regionId: string;
  readonly regionName: string;
  readonly baseTime: Date;
  readonly forecastTime: Date;
  readonly temperature?: number;
  readonly feelsLike?: number;
  readonly minTemperature?: number;
  readonly maxTemperature?: number;
  readonly precipitationProbability?: number;
  readonly precipitation?: number;
  readonly humidity?: number;
  readonly skyCondition?: number;
  readonly precipitationType?: number;
  readonly windSpeed?: number;
  readonly windDirection?: number;
  readonly lightningProbability?: number;
}

/**
 * 예보 조회 결과
 */
export interface ForecastResult {
  readonly success: boolean;
  readonly data: WeatherForecast | null;
  readonly error?: string;
  readonly source?: 'ultra-short' | 'village' | 'merged';
}

/** 하늘상태 코드 */
export enum SkyCondition {
  CLEAR = 1,
  PARTLY_CLOUDY = 3,
  CLOUDY = 4,
}

/** 강수형태 코드 */
export enum PrecipitationType {
  NONE = 0,
  RAIN = 1,
  RAIN_SNOW = 2,
  SNOW = 3,
  RAIN_DROP = 5,
  RAIN_DROP_SNOW = 6,
  SNOW_FLURRY = 7,
}
