/**
 * API 응답 공유 타입
 */

/** 표준 API 응답 envelope */
export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly count?: number;
  readonly message?: string;
  readonly error?: string;
  readonly meta?: PaginationMeta;
}

/** 페이지네이션 메타 */
export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/** 특보 필터 (쿼리 파라미터) */
export interface AlertFilters {
  readonly regionId?: string;
  readonly warningType?: string;
  readonly warningLevel?: string;
  readonly upperRegion?: string;
}

/** 특보 이력 필터 */
export interface AlertHistoryFilters extends AlertFilters {
  readonly startDate: string;
  readonly endDate: string;
  readonly changeType?: string;
}

/** 통계 파라미터 */
export interface StatisticsParams {
  readonly startDate: string;
  readonly endDate: string;
  readonly groupBy: 'region' | 'warningType' | 'level';
}
