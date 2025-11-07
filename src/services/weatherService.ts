import { WeatherAlert, WeatherApiParams, WeatherWarningType, WeatherRegion, AlertChange, WeatherForecast } from '../types/weather';
import { logger } from '../utils/logger';
import { AlertCache } from './AlertCache';
import * as fs from 'fs';
import * as path from 'path';

export class WeatherService {
  private readonly baseUrl = 'https://apihub.kma.go.kr/api/typ01/url/wrn_met_data.php';
  private readonly regionUrl = 'https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php';
  private readonly forecastUrl = 'https://apihub.kma.go.kr/api/typ01/url/fct_afs_dl.php';
  private readonly authKey: string;
  private regionCache: Map<string, string> = new Map();
  private alertCache: AlertCache = new AlertCache();
  private lastCheckTime: Date | null = null;
  private isInitialized: boolean = false;
  private lastLogTime: Date | null = null;
  private lastApiCalls: string[] = [];

  // 기상청 특보구역 코드 -> 격자 좌표 매핑
  private readonly gridCoordinates: Map<string, { nx: number; ny: number; name: string }> = new Map([
    // 서울특별시
    ['L1100000', { nx: 60, ny: 127, name: '서울특별시' }],
    ['L1100100', { nx: 60, ny: 127, name: '서울동남권' }],
    ['L1100200', { nx: 60, ny: 127, name: '서울동북권' }],
    ['L1100300', { nx: 60, ny: 127, name: '서울서남권' }],
    ['L1100400', { nx: 60, ny: 127, name: '서울서북권' }],

    // 광역시
    ['L1110000', { nx: 55, ny: 124, name: '인천광역시' }],
    ['L1120000', { nx: 67, ny: 100, name: '대전광역시' }],
    ['L1130000', { nx: 58, ny: 74, name: '광주광역시' }],
    ['L1140000', { nx: 89, ny: 90, name: '대구광역시' }],
    ['L1150000', { nx: 98, ny: 76, name: '부산광역시' }],
    ['L1160000', { nx: 102, ny: 84, name: '울산광역시' }],
    ['L1170000', { nx: 66, ny: 103, name: '세종특별자치시' }],

    // 경기도
    ['L1010000', { nx: 60, ny: 120, name: '경기도' }],

    // 강원특별자치도
    ['L1020000', { nx: 73, ny: 134, name: '강원특별자치도' }],

    // 충청남도
    ['L1030000', { nx: 55, ny: 107, name: '충청남도' }],

    // 충청북도
    ['L1040000', { nx: 69, ny: 107, name: '충청북도' }],

    // 전북특별자치도
    ['L1050000', { nx: 63, ny: 89, name: '전북특별자치도' }],

    // 전라남도
    ['L1060000', { nx: 51, ny: 67, name: '전라남도' }],

    // 경상북도
    ['L1070000', { nx: 87, ny: 106, name: '경상북도' }],

    // 경상남도
    ['L1080000', { nx: 91, ny: 77, name: '경상남도' }],

    // 제주특별자치도
    ['L1090000', { nx: 52, ny: 38, name: '제주특별자치도' }],
  ]);

  constructor(authKey: string) {
    this.authKey = authKey;
    if (!this.authKey) {
      throw new Error('WEATHER_API_KEY가 제공되지 않았습니다');
    }
    
    // status.log 파일 초기화
    this.initializeStatusLog();
  }

  /**
   * 최적화된 특보 데이터 조회 (증분 업데이트)
   * @param targetRegIds 대상 지역 코드 배열
   * @param warningTypes 특보 종류 배열
   * @param subcd 날씨해설 부제목코드
   * @returns 특보 배열
   */
  private async getWeatherAlertsOptimized(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    subcd?: string
  ): Promise<WeatherAlert[]> {
    try {
      let allAlerts: WeatherAlert[] = [];

      // 최초 실행인지 확인
      const isFirstRun = !this.isInitialized || this.lastCheckTime === null;
      
      if (isFirstRun) {
        logger.debug('최초 실행: 과거 7일간 특보 이력 조회');
        // 최초 실행: 과거 7일간 데이터 조회
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        allAlerts = await this.fetchWeatherAlertsFromTime(targetRegIds, warningTypes, sevenDaysAgo, subcd);
      } else {
        logger.debug('증분 업데이트: 최근 2시간 데이터 조회 (해제 알림 누락 방지를 위한 고정 범위)');
        // 증분 업데이트: 현재 시점에서 2시간 전까지의 데이터를 항상 조회 (예측 가능하고 안정적)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        
        allAlerts = await this.fetchWeatherAlertsFromTime(targetRegIds, warningTypes, twoHoursAgo, subcd);
      }

      // 지역 필터링
      if (targetRegIds.length > 0) {
        allAlerts = allAlerts.filter(alert => 
          targetRegIds.includes(alert.REG_ID)
        );
      }

      const period = isFirstRun ? '(현재상황)' : '(증분)';
      logger.info(`${period} 총 ${allAlerts.length}개의 기상특보를 조회했습니다`);
      return allAlerts;
    } catch (error) {
      logger.error('최적화된 기상특보 조회 중 오류:', error);
      
      // 오류 시 기존 방식으로 폴백
      logger.warn('기존 방식으로 폴백하여 재시도합니다');
      return await this.getWeatherAlerts(targetRegIds, warningTypes, subcd);
    }
  }

  async getWeatherAlerts(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    subcd?: string
  ): Promise<WeatherAlert[]> {
    try {
      let allAlerts: WeatherAlert[] = [];

      // 특보 종류별로 요청
      if (warningTypes.length === 0) {
        allAlerts = await this.fetchWeatherAlerts(undefined, subcd);
      } else {
        for (const warningType of warningTypes) {
          const alerts = await this.fetchWeatherAlerts(warningType as WeatherWarningType, subcd);
          allAlerts.push(...alerts);
        }
      }

      // 지역 필터링
      if (targetRegIds.length > 0) {
        allAlerts = allAlerts.filter(alert => 
          targetRegIds.includes(alert.REG_ID)
        );
      }

      logger.info(`총 ${allAlerts.length}개의 기상특보를 조회했습니다`);
      return allAlerts;
    } catch (error) {
      logger.error('기상특보 조회 중 오류:', error);
      throw error;
    }
  }

