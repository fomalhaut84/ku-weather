/**
 * 구독 관리 공유 타입
 */

import type { NotificationPlatform } from './notification';

/** 사용자 구독 */
export interface UserSubscription {
  readonly platform: NotificationPlatform | string;
  readonly userId: string;
  readonly targetRegions: readonly string[];
  readonly warningTypes: readonly string[];
  readonly enabled: boolean;
  readonly displayName: string;
  readonly regionNames?: readonly string[];
  readonly warningTypeNames?: readonly string[];
  readonly platformDisplayName?: string;
  readonly preferences?: SubscriptionPreferences;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** 구독 설정 */
export interface SubscriptionPreferences {
  readonly minLevel?: string;
  readonly quietHours?: {
    readonly start: string;
    readonly end: string;
  } | null;
  readonly batchMode?: boolean;
}

/** 지역 정보 */
export interface Region {
  readonly code: string;
  readonly name: string;
  readonly aliases: readonly string[];
}

/** 특보 종류 정보 */
export interface WarningType {
  readonly code: string;
  readonly name: string;
  readonly aliases: readonly string[];
}
