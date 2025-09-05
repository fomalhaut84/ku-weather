import { WeatherAlert, AlertChange } from '../../types/weather';

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
   * 단일 날씨 특보 알림 전송
   * @param alert 특보 정보
   */
  sendAlert(alert: WeatherAlert): Promise<NotificationResult>;

  /**
   * 특보 변동 알림 전송
   * @param change 변동 정보
   */
  sendAlertChange(change: AlertChange): Promise<NotificationResult>;

  /**
   * 다중 특보 변동 알림 전송 (배치 또는 개별)
   * @param changes 변동 정보 배열
   */
  sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]>;

  /**
   * 건강 상태 확인 (연결 테스트)
   * @returns 플랫폼과의 연결 상태
   */
  healthCheck(): Promise<boolean>;
}

/**
 * 플랫폼별 설정 인터페이스
 */
export interface PlatformConfig {
  enabled: boolean;
  [key: string]: any;
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
  chatId: string;
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
}