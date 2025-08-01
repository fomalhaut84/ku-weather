import { WeatherAlert, WeatherApiParams, WeatherWarningType, WeatherRegion } from '../types/weather';
import { logger } from '../utils/logger';

export class WeatherService {
  private readonly baseUrl = 'https://apihub.kma.go.kr/api/typ01/url/wrn_met_data.php';
  private readonly regionUrl = 'https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php';
  private readonly authKey: string;
  private regionCache: Map<string, string> = new Map();

  constructor(authKey: string) {
    this.authKey = authKey;
    if (!this.authKey) {
      throw new Error('WEATHER_API_KEY가 제공되지 않았습니다');
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
          targetRegIds.some(regId => 
            alert.REG_NAME.includes(regId) || alert.REG_KO.includes(regId)
          )
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
      // 특보구역 조회 - 현재부터 과거 30일까지의 기간으로 조회하여 모든 지역 코드 수집
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const params = {
        tmfc1: this.formatDateForAPI(thirtyDaysAgo),
        tmfc2: this.formatDateForAPI(now),
        authKey: this.authKey
      };
      
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
        
      const url = `${this.regionUrl}?${queryString}`;
      logger.debug(`특보구역 API 호출: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`특보구역 API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
        return;
      }

      const responseText = await response.text();
      
      // 응답 내용 확인을 위한 디버그 로그
      logger.debug(`특보구역 API 응답 샘플:\n${responseText.split('\n').slice(0, 5).join('\n')}`);
      
      if (!responseText.trim().startsWith('#START')) {
        logger.error(`특보구역 API 응답 형식 오류: ${responseText.substring(0, 100)}`);
        return;
      }

      const regions = this.parseRegionCSVResponse(responseText);
      
      // 지역 데이터를 캐시에 저장
      this.regionCache.clear();
      regions.forEach(region => {
        this.regionCache.set(region.REG_ID, region.REG_NAME);
      });

      logger.info(`${regions.length}개 특보구역 데이터 로드 완료`);
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
        // 실제 API 응답 형식: TM_FC, TM_EF, TM_IN, STN, REG_ID, WRN, LVL, CMD, GRD, CNT, RPT, =
        const fields = line.split(',').map(field => field.trim());
        
        if (fields.length >= 11) {
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
            // API에서 제공되지 않는 필드들은 기본값으로 설정
            TM_ST: '',              // 시작시각
            TM_ED: '',              // 종료시각
            REG_SP: '',             // 특성
            REG_UP: '',             // 상위 특보구역코드
            REG_KO: '',             // 특보구역명(약어)
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

  private getRegionName(regId: string): string {
    // 먼저 캐시에서 찾기
    const cachedName = this.regionCache.get(regId);
    if (cachedName) {
      return cachedName;
    }
    
    // 수동 매핑으로 주요 지역 코드 처리
    const manualRegionMapping: Record<string, string> = {
      // 서울
      'L1020110': '서울강북',
      'L1020210': '서울강남', 
      'L1020300': '서울',
      'L1020410': '서울강서',
      'L1020710': '서울강동',
      'L1027020': '서울동작',
      
      // 경기도
      'L1072200': '경기남부',
      'L1072310': '경기북부',
      
      // 인천
      'L1082200': '인천',
      'L1082400': '인천강화',
      'L1082500': '인천옹진',
      'L1082800': '인천연수',
      
      // 제주
      'L1090700': '제주도',
      
      // 해상지역 매핑
      'S1232120': '서해남부먼바다',
      'S1232210': '서해남부근해',
      'S1232220': '서해남부앞바다',
      'S1312020': '남해서부근해', 
      'S1323200': '서해중부근해',
      'S1323300': '서해중부먼바다',
      'S1323400': '서해중부앞바다',
      'S1324020': '서해북부근해',
      'S1324110': '서해북부먼바다',
      'S1324210': '서해북부앞바다'
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
}