/**
 * 하이브리드 구독 관리 시스템 인터페이스
 * 
 * 각 플랫폼별 최적화된 구독 관리 방식을 제공하는 통합 인터페이스
 */

import { UserSubscription } from '../notifications/SubscriptionManager';

/**
 * 구독 명령어 타입
 */
export type SubscriptionCommand = 
  | 'subscribe'
  | 'unsubscribe' 
  | 'list'
  | 'settings'
  | 'quiet'
  | 'status'
  | 'help';

/**
 * 구독 명령어 파라미터
 */
export interface SubscriptionCommandParams {
  command: SubscriptionCommand;
  platform: string;
  userId: string;
  args: string[];
  rawMessage?: string;
}

/**
 * 구독 명령어 실행 결과
 */
export interface SubscriptionCommandResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

/**
 * 사용자 인증 토큰
 */
export interface UserAuthToken {
  token: string;
  platform: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * 플랫폼별 구독 인터페이스 기본 클래스
 */
export interface PlatformSubscriptionInterface {
  readonly platformName: string;
  
  /**
   * 플랫폼별 구독 명령어 처리
   */
  handleCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult>;
  
  /**
   * 사용자 인증 토큰 생성
   */
  generateAuthToken(userId: string): Promise<UserAuthToken>;
  
  /**
   * 구독 설정 변경 알림 (플랫폼별)
   */
  notifySubscriptionChange(userId: string, change: string): Promise<void>;
  
  /**
   * 도움말 메시지 생성
   */
  getHelpMessage(): string;
}

/**
 * 웹 기반 구독 관리 인터페이스
 */
export interface WebSubscriptionInterface {
  /**
   * 토큰으로 사용자 인증
   */
  authenticateWithToken(token: string): Promise<UserSubscription | null>;
  
  /**
   * 구독 설정 업데이트
   */
  updateSubscription(token: string, subscription: Partial<UserSubscription>): Promise<SubscriptionCommandResult>;
  
  /**
   * 사용자 구독 현황 조회
   */
  getUserSubscriptions(token: string): Promise<UserSubscription[]>;
  
  /**
   * 구독 통계 조회
   */
  getSubscriptionStats(token: string): Promise<any>;
}

/**
 * Bot 명령어 파서 인터페이스
 */
export interface BotCommandParser {
  /**
   * 메시지에서 구독 명령어 파싱
   */
  parseCommand(message: string, platform: string, userId: string): SubscriptionCommandParams | null;
  
  /**
   * 명령어 유효성 검증
   */
  validateCommand(params: SubscriptionCommandParams): boolean;
  
  /**
   * 명령어 자동완성/제안
   */
  suggestCommands(partialCommand: string): string[];
}

/**
 * 인터랙티브 메시지 인터페이스 (Slack 등)
 */
export interface InteractiveMessageInterface {
  /**
   * 구독 설정용 인터랙티브 메시지 생성
   */
  createSubscriptionMessage(userId: string, currentSettings?: UserSubscription): any;
  
  /**
   * 버튼 클릭 이벤트 처리
   */
  handleButtonAction(payload: any): Promise<SubscriptionCommandResult>;
  
  /**
   * 설정 변경 확인 메시지
   */
  createConfirmationMessage(result: SubscriptionCommandResult): any;
}

/**
 * 이메일 명령어 프로세서 인터페이스
 */
export interface EmailCommandProcessor {
  /**
   * 이메일에서 명령어 추출
   */
  extractCommand(subject: string, body: string): SubscriptionCommandParams | null;
  
  /**
   * 명령어 실행 결과 이메일 생성
   */
  createResponseEmail(result: SubscriptionCommandResult, recipientEmail: string): {
    subject: string;
    html: string;
    text: string;
  };
  
  /**
   * 구독 설정 확인 이메일
   */
  createConfirmationEmail(subscription: UserSubscription, recipientEmail: string): Promise<{
    subject: string;
    html: string;
    text: string;
  }>;
}

/**
 * 통합 구독 관리 시스템 인터페이스
 */
export interface HybridSubscriptionManager {
  /**
   * 플랫폼별 구독 인터페이스 등록
   */
  registerPlatformInterface(platform: string, platformInterface: PlatformSubscriptionInterface): void;
  
  /**
   * 웹 인터페이스 등록
   */
  registerWebInterface(webInterface: WebSubscriptionInterface): void;
  
  /**
   * 구독 명령어 처리 (모든 플랫폼 통합)
   */
  processCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult>;
  
  /**
   * 사용자 인증 토큰 관리
   */
  generateUserToken(platform: string, userId: string): Promise<UserAuthToken>;
  validateToken(token: string): Promise<UserAuthToken | null>;
  revokeToken(token: string): Promise<boolean>;
  
  /**
   * 구독 설정 동기화 (모든 인터페이스간)
   */
  syncSubscriptions(): Promise<void>;
  
  /**
   * 플랫폼별 구독 통계
   */
  getPlatformStats(): Promise<Record<string, any>>;
}

/**
 * 구독 명령어 템플릿
 */
export interface SubscriptionCommandTemplates {
  // Telegram/Discord Bot 명령어
  botCommands: {
    subscribe: string;    // "/subscribe seoul heat"
    unsubscribe: string;  // "/unsubscribe seoul"
    list: string;         // "/mysettings"
    quiet: string;        // "/quiet 22:00 08:00"
    help: string;         // "/help"
  };
  
  // Email 명령어
  emailCommands: {
    subscribe: string;    // "SUBSCRIBE seoul heat"
    unsubscribe: string;  // "UNSUBSCRIBE seoul"
    status: string;       // "STATUS"
  };
  
  // 웹 인터페이스 URL 패턴
  webUrls: {
    subscription: string; // "/subscribe?token={token}"
    settings: string;     // "/settings?token={token}"
    stats: string;        // "/stats?token={token}"
  };
}

/**
 * 지역 코드 매핑 (사용자 친화적 이름)
 */
export interface RegionMapping {
  [key: string]: {
    code: string;      // 'L1100000'
    name: string;      // '서울특별시'
    aliases: string[]; // ['seoul', '서울', 'Seoul']
  };
}

/**
 * 특보 종류 매핑 (사용자 친화적 이름)
 */
export interface WarningTypeMapping {
  [key: string]: {
    code: string;      // 'H'
    name: string;      // '폭염'
    aliases: string[]; // ['heat', '폭염', 'hot']
  };
}