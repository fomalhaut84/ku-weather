/**
 * 기상특보 데이터 타입 정의
 */

export interface WeatherAlert {
  id: string;
  regionId: string;
  regionName: string;
  upperRegion: string | null;
  warningType: string;
  warningLevel: string;
  command: string;
  announcedAt: string;
  effectiveAt: string;
  endTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertsResponse {
  success: boolean;
  count: number;
  filters?: {
    regionId?: string | null;
    warningType?: string | null;
    warningLevel?: string | null;
    upperRegion?: string | null;
  };
  data: WeatherAlert[];
  error?: string;
}

// 특보 종류별 이름 매핑
export const WARNING_TYPE_NAMES: Record<string, string> = {
  'W': '강풍',
  'R': '호우',
  'C': '한파',
  'D': '건조',
  'O': '해일',
  'N': '지진해일',
  'V': '풍랑',
  'T': '태풍',
  'S': '대설',
  'Y': '황사',
  'H': '폭염',
  'F': '안개'
};

// 특보 수준별 이름 매핑
export const WARNING_LEVEL_NAMES: Record<string, string> = {
  '1': '예비특보',
  '2': '주의보',
  '3': '경보'
};

// 특보 종류별 이모지
export const WARNING_TYPE_EMOJI: Record<string, string> = {
  'W': '💨',
  'R': '🌧️',
  'C': '🥶',
  'D': '🔥',
  'O': '🌊',
  'N': '🌊',
  'V': '🌊',
  'T': '🌀',
  'S': '❄️',
  'Y': '🟡',
  'H': '☀️',
  'F': '🌫️'
};

// 특보 수준별 색상 클래스
export const WARNING_LEVEL_COLORS: Record<string, string> = {
  '1': 'bg-yellow-100 border-yellow-300 text-yellow-800',
  '2': 'bg-orange-100 border-orange-300 text-orange-800',
  '3': 'bg-red-100 border-red-300 text-red-800'
};
