/**
 * 하이브리드 구독 관리 시스템
 * 
 * 모든 플랫폼별 구독 인터페이스를 통합 관리하는 중앙 시스템
 */

import { SubscriptionManager, UserSubscription } from '../notifications/SubscriptionManager';
import { logger } from '../../utils/logger';
import {
  HybridSubscriptionManager as IHybridSubscriptionManager,
  PlatformSubscriptionInterface,
  WebSubscriptionInterface,
  SubscriptionCommandParams,
  SubscriptionCommandResult,
  UserAuthToken
} from './interfaces';

/**
 * 사용자 인증 토큰 관리
 */
class TokenManager {
  private tokens: Map<string, UserAuthToken> = new Map();
  private readonly TOKEN_EXPIRY_HOURS = 24; // 토큰 유효기간 24시간

  generateToken(platform: string, userId: string): UserAuthToken {
    const token = this.createSecureToken(platform, userId);
    const authToken: UserAuthToken = {
      token,
      platform,
      userId,
      expiresAt: new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000),
      createdAt: new Date()
    };
    
    this.tokens.set(token, authToken);
    this.cleanupExpiredTokens();
    
    logger.info(`토큰 생성 완료: ${platform}/${userId}`);
    return authToken;
  }

  validateToken(token: string): UserAuthToken | null {
    const authToken = this.tokens.get(token);
    if (!authToken) return null;
    
    if (authToken.expiresAt < new Date()) {
      this.tokens.delete(token);
      return null;
    }
    
    return authToken;
  }

  revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  private createSecureToken(platform: string, userId: string): string {
    const prefix = platform.substring(0, 2).toUpperCase();
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const userHash = this.hashUserId(userId);
    
    return `${prefix}_${timestamp}_${userHash}_${random}`;
  }

  private hashUserId(userId: string): string {
    // 간단한 해시 함수 (실제 운영에서는 crypto 모듈 사용)
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, authToken] of this.tokens.entries()) {
      if (authToken.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }
}

/**
 * 하이브리드 구독 관리 시스템 구현
 */
export class HybridSubscriptionManager implements IHybridSubscriptionManager {
  private subscriptionManager: SubscriptionManager;
  private tokenManager: TokenManager;
  private platformInterfaces: Map<string, PlatformSubscriptionInterface> = new Map();
  private webInterface?: WebSubscriptionInterface;

  constructor(subscriptionManager: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager;
    this.tokenManager = new TokenManager();
    logger.info('하이브리드 구독 관리 시스템 초기화 완료');
  }

  /**
   * 플랫폼별 구독 인터페이스 등록
   */
  registerPlatformInterface(platform: string, interface: PlatformSubscriptionInterface): void {
    this.platformInterfaces.set(platform, interface);
    logger.info(`플랫폼 인터페이스 등록: ${platform} (${interface.constructor.name})`);
  }

  /**
   * 웹 인터페이스 등록
   */
  registerWebInterface(interface: WebSubscriptionInterface): void {
    this.webInterface = interface;
    logger.info('웹 인터페이스 등록 완료');
  }

  /**
   * 구독 명령어 처리 (모든 플랫폼 통합)
   */
  async processCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      logger.debug(`구독 명령어 처리: ${params.platform}/${params.userId} - ${params.command}`);

      // 플랫폼별 인터페이스 확인
      const platformInterface = this.platformInterfaces.get(params.platform);
      if (!platformInterface) {
        return {
          success: false,
          message: `지원하지 않는 플랫폼입니다: ${params.platform}`,
          error: 'UNSUPPORTED_PLATFORM'
        };
      }

      // 명령어 실행
      const result = await platformInterface.handleCommand(params);
      
      // 명령어 실행 결과 로깅
      if (result.success) {
        logger.info(`구독 명령어 성공: ${params.platform}/${params.userId} - ${params.command}`);
      } else {
        logger.warn(`구독 명령어 실패: ${params.platform}/${params.userId} - ${params.command}: ${result.error}`);
      }

