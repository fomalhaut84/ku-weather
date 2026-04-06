/**
 * 알림 시스템 공유 타입
 */

/** 알림 플랫폼 */
export type NotificationPlatform = 'slack' | 'telegram' | 'discord' | 'email';

/** 알림 전송 결과 */
export interface NotificationResult {
  readonly platform: NotificationPlatform;
  readonly success: boolean;
  readonly error?: string;
  readonly responseTimeMs?: number;
}

/** 플랫폼별 통계 */
export interface PlatformStats {
  readonly totalSent: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly averageResponseTimeMs: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/** Circuit Breaker 상태 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
