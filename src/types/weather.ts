/**
 * 기상특보 핵심 데이터 구조
 * 두 API(wrn_met_data, wrn_now_data_new)의 공통 필드들로 구성
 */
export interface WeatherAlert {
  REG_ID: string;        // 특보구역코드 (필수)
  REG_UP: string;        // 상위 특보구역코드 (REG_ID로부터 도출 가능)
  REG_KO: string;        // 특보구역명(약어) (REG_ID로부터 도출 가능)  
  REG_UP_KO: string;     // 상위 특보구역명 (REG_ID로부터 도출 가능)
  REG_NAME: string;      // 특보구역명 (REG_ID로부터 도출)
  TM_FC: string;         // 발표시각(KST) (필수)
  TM_EF: string;         // 발효시각(KST) (필수)
  TM_IN: string;         // 입력시각(KST)
  STN: string;           // 발표관서
  WRN: string;           // 특보종류코드 (필수)
  LVL: string;           // 특보수준 (필수)
  CMD: string;           // 특보명령 (필수)
  GRD: string;           // 태풍경보시 등급
  CNT: string;           // 작업순번
  RPT: string;           // 특보 발송구분
  TM_ST: string;         // 시작시각(년월일시분,KST)
  TM_ED: string;         // 종료시각(년월일시분,KST)
  REG_SP: string;        // 특성
  STN_ID: string;        // 발표관서
  TM_SEQ: string;        // 발표번호
  MAN_FC: string;        // 예보관명
  MAN_IN: string;        // 입력자명
}

export type WeatherWarningType = 'W' | 'R' | 'C' | 'D' | 'O' | 'N' | 'V' | 'T' | 'S' | 'Y' | 'H' | 'F';

export const WEATHER_WARNING_TYPES: Record<WeatherWarningType, string> = {
  W: '강풍',
  R: '호우',
  C: '한파',
  D: '건조',
  O: '해일',
  N: '지진해일',
  V: '풍랑',
  T: '태풍',
  S: '대설',
  Y: '황사',
  H: '폭염',
  F: '안개'
};

export interface WeatherApiParams {
  wrn?: WeatherWarningType;  // 특보종류 (W:강풍, R:호우, C:한파, D:건조, O:해일, N:지진해일, V:풍랑, T:태풍, S:대설, Y:황사, H:폭염, F:안개, 없으면 전체)
  reg?: string;              // 특보구역 (없으면 전체)
  tmfc1?: string;            // 발표시간 시작 (년월일시분 KST)
  tmfc2?: string;            // 발표시간 종료 (년월일시분 KST)
  subcd?: string;            // 날씨해설 부제목코드 (11:초단기, 12:단기, 13:중기, 99:직접입력, 없으면 전체)
  disp?: number;             // 표출단계 (0:기본, 1:+특보내용, 2:+입력자)
  help?: number;             // 도움말 (1:도움말 정보 표시)
  authKey: string;           // 발급된 API 인증키
}

export interface WeatherRegion {
  REG_ID: string;    // 특보구역코드
  TM_ST: string;     // 시작시각(년월일시분,KST)
  TM_ED: string;     // 종료시각(년월일시분,KST)
  REG_SP: string;    // 특성
  REG_UP: string;    // 상위 특보구역코드
  REG_KO: string;    // 특보구역명(약어)
  REG_NAME: string;  // 특보구역명
}


/**
 * 특보 변동 감지를 위한 타입 정의
 */

/**
 * 캐시된 특보 데이터
 * 변동 감지를 위해 간소화된 특보 정보를 저장합니다.
 */
export interface CachedAlert {
  /** 고유 식별자 (지역코드+특보종류+수준+명령 조합) */
  key: string;
  /** 지역코드 (REG_ID) */
  regionId: string;
  /** 지역명 (REG_NAME) */
  regionName: string;
  /** 특보종류 (WRN) */
  warningType: string;
  /** 특보수준 (LVL) */
  level: string;
  /** 특보명령 (CMD) */
  command: string;
  /** 발표시각 (TM_FC) */
  announcedAt: string;
  /** 발효시각 (TM_EF) */
  effectiveAt: string;
  /** 마지막 업데이트 시각 (ISO string) */
  lastUpdated: string;
}

/**
 * 특보 변동 정보
 * 이전 상태와 현재 상태의 비교 결과를 나타냅니다.
 */
export interface AlertChange {
  /** 변동 유형 */
  type: AlertChangeType;
  /** 현재 특보 (신규/변경/수준변경 시) */
  current?: CachedAlert;
  /** 이전 특보 (해제/변경 시) */
  previous?: CachedAlert;
  /** 변동 설명 (사람이 읽기 쉬운 형태) */
  description: string;
}

/**
 * 특보 변동 유형
 */
export type AlertChangeType = 
  /** 신규 발표: 이전에 없던 특보가 새로 발표됨 */
  | 'NEW'
  /** 해제: 기존 특보가 해제됨 */         
  | 'RESOLVED'
  /** 수준 상향: 주의보 → 경보 등 수준이 올라감 */    
  | 'LEVEL_UP'
  /** 수준 하향: 경보 → 주의보 등 수준이 내려감 */    
  | 'LEVEL_DOWN'
  /** 시간 연장: 발효시각이 변경됨 */
  | 'TIME_EXTENDED'
  /** 내용 변경: 동일 수준에서 내용이 변경됨 */  
  | 'MODIFIED';