      return result;

    } catch (error) {
      logger.error('구독 명령어 처리 중 오류:', error);
      return {
        success: false,
        message: '명령어 처리 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * 사용자 인증 토큰 생성
   */
  async generateUserToken(platform: string, userId: string): Promise<UserAuthToken> {
    return this.tokenManager.generateToken(platform, userId);
  }

  /**
   * 토큰 검증
   */
  async validateToken(token: string): Promise<UserAuthToken | null> {
    return this.tokenManager.validateToken(token);
  }

  /**
   * 토큰 취소
   */
  async revokeToken(token: string): Promise<boolean> {
    return this.tokenManager.revokeToken(token);
  }

  /**
   * 구독 설정 동기화
   */
  async syncSubscriptions(): Promise<void> {
    try {
      logger.info('구독 설정 동기화 시작');
      
      // 모든 플랫폼별 인터페이스에 동기화 알림
      for (const [platform, interface] of this.platformInterfaces) {
        try {
          // 플랫폼별 동기화 로직이 있다면 실행
          // 현재는 로깅만 수행
          logger.debug(`${platform} 플랫폼 동기화 완료`);
        } catch (error) {
          logger.warn(`${platform} 플랫폼 동기화 실패:`, error);
        }
      }

      logger.info('구독 설정 동기화 완료');
    } catch (error) {
      logger.error('구독 설정 동기화 중 오류:', error);
      throw error;
    }
  }

  /**
   * 플랫폼별 구독 통계
   */
  async getPlatformStats(): Promise<Record<string, any>> {
    try {
      const stats = this.subscriptionManager.getStatistics();
      
      const platformStats: Record<string, any> = {
        overall: stats,
        platforms: {},
        interfaces: {
          registered: Array.from(this.platformInterfaces.keys()),
          webEnabled: !!this.webInterface
        },
        tokens: {
          active: this.getActiveTokenCount()
        }
      };

      // 플랫폼별 세부 통계
      for (const platform of this.platformInterfaces.keys()) {
        const platformSubscriptions = this.subscriptionManager.getSubscriptionsByPlatform(platform);
        platformStats.platforms[platform] = {
          totalSubscriptions: platformSubscriptions.length,
          activeSubscriptions: platformSubscriptions.filter(sub => sub.enabled).length,
          regions: this.getRegionBreakdown(platformSubscriptions),
          warningTypes: this.getWarningTypeBreakdown(platformSubscriptions)
        };
      }

      return platformStats;
    } catch (error) {
      logger.error('플랫폼 통계 조회 중 오류:', error);
      throw error;
    }
  }

  /**
   * 구독 매니저 직접 접근 (기존 API와의 호환성)
   */
  getSubscriptionManager(): SubscriptionManager {
    return this.subscriptionManager;
  }

  /**
   * 등록된 플랫폼 인터페이스 목록
   */
  getRegisteredPlatforms(): string[] {
    return Array.from(this.platformInterfaces.keys());
  }

  /**
   * 웹 인터페이스 사용 가능 여부
   */
  isWebInterfaceAvailable(): boolean {
    return !!this.webInterface;
  }

  /**
   * 플랫폼별 도움말 메시지 생성
   */
  async getHelpMessage(platform: string): Promise<string> {
    const interface = this.platformInterfaces.get(platform);
    if (!interface) {
      return `지원하지 않는 플랫폼입니다: ${platform}`;
    }
    
    return interface.getHelpMessage();
  }

  // Private helper methods

  private getActiveTokenCount(): number {
    // TokenManager에서 활성 토큰 수를 가져오는 메서드 (현재는 추정)
    // 실제 구현에서는 tokenManager에 public 메서드 추가 필요
    return 0; // 임시값
  }

  private getRegionBreakdown(subscriptions: UserSubscription[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const sub of subscriptions) {
      for (const region of sub.targetRegions) {
        breakdown[region] = (breakdown[region] || 0) + 1;
      }
    }
    
    return breakdown;
  }

  private getWarningTypeBreakdown(subscriptions: UserSubscription[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const sub of subscriptions) {
      if (!sub.warningTypes || sub.warningTypes.length === 0) {
        breakdown['ALL'] = (breakdown['ALL'] || 0) + 1;
      } else {
        for (const type of sub.warningTypes) {
          breakdown[type] = (breakdown[type] || 0) + 1;
        }
      }
    }
    
    return breakdown;
  }
}