  private async fetchWeatherAlerts(warningType?: WeatherWarningType, subcd?: string): Promise<WeatherAlert[]> {
    try {
      // 현재 시각부터 3일 전까지의 데이터 조회 (최근 특보 위주)
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      
      const params: WeatherApiParams = {
        tmfc1: this.formatDateForAPI(threeDaysAgo),
        tmfc2: this.formatDateForAPI(now),
        disp: 0,   // 기본 표출
        help: 0,   // 도움말 비표시
        authKey: this.authKey
      };

      // wrn 파라미터: 없으면 전체 특보
      if (warningType) {
        params.wrn = warningType;
      }

      // reg 파라미터: 없으면 전국 (현재는 전국만 지원)
      // params.reg = '0'; // 필요시 추가

      // subcd 파라미터: 없으면 전체
      if (subcd) {
        params.subcd = subcd;
      }

      const queryString = Object.entries(params)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const url = `${this.baseUrl}?${queryString}`;
      logger.debug(`기상특보 API 호출: ${warningType || '전체'}`);
      logger.debug(`요청 URL: ${url}`);
      
      // API 호출 URL 기록
      this.recordApiCall(url);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        logger.debug(`API 응답 상태: ${response.status}, 내용: ${errorText}`);
        
        if (response.status === 403) {
          throw new Error(`API 활용신청이 필요합니다. 기상청 API Hub(https://apihub.kma.go.kr)에서 활용신청을 먼저 해주세요. 응답: ${errorText}`);
        }
        
        throw new Error(`API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      
      // 응답 형식이 CSV 형태인지 확인
      if (!responseText.trim().startsWith('#START')) {
        logger.debug(`API 응답: ${responseText.substring(0, 200)}...`);
        throw new Error(`유효하지 않은 응답 형식: ${responseText.substring(0, 100)}`);
      }

      // 응답 구조 확인을 위한 로깅
      logger.debug(`API 응답 샘플:\n${responseText.split('\n').slice(0, 5).join('\n')}`);

      const data = this.parseCSVResponse(responseText);
      
      logger.debug(`${warningType || '전체'} 특보 ${data.length}개 조회`);
      return data;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`기상특보 조회 중 오류 (종류: ${warningType || '전체'}): ${error.message}`);
      } else {
        logger.error(`기상특보 조회 중 알 수 없는 오류 (종류: ${warningType || '전체'}):`, error);
      }
      throw error;
    }
  }

  /**
   * 특보 변동사항을 감지합니다.
   * 최초 실행 시 3일치 데이터로 캐시 초기화, 이후 증분 조회로 최적화됩니다.
   * @param targetRegIds 대상 지역 코드 배열
   * @param warningTypes 특보 종류 배열
   * @param subcd 날씨해설 부제목코드
   * @returns 감지된 변동사항 배열
   */
  async checkForAlertChanges(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    subcd?: string
  ): Promise<AlertChange[]> {
    try {
      logger.debug('특보 변동 감지 시작');
      
      // 현재 특보 데이터 조회 (최적화된 기간)
      const alerts = await this.getWeatherAlertsOptimized(targetRegIds, warningTypes, subcd);
      
      // AlertCache를 통한 변동 감지
      const changes = this.alertCache.detectChanges(alerts);
      
      // 마지막 확인 시각 업데이트
      this.lastCheckTime = new Date();
      
      if (!this.isInitialized) {
        this.isInitialized = true;
        logger.info('특보 캐시 초기화 완료');
        
        // 최초 로드 후 AlertCache 상태를 status.log에 저장
        this.saveAlertCacheToStatusLog('최초_로드_완료');
        
        // API 호출 기록 초기화 (다음 호출부터 새로 기록)
        this.lastApiCalls = [];
        
        // 최초 실행 시에는 빈 배열 반환 (기존 특보를 신규로 알림하지 않음)
        return [];
      }
      
      // 재호출 후 갱신된 AlertCache 상태를 status.log에 저장
      // (변동사항이 있거나 10분마다 한번씩 상태 기록)
      const shouldLog = changes.length > 0 || this.shouldLogStatus();
      if (shouldLog) {
        const eventName = changes.length > 0 ? '재호출_후_갱신_변동있음' : '재호출_후_갱신_변동없음';
        this.saveAlertCacheToStatusLog(eventName);
        
        // API 호출 기록 초기화 (다음 호출부터 새로 기록)
        this.lastApiCalls = [];
      }
      
      logger.info(`특보 변동 감지 완료: ${changes.length}개 변동사항`);
      return changes;
      
    } catch (error) {
      logger.error('특보 변동 감지 중 오류:', error);
      return [];
    }
  }

  async checkForNewAlerts(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    subcd?: string
  ): Promise<WeatherAlert[]> {
    try {
      const alerts = await this.getWeatherAlerts(targetRegIds, warningTypes, subcd);
      logger.info(`${alerts.length}개의 기상특보를 발견했습니다`);
      return alerts;
    } catch (error) {
      logger.error('새로운 기상특보 확인 중 오류:', error);
      return [];
    }
  }

  /**
   * 지정된 일수만큼 과거부터 현재까지의 특보 데이터를 조회합니다.
   * @param targetRegIds 대상 지역 코드 배열
   * @param warningTypes 특보 종류 배열
   * @param subcd 날씨해설 부제목코드
   * @param days 조회할 일수
   * @returns 특보 배열
   */
  private async fetchWeatherAlertsWithPeriod(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    subcd?: string,
    days: number = 3
  ): Promise<WeatherAlert[]> {
    const allAlerts: WeatherAlert[] = [];
    
    // 특보 종류별로 요청
    if (warningTypes.length === 0) {
      const alerts = await this.fetchWeatherAlertsForPeriod(undefined, subcd, days);
      allAlerts.push(...alerts);
    } else {
      for (const warningType of warningTypes) {
        const alerts = await this.fetchWeatherAlertsForPeriod(warningType as WeatherWarningType, subcd, days);
        allAlerts.push(...alerts);
      }
    }
    
    return allAlerts;
  }

  /**
   * 지정된 시각부터 현재까지의 특보 데이터를 조회합니다.
   * @param targetRegIds 대상 지역 코드 배열
   * @param warningTypes 특보 종류 배열
   * @param subcd 날씨해설 부제목코드
   * @param fromTime 조회 시작 시각
   * @returns 특보 배열
   */
  private async fetchWeatherAlertsFromTime(
    targetRegIds: string[] = [], 
    warningTypes: string[] = [],
    fromTime: Date,
    subcd?: string
  ): Promise<WeatherAlert[]> {
    const allAlerts: WeatherAlert[] = [];
    
    // 특보 종류별로 요청
    if (warningTypes.length === 0) {
      const alerts = await this.fetchWeatherAlertsForTimeRange(fromTime, new Date(), undefined, subcd);
      allAlerts.push(...alerts);
    } else {
      for (const warningType of warningTypes) {
        const alerts = await this.fetchWeatherAlertsForTimeRange(fromTime, new Date(), warningType as WeatherWarningType, subcd);
        allAlerts.push(...alerts);
      }
    }
    
    return allAlerts;
  }

  /**
   * 특정 기간 동안의 특보를 조회합니다.
   * @param warningType 특보 종류
   * @param subcd 날씨해설 부제목코드
   * @param days 조회할 일수
   * @returns 특보 배열
   */
  private async fetchWeatherAlertsForPeriod(warningType?: WeatherWarningType, subcd?: string, days: number = 3): Promise<WeatherAlert[]> {
    const now = new Date();
    const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    return this.fetchWeatherAlertsForTimeRange(pastDate, now, warningType, subcd);
  }

  /**
   * 지정된 시간 범위의 특보를 조회합니다.
   * @param warningType 특보 종류
   * @param subcd 날씨해설 부제목코드
   * @param startTime 시작 시각
   * @param endTime 종료 시각
   * @returns 특보 배열
   */
  private async fetchWeatherAlertsForTimeRange(
    startTime: Date,
    endTime: Date,
    warningType?: WeatherWarningType,
    subcd?: string
  ): Promise<WeatherAlert[]> {
    try {
      const params: WeatherApiParams = {
        tmfc1: this.formatDateForAPI(startTime),
        tmfc2: this.formatDateForAPI(endTime),
        disp: 0,   // 기본 표출
        help: 0,   // 도움말 비표시
        authKey: this.authKey
      };

      // wrn 파라미터: 없으면 전체 특보
      if (warningType) {
        params.wrn = warningType;
      }

      // subcd 파라미터: 없으면 전체
      if (subcd) {
        params.subcd = subcd;
      }

      const queryString = Object.entries(params)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const url = `${this.baseUrl}?${queryString}`;
      const timeDiff = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)); // 분 단위
      logger.debug(`기상특보 API 호출 (${timeDiff}분간): ${warningType || '전체'}`);
      
      // API 호출 URL 기록
      this.recordApiCall(url);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        logger.debug(`API 응답 상태: ${response.status}, 내용: ${errorText}`);
        
        if (response.status === 403) {
          throw new Error(`API 활용신청이 필요합니다. 기상청 API Hub(https://apihub.kma.go.kr)에서 활용신청을 먼저 해주세요. 응답: ${errorText}`);
        }
        
        throw new Error(`API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      
      // 응답 형식이 CSV 형태인지 확인
      if (!responseText.trim().startsWith('#START')) {
        logger.debug(`API 응답: ${responseText.substring(0, 200)}...`);
        throw new Error(`유효하지 않은 응답 형식: ${responseText.substring(0, 100)}`);
      }

      const data = this.parseCSVResponse(responseText);
      
      logger.debug(`${warningType || '전체'} 특보 ${data.length}개 조회 (${timeDiff}분간)`);
      return data;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`기상특보 조회 중 오류 (종류: ${warningType || '전체'}): ${error.message}`);
      } else {
        logger.error(`기상특보 조회 중 알 수 없는 오류 (종류: ${warningType || '전체'}):`, error);
      }
      throw error;
    }
  }

  private formatDateForAPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}`;
  }

  async fetchRegionData(): Promise<void> {
    try {
      // 기상특보와 동일한 기간(7일치)으로 지역 데이터 수집
      const periods = [
        { days: 7, name: '최근 7일' }
      ];

      const allRegions = new Map<string, string>();

      for (const period of periods) {
        try {
          const now = new Date();
          const startDate = new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000);
          
          const params = {
            tmfc1: this.formatDateForAPI(startDate),
            tmfc2: this.formatDateForAPI(now),
            authKey: this.authKey
          };
          
          const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
            
          const url = `${this.regionUrl}?${queryString}`;
          logger.debug(`특보구역 API 호출 (${period.name}): ${url}`);
          
          // API 호출 URL 기록
          this.recordApiCall(url);

          const response = await fetch(url);
          if (!response.ok) {
            const errorText = await response.text();
            logger.debug(`특보구역 API 호출 실패 (${period.name}): ${response.status} ${response.statusText} - ${errorText}`);
            continue; // 다음 기간으로 계속
          }

          const responseText = await response.text();
          
          if (!responseText.trim().startsWith('#START')) {
            logger.debug(`특보구역 API 응답 형식 오류 (${period.name}): ${responseText.substring(0, 100)}`);
            continue;
          }

          const regions = this.parseRegionCSVResponse(responseText);
          
          // 지역 데이터를 통합 맵에 추가
          regions.forEach(region => {
            if (region.REG_NAME && region.REG_NAME.trim() !== '') {
              allRegions.set(region.REG_ID, region.REG_NAME);
            }
          });

          logger.debug(`${period.name} 기간에서 ${regions.length}개 지역 데이터 수집`);
          
          // 짧은 지연 후 다음 요청
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          logger.debug(`특보구역 데이터 수집 중 오류 (${period.name}):`, error);
          continue;
        }
      }

      // 캐시에 저장
      this.regionCache.clear();
      allRegions.forEach((name, id) => {
        this.regionCache.set(id, name);
      });

      logger.info(`총 ${allRegions.size}개 특보구역 데이터 로드 완료`);
      
      // 수집된 지역 데이터 샘플 로그
      const sampleRegions = Array.from(allRegions.entries()).slice(0, 10);
      logger.debug('수집된 지역 데이터 샘플:', sampleRegions);
      
    } catch (error) {
      logger.error('특보구역 데이터 로드 중 오류:', error);
    }
  }

  private parseRegionCSVResponse(responseText: string): WeatherRegion[] {
    const lines = responseText.split('\n');
    const regions: WeatherRegion[] = [];

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '' || !line.includes(',')) {
        continue;
      }

      try {
        // CSV 형식: REG_ID, TM_ST, TM_ED, REG_SP, REG_UP, REG_KO, REG_NAME, =
        const fields = line.split(',').map(field => field.trim());
        
        if (fields.length >= 7) {
          const region: WeatherRegion = {
            REG_ID: fields[0],
            TM_ST: fields[1],
            TM_ED: fields[2],
            REG_SP: fields[3],
            REG_UP: fields[4],
            REG_KO: fields[5],
            REG_NAME: fields[6]
          };
          
          regions.push(region);
        }
      } catch (error) {
        logger.debug(`특보구역 CSV 라인 파싱 오류: ${line}`);
      }
    }

    return regions;
  }

