import { WeatherAlert, AlertChange } from '../../types/weather';
import { UserSubscription, SubscriptionNotificationResult } from './SubscriptionManager';

/**
 * 알림 전송 결과
 */
export interface NotificationResult {
  platform: string;
  success: boolean;
  error?: string;
  responseTime?: number;
}

/**
 * 알림 서비스 공통 인터페이스
 * 
 * 모든 알림 플랫폼 (Slack, Telegram, Discord, Email)이 구현해야 하는 공통 메서드
 */
export interface NotificationService {
  /**
   * 플랫폼 이름 (예: 'slack', 'telegram', 'discord', 'email')
   */
  readonly platformName: string;

  /**
   * 설정 검증
   * @returns 설정이 유효한지 여부
   */
  validateConfig(): boolean;

  /**
   * 단일 날씨 특보 알림 전송 (기존 방식 - 전역 전송)
   * @param alert 특보 정보
   */
  sendAlert(alert: WeatherAlert): Promise<NotificationResult>;

  /**
   * 특보 변동 알림 전송 (기존 방식 - 전역 전송)
   * @param change 변동 정보
   */
  sendAlertChange(change: AlertChange): Promise<NotificationResult>;

  /**
   * 다중 특보 변동 알림 전송 (기존 방식 - 전역 전송)
   * @param changes 변동 정보 배열
   */
  sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]>;

  /**
   * 건강 상태 확인 (연결 테스트)
   * @returns 플랫폼과의 연결 상태
   */
  healthCheck(): Promise<boolean>;

  // ========== 새로운 구독 기반 메서드들 ==========

  /**
   * 구독 기반 특보 알림 전송 (개별 사용자별)
   * @param alert 특보 정보
   * @param subscriptions 해당 특보에 관심있는 구독자 목록
   */
  sendAlertToSubscriptions?(alert: WeatherAlert, subscriptions: UserSubscription[]): Promise<SubscriptionNotificationResult[]>;

  /**
   * 구독 기반 변동 알림 전송 (개별 사용자별)
   * @param change 변동 정보  
   * @param subscriptions 해당 변동에 관심있는 구독자 목록
   */
  sendAlertChangeToSubscriptions?(change: AlertChange, subscriptions: UserSubscription[]): Promise<SubscriptionNotificationResult[]>;

  /**
   * 구독 기반 다중 변동 알림 전송 (개별 사용자별)
   * @param changes 변동 정보 배열
   * @param subscriptionsByChange 각 변동별 관심있는 구독자 목록
   */
  sendAlertChangesToSubscriptions?(changes: AlertChange[], subscriptionsByChange: UserSubscription[][]): Promise<SubscriptionNotificationResult[]>;

  /**
   * 개별 사용자에게 직접 메시지 전송 (플랫폼이 지원하는 경우)
   * @param userId 플랫폼별 사용자 ID
   * @param message 전송할 메시지 내용
   * @param options 추가 옵션 (플랫폼별)
   */
  sendDirectMessage?(userId: string, message: string, options?: Record<string, unknown>): Promise<NotificationResult>;
}

/**
 * 플랫폼별 설정 인터페이스
 */
export interface PlatformConfig {
  enabled: boolean;
  targetRegions?: string[]; // 플랫폼별 모니터링 대상 지역 (없으면 전역 설정 사용)
  [key: string]: unknown;
}

/**
 * Slack 플랫폼 설정
 */
export interface SlackConfig extends PlatformConfig {
  webhookUrl: string;
  batchMode?: boolean;
}

/**
 * Telegram 플랫폼 설정
 */
export interface TelegramConfig extends PlatformConfig {
  botToken: string;
  /**
   * @deprecated 단일 chatId 사용은 deprecated됩니다. 구독 시스템을 사용하세요.
   * 하위 호환성을 위해 유지되며, 설정 시 자동으로 구독으로 전환됩니다.
   */
  chatId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  nodeEnv?: string;
}

/**
 * Discord 플랫폼 설정  
 */
export interface DiscordConfig extends PlatformConfig {
  webhookUrl: string;
  mentions?: string[];
}

/**
 * Email 플랫폼 설정
 */
export interface EmailConfig extends PlatformConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
  auth: {
    user: string;
    pass: string;
  };
  recipients: string[];
  from?: string;
}

/**
 * 통합 알림 설정
 */
export interface NotificationConfig {
  platforms: string[];
  slack?: SlackConfig;
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  email?: EmailConfig;
  environment?: string;
  webDashboardUrl?: string;
}