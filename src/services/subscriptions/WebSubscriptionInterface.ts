/**
 * 웹 기반 구독 관리 인터페이스
 * 
 * 모든 플랫폼에서 사용 가능한 웹 기반 구독 설정 관리 시스템
 */

import { SubscriptionManager, UserSubscription } from '../notifications/SubscriptionManager';
import { logger } from '../../utils/logger';
import {
  WebSubscriptionInterface as IWebSubscriptionInterface,
  SubscriptionCommandResult,
  UserAuthToken
} from './interfaces';
import { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from './CommandParser';

/**
 * 웹 구독 관리 API 응답 타입
 */
interface WebApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * 구독 설정 업데이트 요청 타입
 */
interface SubscriptionUpdateRequest {
  targetRegions?: string[];
  warningTypes?: string[];
  enabled?: boolean;
  displayName?: string;
  preferences?: {
    quietHours?: { start: string; end: string } | null;
    minLevel?: string;
    batchMode?: boolean;
  };
}

/**
 * 웹 대시보드용 구독 정보 타입
 */
interface WebSubscriptionInfo extends UserSubscription {
  regionNames: string[];
  warningTypeNames: string[];
  platformDisplayName: string;
}

/**
 * 웹 기반 구독 관리 인터페이스 구현
 */
export class WebSubscriptionInterface implements IWebSubscriptionInterface {
  private subscriptionManager: SubscriptionManager;
  private commandParser: CommonCommandParser;
  private tokenStore: Map<string, UserAuthToken> = new Map();

  constructor(subscriptionManager: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager;
    this.commandParser = new CommonCommandParser();
    logger.info('웹 구독 인터페이스 초기화 완료');
  }

  /**
   * 토큰으로 사용자 인증 및 구독 정보 조회
   */
  async authenticateWithToken(token: string): Promise<UserSubscription | null> {
    try {
      const authToken = this.validateToken(token);
      if (!authToken) {
        logger.warn(`유효하지 않은 토큰: ${token.substring(0, 10)}...`);
        return null;
      }

      // 사용자 구독 정보 조회
      const subscription = this.subscriptionManager.getUserSubscription(
        authToken.platform, 
        authToken.userId
      );

      if (subscription) {
        logger.debug(`웹 토큰 인증 성공: ${authToken.platform}/${authToken.userId}`);
      }

      return subscription;

    } catch (error) {
      logger.error('웹 토큰 인증 실패:', error);
      return null;
    }
  }

  /**
   * 구독 설정 업데이트
   */
  async updateSubscription(token: string, updateRequest: SubscriptionUpdateRequest): Promise<SubscriptionCommandResult> {
    try {
      const authToken = this.validateToken(token);
      if (!authToken) {
        return {
          success: false,
          message: '인증이 만료되었습니다. 다시 로그인해주세요.',
          error: 'TOKEN_EXPIRED'
        };
      }

      // 기존 구독 정보 조회
      const existingSubscription = this.subscriptionManager.getUserSubscription(
        authToken.platform, 
        authToken.userId
      );

      // 새로운 구독 정보 생성
      const newSubscription: Partial<UserSubscription> = {
        platform: authToken.platform,
        userId: authToken.userId,
        targetRegions: updateRequest.targetRegions ?? existingSubscription?.targetRegions ?? [],
        warningTypes: updateRequest.warningTypes ?? existingSubscription?.warningTypes ?? [],
        enabled: updateRequest.enabled ?? existingSubscription?.enabled ?? true,
        displayName: updateRequest.displayName ?? existingSubscription?.displayName ?? 
          `${this.getPlatformDisplayName(authToken.platform)} 사용자`,
        preferences: {
          ...existingSubscription?.preferences,
          ...updateRequest.preferences
        }
      };

      // 입력값 검증
      const validationResult = this.validateSubscriptionData(newSubscription);
      if (!validationResult.success) {
        return validationResult;
      }

      // 구독 업데이트 실행
      this.subscriptionManager.addSubscription(newSubscription as Omit<UserSubscription, 'id' | 'createdAt' | 'updatedAt'>);

      logger.info(`웹에서 구독 업데이트: ${authToken.platform}/${authToken.userId}`);

      return {
        success: true,
        message: '구독 설정이 성공적으로 업데이트되었습니다.',
        data: {
          subscription: newSubscription,
          regions: this.getRegionNames(newSubscription.targetRegions || []),
          warningTypes: this.getWarningTypeNames(newSubscription.warningTypes || [])
        }
      };

    } catch (error) {
      logger.error('웹 구독 업데이트 실패:', error);
      return {
        success: false,
        message: '구독 업데이트 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'UPDATE_FAILED'
      };
    }
  }

  /**
   * 사용자 구독 현황 조회 (웹 대시보드용)
   */
  async getUserSubscriptions(token: string): Promise<UserSubscription[]> {
    try {
      const authToken = this.validateToken(token);
      if (!authToken) {
        return [];
      }

      const subscription = this.subscriptionManager.getUserSubscription(
        authToken.platform, 
        authToken.userId
      );

      return subscription ? [subscription] : [];

    } catch (error) {
      logger.error('웹 구독 현황 조회 실패:', error);
      return [];
    }
  }

  /**
   * 구독 통계 조회 (웹 대시보드용)
   */
  async getSubscriptionStats(token: string): Promise<any> {
    try {
      const authToken = this.validateToken(token);
      if (!authToken) {
        return null;
      }

      const stats = this.subscriptionManager.getStatistics();
      const userSubscription = this.subscriptionManager.getUserSubscription(
        authToken.platform, 
        authToken.userId
      );

      return {
        overall: stats,
        user: {
          hasSubscription: !!userSubscription,
          platform: authToken.platform,
          regions: userSubscription?.targetRegions?.length || 0,
          warningTypes: userSubscription?.warningTypes?.length || 0,
          enabled: userSubscription?.enabled ?? false
        },
        metadata: {
          availableRegions: this.getAvailableRegions(),
          availableWarningTypes: this.getAvailableWarningTypes(),
          platformInfo: {
            name: authToken.platform,
            displayName: this.getPlatformDisplayName(authToken.platform),
            features: this.getPlatformFeatures(authToken.platform)
          }
        }
      };

    } catch (error) {
      logger.error('웹 구독 통계 조회 실패:', error);
      return null;
    }
  }

  /**
   * 웹 대시보드용 확장 구독 정보 조회
   */
  async getEnhancedSubscriptionInfo(token: string): Promise<WebApiResponse<WebSubscriptionInfo>> {
    try {
      const subscription = await this.authenticateWithToken(token);
      
      if (!subscription) {
        return {
          success: false,
          message: '구독 정보를 찾을 수 없습니다.',
          error: 'SUBSCRIPTION_NOT_FOUND'
        };
      }

      const enhancedInfo: WebSubscriptionInfo = {
        ...subscription,
        regionNames: this.getRegionNames(subscription.targetRegions),
        warningTypeNames: this.getWarningTypeNames(subscription.warningTypes || []),
        platformDisplayName: this.getPlatformDisplayName(subscription.platform)
      };

      return {
        success: true,
        data: enhancedInfo
      };

    } catch (error) {
      logger.error('확장 구독 정보 조회 실패:', error);
      return {
        success: false,
        message: '구독 정보 조회 중 오류가 발생했습니다.',
        error: 'FETCH_FAILED'
      };
    }
  }

  /**
   * 구독 삭제 (웹 인터페이스용)
   */
  async deleteSubscription(token: string): Promise<SubscriptionCommandResult> {
    try {
      const authToken = this.validateToken(token);
      if (!authToken) {
        return {
          success: false,
          message: '인증이 만료되었습니다.',
          error: 'TOKEN_EXPIRED'
        };
      }

      const subscription = this.subscriptionManager.getUserSubscription(
        authToken.platform, 
        authToken.userId
      );

      if (!subscription) {
        return {
          success: false,
          message: '삭제할 구독이 없습니다.',
          error: 'NO_SUBSCRIPTION'
        };
      }

      const success = this.subscriptionManager.removeSubscription(subscription.id);

      if (success) {
        logger.info(`웹에서 구독 삭제: ${authToken.platform}/${authToken.userId}`);
        return {
          success: true,
          message: '구독이 성공적으로 삭제되었습니다.'
        };
      } else {
        return {
          success: false,
          message: '구독 삭제에 실패했습니다.',
          error: 'DELETE_FAILED'
        };
      }

    } catch (error) {
      logger.error('웹 구독 삭제 실패:', error);
      return {
        success: false,
        message: '구독 삭제 중 오류가 발생했습니다.',
        error: 'DELETE_FAILED'
      };
    }
  }

  /**
   * 토큰 등록 (다른 인터페이스에서 생성된 토큰 등록)
   */
  registerToken(authToken: UserAuthToken): void {
    this.tokenStore.set(authToken.token, authToken);
    
    // 만료 시간에 자동 삭제 스케줄링
    const expiryMs = authToken.expiresAt.getTime() - Date.now();
    if (expiryMs > 0) {
      setTimeout(() => {
        this.tokenStore.delete(authToken.token);
      }, expiryMs);
    }

    logger.debug(`웹 토큰 등록: ${authToken.platform}/${authToken.userId}`);
  }

  /**
   * 모든 사용 가능한 지역 목록 반환
   */
  getAvailableRegions(): Array<{ code: string; name: string; aliases: string[] }> {
    return Object.values(REGION_MAPPINGS).map(region => ({
      code: region.code,
      name: region.name,
      aliases: region.aliases
    }));
  }

  /**
   * 모든 사용 가능한 특보 종류 목록 반환
   */
  getAvailableWarningTypes(): Array<{ code: string; name: string; aliases: string[] }> {
    return Object.values(WARNING_TYPE_MAPPINGS).map(warning => ({
      code: warning.code,
      name: warning.name,
      aliases: warning.aliases
    }));
  }

  // Private helper methods

  private validateToken(token: string): UserAuthToken | null {
    const authToken = this.tokenStore.get(token);
    if (!authToken) return null;

    // 만료 시간 확인
    if (authToken.expiresAt < new Date()) {
      this.tokenStore.delete(token);
      return null;
    }

    return authToken;
  }

  private validateSubscriptionData(subscription: Partial<UserSubscription>): SubscriptionCommandResult {
    // 필수 필드 검증
    if (!subscription.platform || !subscription.userId) {
      return {
        success: false,
        message: '필수 정보가 누락되었습니다.',
        error: 'MISSING_REQUIRED_FIELDS'
      };
    }

    // 지역 코드 검증
    if (subscription.targetRegions) {
      for (const regionCode of subscription.targetRegions) {
        if (regionCode && !this.isValidRegionCode(regionCode)) {
          return {
            success: false,
            message: `잘못된 지역 코드입니다: ${regionCode}`,
            error: 'INVALID_REGION_CODE'
          };
        }
      }
    }

    // 특보 종류 검증
    if (subscription.warningTypes) {
      for (const warningType of subscription.warningTypes) {
        if (warningType && !this.isValidWarningType(warningType)) {
          return {
            success: false,
            message: `잘못된 특보 종류입니다: ${warningType}`,
            error: 'INVALID_WARNING_TYPE'
          };
        }
      }
    }

    // 조용한 시간대 검증
    if (subscription.preferences?.quietHours) {
      const { start, end } = subscription.preferences.quietHours;
      if (!this.commandParser.validateTimeFormat(start) || !this.commandParser.validateTimeFormat(end)) {
        return {
          success: false,
          message: '잘못된 시간 형식입니다. HH:MM 형식을 사용하세요.',
          error: 'INVALID_TIME_FORMAT'
        };
      }
    }

    // 최소 특보 수준 검증
    if (subscription.preferences?.minLevel) {
      const level = subscription.preferences.minLevel;
      if (!['1', '2', '3'].includes(level)) {
        return {
          success: false,
          message: '잘못된 특보 수준입니다. 1(예비특보), 2(주의보), 3(경보) 중 선택하세요.',
          error: 'INVALID_WARNING_LEVEL'
        };
      }
    }

    return { success: true, message: '검증 통과' };
  }

  private isValidRegionCode(code: string): boolean {
    if (code === '') return true; // 전국
    return Object.values(REGION_MAPPINGS).some(region => region.code === code);
  }

  private isValidWarningType(type: string): boolean {
    if (type === '') return true; // 전체
    return Object.values(WARNING_TYPE_MAPPINGS).some(warning => warning.code === type);
  }

  private getRegionNames(regionCodes: string[]): string[] {
    if (regionCodes.length === 0) return ['전국'];
    
    return regionCodes.map(code => {
      const region = Object.values(REGION_MAPPINGS).find(r => r.code === code);
      return region ? region.name : code;
    });
  }

  private getWarningTypeNames(warningCodes: string[]): string[] {
    if (warningCodes.length === 0) return ['전체'];
    
    return warningCodes.map(code => {
      const warning = Object.values(WARNING_TYPE_MAPPINGS).find(w => w.code === code);
      return warning ? warning.name : code;
    });
  }

  private getPlatformDisplayName(platform: string): string {
    const displayNames: Record<string, string> = {
      'telegram': 'Telegram',
      'discord': 'Discord', 
      'slack': 'Slack',
      'email': 'Email'
    };
    return displayNames[platform] || platform;
  }

  private getPlatformFeatures(platform: string): string[] {
    const features: Record<string, string[]> = {
      'telegram': ['bot_commands', 'direct_message', 'real_time'],
      'discord': ['slash_commands', 'channel_message', 'rich_embeds'],
      'slack': ['interactive_buttons', 'channel_message', 'mentions'],
      'email': ['reply_commands', 'html_formatting', 'attachments']
    };
    return features[platform] || [];
  }
}