  private parseCSVResponse(responseText: string): WeatherAlert[] {
    const lines = responseText.split('\n');
    const alerts: WeatherAlert[] = [];

    for (const line of lines) {
      // 주석이나 헤더 라인 건너뛰기
      if (line.startsWith('#') || line.trim() === '' || !line.includes(',')) {
        continue;
      }

      try {
        // API 응답 형식 (기본 11개 + 추가 필드 가능):
        // TM_FC, TM_EF, TM_IN, STN, REG_ID, WRN, LVL, CMD, GRD, CNT, RPT, [TM_ST, TM_ED, ...]
        const fields = line.split(',').map(field => field.trim());

        if (fields.length >= 11) {
          // TM_ED가 있는 경우 YYYYMMDDHHmm → ISO 형식 변환
          let tmEd = '';
          if (fields.length >= 13 && fields[12]) {
            // fields[12]가 TM_ED라고 가정 (실제 API 응답 구조에 따라 인덱스 조정 필요)
            const tmEdRaw = fields[12].trim();
            if (tmEdRaw && tmEdRaw.length === 12) {
              // YYYYMMDDHHmm → YYYY-MM-DDTHH:mm:00+09:00 (KST)
              const year = tmEdRaw.substring(0, 4);
              const month = tmEdRaw.substring(4, 6);
              const day = tmEdRaw.substring(6, 8);
              const hour = tmEdRaw.substring(8, 10);
              const minute = tmEdRaw.substring(10, 12);
              tmEd = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
            }
          }

          const alert: WeatherAlert = {
            TM_FC: fields[0],       // 발표시각
            TM_EF: fields[1],       // 발효시각
            TM_IN: fields[2],       // 입력시각
            STN: fields[3],         // 발표관서
            REG_ID: fields[4],      // 특보구역코드
            WRN: fields[5],         // 특보종류코드
            LVL: fields[6],         // 특보수준
            CMD: fields[7],         // 특보명령
            GRD: fields[8],         // 태풍경보시 등급
            CNT: fields[9],         // 작업순번
            RPT: fields[10],        // 특보 발송구분
            // 추가 필드 (있으면 파싱, 없으면 빈 문자열)
            TM_ST: fields.length >= 12 ? fields[11] : '',  // 시작시각
            TM_ED: tmEd,            // 종료시각 (ISO 형식 변환)
            REG_SP: fields.length >= 14 ? fields[13] : '', // 특성
            REG_UP: '',             // 상위 특보구역코드
            REG_KO: '',             // 특보구역명(약어)
            REG_UP_KO: this.getUpperRegionName(fields[4]),  // 상위 특보구역명
            REG_NAME: this.getRegionName(fields[4]), // 특보구역명
            STN_ID: fields[3],      // 발표관서 (STN과 동일)
            TM_SEQ: '',             // 발표번호
            MAN_FC: '',             // 예보관명
            MAN_IN: ''              // 입력자명
          };

          alerts.push(alert);
        }
      } catch (error) {
        logger.debug(`CSV 라인 파싱 오류: ${line}`);
      }
    }

    return alerts;
  }

