export interface WeatherAlert {
  REG_ID: string;        // 특보구역코드
  TM_ST: string;         // 시작시각(년월일시분,KST)
  TM_ED: string;         // 종료시각(년월일시분,KST)
  REG_SP: string;        // 특성
  REG_UP: string;        // 상위 특보구역코드
  REG_KO: string;        // 특보구역명(약어)
  REG_NAME: string;      // 특보구역명
  TM_FC: string;         // 발표시각(KST)
  TM_EF: string;         // 발효시각(KST)
  TM_IN: string;         // 입력시각(KST)
  STN: string;           // 발표관서
  WRN: string;           // 특보종류코드
  LVL: string;           // 특보수준
  CMD: string;           // 특보명령
  GRD: string;           // 태풍경보시 등급
  CNT: string;           // 작업상태
  RPT: string;           // 통보문 발송구분
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