  /**
   * 지역 코드의 상위 지역명을 반환합니다.
   * manualRegionMapping에 있는 실제 상위 지역을 찾을 때까지 재귀적으로 탐색합니다.
   * @param regId 지역 코드 (예: S1311200)
   * @returns 상위 지역명 (예: 남해동부앞바다)
   */
  private getUpperRegionName(regId: string): string {
    if (!regId || regId.length !== 8) {
      return '';
    }

    // Codex P1 피드백 반영: 먼저 현재 지역이 이미 광역시/도 단위인지 확인
    const currentName = this.getRegionName(regId);

    // 현재 지역이 실제 매핑이고 (fallback이 아니고)
    const isRealMapping = !currentName.startsWith('육상지역(') && !currentName.startsWith('해상지역(');

    // 광역시/도 단위면 자기 자신을 그룹으로 반환
    // endsWith로 정확히 체크 (예: "제주도", "흑산도" 같은 일반 지역 제외)
    // 주의: "앞바다"/"먼바다"는 여기서 체크하지 않음 (하위 지역도 "앞바다"로 끝날 수 있음)
    const isTopLevelGroup = currentName.endsWith('특별시') ||
                            currentName.endsWith('광역시') ||
                            currentName.endsWith('도') ||
                            currentName.endsWith('특별자치시') ||
                            currentName.endsWith('전해상') ||
                            // Codex P1 피드백 #2: 특수 최상위 지역 처리
                            currentName === '전국' ||
                            currentName === '전해상' ||
                            currentName.includes('연안바다') ||
                            currentName.includes('평수구역');

    if (isRealMapping && isTopLevelGroup) {
      return currentName;
    }

    // 지역 코드 계층 구조 분석
    // 예: S1311200 → S1311000 (상위 지역)
    //     S1311000 → S1310000
    //     S1310000 → S1300000
    //     S1300000 → S1000000

    const prefix = regId[0]; // L 또는 S
    const digits = regId.substring(1); // 7자리 숫자

    // 뒤에서부터 연속된 0의 개수를 세어 현재 레벨 파악
    let level = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] === '0') {
        level++;
      } else {
        break;
      }
    }

    // 최상위 레벨 (6개 이상의 0) 또는 매핑되지 않은 코드
    // Codex P1 피드백 #3: "기타" fallback 복원
    if (level >= 6) {
      return '기타';
    }

    // 상위 지역 코드 생성: 한 자리 더 0으로 만들기
    // 예: S1311200 (level 2) → S1311000 (level 3)
    //     S1311000 (level 3) → S1310000 (level 4)
    const nonZeroLength = 7 - level; // 0이 아닌 부분의 길이
    const parentDigits = digits.substring(0, nonZeroLength - 1) + '0'.repeat(level + 1);
    const parentRegId = prefix + parentDigits;

    // 상위 지역명 조회
    const parentName = this.getRegionName(parentRegId);

    // 상위 지역이 실제 매핑이고 (fallback이 아니고)
    const isParentRealMapping = !parentName.startsWith('육상지역(') && !parentName.startsWith('해상지역(');

    // 광역시/도 단위 또는 해상 그룹핑 단위면 반환
    const isParentTopLevel = parentName.endsWith('특별시') ||
                             parentName.endsWith('광역시') ||
                             parentName.endsWith('도') ||
                             parentName.endsWith('특별자치시') ||
                             parentName.endsWith('전해상') ||
                             // Codex P1 피드백 #4: 해상 중간 그룹핑 단위 추가
                             parentName.endsWith('앞바다') ||
                             parentName.endsWith('먼바다') ||
                             // Codex P1 피드백 #2: 특수 최상위 지역 처리
                             parentName === '전국' ||
                             parentName === '전해상' ||
                             parentName.includes('연안바다') ||
                             parentName.includes('평수구역');

    if (isParentRealMapping && isParentTopLevel) {
      return parentName;
    }

    // 아니면 계속 상위로 올라가서 광역시/도 단위를 찾음
    return this.getUpperRegionName(parentRegId);
  }

  private getRegionName(regId: string): string {
    // 먼저 캐시에서 찾기
    const cachedName = this.regionCache.get(regId);
    if (cachedName) {
      return cachedName;
    }

    // area_code.md 기반 완전한 지역 매핑 (모든 지역 코드 포함)
    const manualRegionMapping: Record<string, string> = {
      // === 육상지역 (L) ===
      // 전국
      'L1000000': '전국',
      
      // 경기도
      'L1010000': '경기도',
      'L1010200': '광명시',
      'L1010300': '과천시',
      'L1010400': '안산시',
      'L1010500': '시흥시',
      'L1010600': '부천시',
      'L1010700': '김포시',
      'L1010800': '인천광역시',
      'L1010900': '강화군',
      'L1011100': '동두천시',
      'L1011200': '연천군',
      'L1011300': '포천시',
      'L1011400': '가평군',
      'L1011500': '고양시',
      'L1011600': '양주시',
      'L1011700': '의정부시',
      'L1011800': '파주시',
      'L1011900': '수원시',
      'L1012000': '성남시',
      'L1012100': '안양시',
      'L1012200': '구리시',
      'L1012300': '남양주시',
      'L1012400': '오산시',
      'L1012500': '평택시',
      'L1012600': '군포시',
      'L1012700': '의왕시',
      'L1012800': '하남시',
      'L1012900': '용인시',
      'L1013000': '이천시',
      'L1013100': '안성시',
      'L1013200': '화성시',
      'L1013300': '여주시',
      'L1013400': '광주시',
      'L1013500': '양평군',
      'L1013600': '옹진군',
      'L1014000': '서해5도',
      'L1014100': '서해5도',
      
      // 강원도
      'L1020000': '강원도',
      'L1020110': '강릉시평지',
      'L1020210': '동해시평지',
      'L1020300': '태백시',
      'L1020410': '삼척시평지',
      'L1020510': '속초시평지',
      'L1020610': '고성군평지',
      'L1020710': '양양군평지',
      'L1020800': '영월군',
      'L1020910': '평창군평지',
      'L1021010': '정선군평지',
      'L1021100': '횡성군',
      'L1021200': '원주시',
      'L1021300': '철원군',
      'L1021400': '화천군',
      'L1021510': '홍천군평지',
      'L1021600': '춘천시',
      'L1021710': '양구군평지',
      'L1021810': '인제군평지',
      'L1025020': '강원북부산지',
      'L1026020': '강원중부산지',
      'L1027020': '강원남부산지',
      
      // 충청남도
      'L1030000': '충청남도',
      'L1030100': '대전광역시',
      'L1030200': '천안시',
      'L1030300': '공주시',
      'L1030400': '아산시',
      'L1030500': '논산시',
      'L1030600': '금산군',
      'L1030800': '부여군',
      'L1030900': '청양군',
      'L1031000': '예산군',
      'L1031100': '태안군',
      'L1031200': '당진시',
      'L1031300': '서산시',
      'L1031400': '보령시',
      'L1031500': '서천군',
      'L1031600': '홍성군',
      'L1031700': '계룡시',
      'L1031800': '세종특별자치시',
      
      // 충청북도
      'L1040000': '충청북도',
      'L1040100': '청주시',
      'L1040300': '보은군',
      'L1040400': '괴산군',
      'L1040600': '옥천군',
      'L1040700': '영동군',
      'L1040800': '충주시',
      'L1040900': '제천시',
      'L1041000': '진천군',
      'L1041100': '음성군',
      'L1041200': '단양군',
      'L1041300': '증평군',
      
      // 전라남도
      'L1050000': '전라남도',
      'L1050100': '광주광역시',
      'L1050200': '나주시',
      'L1050300': '담양군',
      'L1050400': '곡성군',
      'L1050500': '구례군',
      'L1050600': '장성군',
      'L1050700': '화순군',
      'L1050800': '고흥군',
      'L1050900': '보성군',
      'L1051000': '여수시',
      'L1051100': '광양시',
      'L1051200': '순천시',
      'L1051300': '장흥군',
      'L1051400': '강진군',
      'L1051500': '해남군',
      'L1051600': '완도군',
      'L1051700': '영암군',
      'L1051800': '무안군',
      'L1051900': '함평군',
      'L1052000': '영광군',
      'L1052100': '목포시',
      'L1052200': '신안군(흑산면제외)',
      'L1052300': '진도군',
      'L1052400': '흑산도.홍도',
      'L1052500': '흑산도.홍도',
      'L1052600': '거문도.초도',
      
      // 전북자치도
      'L1060000': '전북자치도',
      'L1060100': '고창군',
      'L1060200': '부안군',
      'L1060300': '군산시',
      'L1060400': '김제시',
      'L1060500': '완주군',
      'L1060600': '진안군',
      'L1060700': '무주군',
      'L1060800': '장수군',
      'L1060900': '임실군',
      'L1061000': '순창군',
      'L1061100': '익산시',
      'L1061200': '정읍시',
      'L1061300': '전주시',
      'L1061400': '남원시',
      
      // 경상북도
      'L1070000': '경상북도',
      'L1070100': '대구광역시',
      'L1070200': '군위군',
      'L1070300': '구미시',
      'L1070400': '영천시',
      'L1070500': '경산시',
      'L1070700': '청도군',
      'L1070800': '고령군',
      'L1070900': '성주군',
      'L1071000': '칠곡군',
      'L1071100': '김천시',
      'L1071200': '상주시',
      'L1071300': '문경시',
      'L1071400': '예천군',
      'L1071500': '안동시',
      'L1071600': '영주시',
      'L1071700': '의성군',
      'L1071800': '청송군',
      'L1071910': '영양군평지',
      'L1072010': '봉화군평지',
      'L1072100': '울릉도.독도',
      'L1072200': '영덕군',
      'L1072310': '울진군평지',
      'L1072400': '포항시',
      'L1072500': '경주시',
      'L1075020': '경북북동산지',
      
      // 경상남도
      'L1080000': '경상남도',
      'L1080500': '양산시',
      'L1080600': '창원시',
      'L1080900': '김해시',
      'L1081000': '밀양시',
      'L1081100': '의령군',
      'L1081200': '함안군',
      'L1081300': '창녕군',
      'L1081400': '진주시',
      'L1081500': '하동군',
      'L1081600': '산청군',
      'L1081700': '함양군',
      'L1081800': '거창군',
      'L1081900': '합천군',
      'L1082000': '통영시',
      'L1082100': '사천시',
      'L1082200': '거제시',
      'L1082300': '고성군',
      'L1082400': '남해군',
      'L1082500': '부산동부',
      'L1082600': '부산중부',
      'L1082700': '부산서부',
      'L1082800': '울산동부',
      'L1082900': '울산서부',
      
      // 제주도
      'L5010000': '제주도',  // 제주특별자치도 (상위 코드)
      'L1090000': '제주도',
      'L1090500': '제주도산지',
      'L1090600': '제주도서부',
      'L1090700': '제주도북부',
      'L1090800': '제주도동부',
      'L1090900': '제주도남부',
      'L1091000': '추자도',
      'L1091100': '제주도북부중산간',
      'L1091200': '제주도남부중산간',
      
      // 서울특별시
      'L1100000': '서울특별시',
      'L1100100': '서울동남권',
      'L1100200': '서울동북권',
      'L1100300': '서울서남권',
      'L1100400': '서울서북권',
      
      // 광역시/특별시/자치시
      'L1110000': '인천광역시',
      'L1120000': '대전광역시',
      'L1130000': '광주광역시',
      'L1140000': '대구광역시',
      'L1150000': '부산광역시',
      'L1160000': '울산광역시',
      'L1170000': '세종특별자치시',
      'L1600000': '울릉도.독도',
      
      // === 해상지역 (S) ===
      // 전해상
      'S1000000': '전해상',
      
      // 동해전해상
      'S1100000': '동해전해상',
      
      // 동해남부전해상
      'S1130000': '동해남부전해상',
      'S1131000': '동해남부앞바다',
      'S1131100': '울산앞바다',
      'S1131200': '경북남부앞바다',
      'S1131300': '경북북부앞바다',
      'S1132110': '동해남부남쪽안쪽먼바다',
      'S1132120': '동해남부남쪽바깥먼바다',
      'S1132210': '동해남부북쪽안쪽먼바다',
      'S1132220': '동해남부북쪽바깥먼바다',
      
      // 동해중부전해상
      'S1150000': '동해중부전해상',
      'S1151000': '동해중부앞바다',
      'S1151100': '강원북부앞바다',
      'S1151200': '강원중부앞바다',
      'S1151300': '강원남부앞바다',
      'S1152010': '동해중부안쪽먼바다',
      'S1152020': '동해중부바깥먼바다',
      
      // 서해전해상
      'S1200000': '서해전해상',
      
      // 서해남부전해상
      'S1230000': '서해남부전해상',
      'S1231000': '서해남부앞바다',
      'S1231100': '전북북부앞바다',
      'S1231200': '전북남부앞바다',
      'S1231300': '전남북부서해앞바다',
      'S1231400': '전남중부서해앞바다',
      'S1231500': '전남남부서해앞바다',
      'S1232110': '서해남부북쪽안쪽먼바다',
      'S1232120': '서해남부북쪽바깥먼바다',
      'S1232210': '서해남부남쪽안쪽먼바다',
      'S1232220': '서해남부남쪽바깥먼바다',
      
      // 서해중부전해상
      'S1250000': '서해중부전해상',
      'S1251000': '서해중부앞바다',
      'S1251100': '인천·경기북부앞바다',
      'S1251200': '인천·경기남부앞바다',
      'S1251300': '충남북부앞바다',
      'S1251400': '충남남부앞바다',
      'S1252010': '서해중부안쪽먼바다',
      'S1252020': '서해중부바깥먼바다',
      
      // 남해전해상
      'S1300000': '남해전해상',
      
      // 남해동부전해상
      'S1310000': '남해동부전해상',
      'S1311000': '남해동부앞바다',
      'S1311100': '부산앞바다',
      'S1311200': '경남서부남해앞바다',
      'S1311300': '경남중부남해앞바다',
      'S1311400': '거제시동부앞바다',
      'S1312010': '남해동부안쪽먼바다',
      'S1312020': '남해동부바깥먼바다',
      
      // 남해서부전해상
      'S1320000': '남해서부전해상',
      'S1321000': '남해서부앞바다',
      'S1321100': '전남서부남해앞바다',
      'S1321200': '전남동부남해앞바다',
      'S1322100': '남해서부서쪽먼바다',
      'S1322200': '남해서부동쪽먼바다',
      
      // 제주도해상
      'S1323000': '제주도앞바다',
      'S1323100': '제주도북부앞바다',
      'S1323200': '제주도동부앞바다',
      'S1323300': '제주도남부앞바다',
      'S1323400': '제주도서부앞바다',
      'S1324020': '제주도남쪽바깥먼바다',
      'S1324110': '제주도남동쪽안쪽먼바다',
      'S1324210': '제주도남서쪽안쪽먼바다',
      'S1330000': '제주도전해상',
      
      // 연안바다/평수구역 (일부 주요지역만)
      'S2000000': '연안바다/평수구역'
    };
    
    // 수동 매핑에서 찾기
    if (manualRegionMapping[regId]) {
      return manualRegionMapping[regId];
    }
    
    // 패턴 기반 기본 처리
    if (regId.startsWith('L')) {
      return `육상지역(${regId})`;
    }
    
    if (regId.startsWith('S')) {
      return `해상지역(${regId})`;
    }
    
    return regId;
  }

  /**
   * AlertCache 상태를 조회합니다.
   * @returns 캐시 상태 정보
   */
  getCacheStatus(): { count: number; lastUpdated: Date; isInitialized: boolean; lastCheckTime: Date | null } {
    const cacheStatus = this.alertCache.getCacheStatus();
    return {
      ...cacheStatus,
      isInitialized: this.isInitialized,
      lastCheckTime: this.lastCheckTime
    };
  }

  /**
   * AlertCache를 초기화합니다.
   */
  clearAlertCache(): void {
    this.alertCache.clearCache();
    this.isInitialized = false;
    this.lastCheckTime = null;
    logger.info('WeatherService AlertCache 초기화 완료');
  }

  /**
   * 캐시된 특보들을 조회합니다.
   * @returns 캐시된 특보 배열
   */
  getCachedAlerts() {
    return this.alertCache.getAllCachedAlerts();
  }

  /**
   * status.log 파일을 초기화합니다.
   */
  private initializeStatusLog(): void {
    try {
      const logFilePath = path.join(process.cwd(), 'status.log');
      const startMessage = `==== WeatherService 시작 ====\n시작 시간: ${new Date().toISOString()}\n\n`;
      fs.writeFileSync(logFilePath, startMessage, 'utf8');
      logger.info('status.log 파일이 초기화되었습니다');
    } catch (error) {
      logger.error('status.log 파일 초기화 중 오류:', error);
    }
  }

  /**
   * 주기적 로그 저장 여부를 판단합니다 (10분마다).
   * @returns 로그를 저장해야 하면 true, 아니면 false
   */
  private shouldLogStatus(): boolean {
    if (!this.lastLogTime) {
      return true;
    }
    
    const now = new Date();
    const timeDiff = now.getTime() - this.lastLogTime.getTime();
    const tenMinutes = 10 * 60 * 1000; // 10분을 밀리초로
    
    return timeDiff >= tenMinutes;
  }

  /**
   * API 호출 URL을 기록합니다.
   * @param url 호출된 API URL
   */
  private recordApiCall(url: string): void {
    // 최근 10개의 API 호출만 유지
    this.lastApiCalls.push(url);
    if (this.lastApiCalls.length > 10) {
      this.lastApiCalls.shift();
    }
  }

  /**
   * AlertCache의 현재 상태를 status.log 파일에 저장합니다.
   * @param event 이벤트 설명 (예: "최초_로드", "재호출_후_갱신")
   */
  private saveAlertCacheToStatusLog(event: string): void {
    try {
      const timestamp = new Date().toISOString();
      const cachedAlerts = this.alertCache.getAllCachedAlerts();
      
      const logData = {
        timestamp,
        event,
        alertCount: cachedAlerts.length,
        isInitialized: this.isInitialized,
        lastCheckTime: this.lastCheckTime?.toISOString() || null,
        apiCalls: [...this.lastApiCalls], // 최근 API 호출 URL들
        cachedAlerts: cachedAlerts.map(alert => ({
          key: alert.key,
          regionId: alert.regionId,
          regionName: alert.regionName,
          warningType: alert.warningType,
          level: alert.level,
          command: alert.command,
          announcedAt: alert.announcedAt,
          effectiveAt: alert.effectiveAt,
          lastUpdated: alert.lastUpdated
        }))
      };

      const logEntry = `\n======== ${event} ========\n${JSON.stringify(logData, null, 2)}\n`;
      
      // 프로젝트 루트 디렉토리의 status.log 파일에 추가
      const logFilePath = path.join(process.cwd(), 'status.log');
      fs.appendFileSync(logFilePath, logEntry, 'utf8');
      
      // 마지막 로그 시간 업데이트
      this.lastLogTime = new Date();
      
      logger.info(`AlertCache 상태가 status.log에 저장됨 (이벤트: ${event}, 특보 수: ${cachedAlerts.length}개)`);
    } catch (error) {
      logger.error('status.log 파일 저장 중 오류:', error);
    }
  }

  /**
   * 한국 표준시(KST, UTC+9) 기준 현재 시간 반환
   * 서버가 UTC나 다른 시간대에서 실행되더라도 KST 시간을 정확히 계산
   */
  private getKSTNow(): Date {
    const now = new Date();
    // 현재 시간을 UTC 기준으로 변환
    const utcMillis = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    // UTC에 9시간(KST 오프셋) 추가
    const kstMillis = utcMillis + (9 * 60 * 60 * 1000);
    return new Date(kstMillis);
  }

  /**
   * 하위 지역 코드를 광역시도 코드로 변환
   * @param regionId 지역 코드 (예: L1100510)
   * @returns 광역시도 코드 (예: L1100000)
   */
  private getUpperRegionCode(regionId: string): string {
    // 이미 gridCoordinates에 있으면 그대로 반환
    if (this.gridCoordinates.has(regionId)) {
      return regionId;
    }

    // L로 시작하는 8자리 이상 코드면 광역시도 코드로 변환
    // 예: L1100510 → L1100000, L1010100 → L1010000
    if (regionId.startsWith('L') && regionId.length >= 8) {
      const upperCode = regionId.substring(0, 5) + '000';
      if (this.gridCoordinates.has(upperCode)) {
        logger.debug(`지역 코드 ${regionId}를 광역시도 코드 ${upperCode}로 매핑`);
        return upperCode;
      }
    }

    // 찾지 못하면 원본 반환
    return regionId;
  }

  /**
   * 초단기예보 데이터 조회
   * @param regionId 지역 코드 (특보구역 코드)
   * @returns 날씨 예보 데이터
   */
  async getWeatherForecast(regionId: string): Promise<WeatherForecast | null> {
    try {
      // 1. 지역 코드를 광역시도 코드로 변환 (필요한 경우)
      const mappedRegionId = this.getUpperRegionCode(regionId);

      // 2. 격자 좌표로 변환
      const gridInfo = this.gridCoordinates.get(mappedRegionId);
      if (!gridInfo) {
        logger.warn(`지역 코드 ${regionId} (매핑: ${mappedRegionId})에 대한 격자 좌표를 찾을 수 없습니다`);
        return null;
      }

      // 3. KST 기준 현재 시각으로 API 파라미터 생성
      const now = this.getKSTNow();
      const { baseTime, needsPreviousDay } = this.getBaseTime(now); // HHmm (정시 기준, 30분 이후는 다음 시간)

      // 자정 이전 시간대(00:00~00:30)에서 23:30으로 롤백되면 전날 날짜 사용
      const baseDateTime = needsPreviousDay ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
      const baseDate = this.formatDate(baseDateTime); // YYYYMMDD

      // 3. API 호출
      const params = new URLSearchParams({
        authKey: this.authKey,
        base_date: baseDate,
        base_time: baseTime,
        nx: gridInfo.nx.toString(),
        ny: gridInfo.ny.toString(),
        numOfRows: '100',
        pageNo: '1',
        dataType: 'JSON'
      });

      const url = `${this.forecastUrl}?${params.toString()}`;
      logger.debug(`초단기예보 API 호출: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status} ${response.statusText}`);
      }

      const jsonData = await response.json();

      // 4. JSON 파싱 및 데이터 집계
      const forecast = this.parseForecastData(jsonData, regionId, gridInfo.name);

      if (!forecast) {
        logger.warn(`지역 ${gridInfo.name}(${regionId})의 예보 데이터를 파싱할 수 없습니다`);
        return null;
      }

      logger.info(`지역 ${gridInfo.name}(${regionId})의 날씨 예보 조회 성공`);
      return forecast;
    } catch (error) {
      logger.error(`날씨 예보 조회 중 오류 (지역: ${regionId}):`, error);
      return null;
    }
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
  private getBaseTime(date: Date): { baseTime: string; needsPreviousDay: boolean } {
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
   * JSON 응답 데이터를 WeatherForecast 객체로 파싱
   */
  private parseForecastData(jsonData: any, regionId: string, regionName: string): WeatherForecast | null {
    try {
      // API 응답 검증
      if (!jsonData || !jsonData.response) {
        logger.warn('API 응답이 비어있습니다');
        return null;
      }

      const response = jsonData.response;

      // 헤더 검증
      if (response.header?.resultCode !== '00') {
        logger.warn(`API 오류: ${response.header?.resultMsg || 'Unknown error'}`);
        return null;
      }

      // 데이터 추출
      const items = response.body?.items?.item;
      if (!items || !Array.isArray(items) || items.length === 0) {
        logger.warn('예보 데이터가 비어있습니다');
        return null;
      }

      // 1단계: 시간대별로 그룹화
      const timeSlices = new Map<string, any[]>();
      for (const item of items) {
        if (item.fcstDate && item.fcstTime) {
          const timeKey = item.fcstDate + item.fcstTime;
          if (!timeSlices.has(timeKey)) {
            timeSlices.set(timeKey, []);
          }
          timeSlices.get(timeKey)!.push(item);
        }
      }

      if (timeSlices.size === 0) {
        logger.warn('유효한 예보 시간대가 없습니다');
        return null;
      }

      // 2단계: 가장 가까운 미래 시간대 선택
      const now = new Date();
      const sortedTimes = Array.from(timeSlices.keys()).sort();
      let selectedTime = sortedTimes[0]; // 기본값: 첫 번째 시간대

      for (const timeKey of sortedTimes) {
        const forecastTime = this.parseForecastTime(timeKey);
        if (forecastTime >= now) {
          selectedTime = timeKey;
          break;
        }
      }

      logger.debug(`선택된 예보 시간대: ${selectedTime} (총 ${timeSlices.size}개 시간대 중)`);

      // 3단계: 선택된 시간대의 데이터만 사용
      const selectedItems = timeSlices.get(selectedTime) || [];
      const dataMap: Record<string, string> = {};

      for (const item of selectedItems) {
        if (item.category && item.fcstValue !== undefined) {
          dataMap[item.category] = item.fcstValue;
        }
      }

      const forecastDateTime = selectedTime;

      // WeatherForecast 객체 생성
      const forecast: WeatherForecast = {
        regionId,
        regionName,
        forecastTime: this.parseForecastTime(forecastDateTime),
        temperature: this.parseNumber(dataMap['T1H']),
        humidity: this.parseNumber(dataMap['REH']),
        skyCondition: this.parseNumber(dataMap['SKY']),
        precipitationType: this.parseNumber(dataMap['PTY']),
        precipitation: this.parseNumber(dataMap['RN1']),
        windSpeed: this.parseNumber(dataMap['WSD']),
        windDirection: this.parseNumber(dataMap['VEC']),
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
    } catch (error) {
      logger.error('JSON 데이터 파싱 중 오류:', error);
      return null;
    }
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