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
import { TokenService, TokenInfo } from '../TokenService';

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
  private tokenService: TokenService;

  constructor(subscriptionManager: SubscriptionManager, tokenService: TokenService) {
    this.subscriptionManager = subscriptionManager;
    this.commandParser = new CommonCommandParser();
    this.tokenService = tokenService;
    logger.info('웹 구독 인터페이스 초기화 완료');
  }

  /**
   * 토큰으로 사용자 인증 및 구독 정보 조회
   *
   * 신규 사용자의 경우 기본 구독 객체를 반환하여 초기 설정 가능
   */
  async authenticateWithToken(token: string): Promise<UserSubscription | null> {
    try {
      const tokenInfo = await this.tokenService.validateToken(token);
      if (!tokenInfo) {
        logger.warn(`유효하지 않은 토큰: ${token.substring(0, 10)}...`);
        return null;
      }

      // 사용자 구독 정보 조회
      const subscription = this.subscriptionManager.getUserSubscription(
        tokenInfo.platform,
        tokenInfo.userId
      );

      if (subscription) {
        logger.debug(`웹 토큰 인증 성공 (기존 구독): ${tokenInfo.platform}/${tokenInfo.userId}`);
        return subscription;
      }

      // 신규 사용자: 기본 구독 객체 반환
      logger.debug(`웹 토큰 인증 성공 (신규 사용자): ${tokenInfo.platform}/${tokenInfo.userId}`);
      const defaultSubscription: UserSubscription = {
        id: `temp_${tokenInfo.platform}_${tokenInfo.userId}`,
        platform: tokenInfo.platform,
        userId: tokenInfo.userId,
        targetRegions: [],
        warningTypes: [],
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        displayName: tokenInfo.displayName || `${this.getPlatformDisplayName(tokenInfo.platform)} 사용자`
      };

      return defaultSubscription;

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
      const tokenInfo = await this.tokenService.validateToken(token);
      if (!tokenInfo) {
        return {
          success: false,
          message: '인증이 만료되었습니다. 다시 로그인해주세요.',
          error: 'TOKEN_EXPIRED'
        };
      }

      // 기존 구독 정보 조회
      const existingSubscription = this.subscriptionManager.getUserSubscription(
        tokenInfo.platform,
        tokenInfo.userId
      );

      // 새로운 구독 정보 생성
      // preferences 처리: 명시적 null을 보존하여 quietHours 비활성화 가능
      let mergedPreferences = { ...existingSubscription?.preferences };
      if (updateRequest.preferences !== undefined) {
        // quietHours가 명시적으로 null이면 제거
        const { quietHours, ...otherPreferences } = updateRequest.preferences;

        mergedPreferences = {
          ...mergedPreferences,
          ...otherPreferences
        };

        if (quietHours === null) {
          // null이면 기존 quietHours 제거
          delete mergedPreferences.quietHours;
        } else if (quietHours !== undefined) {
          // 새로운 값이 있으면 설정
          mergedPreferences.quietHours = quietHours;
        }
      }

      const newSubscription: Partial<UserSubscription> = {
        platform: tokenInfo.platform,
        userId: tokenInfo.userId,
        targetRegions: updateRequest.targetRegions ?? existingSubscription?.targetRegions ?? [],
        warningTypes: updateRequest.warningTypes ?? existingSubscription?.warningTypes ?? [],
        enabled: updateRequest.enabled ?? existingSubscription?.enabled ?? true,
        displayName: updateRequest.displayName ?? existingSubscription?.displayName ??
          `${this.getPlatformDisplayName(tokenInfo.platform)} 사용자`,
        preferences: mergedPreferences
      };

      // 입력값 검증
      const validationResult = this.validateSubscriptionData(newSubscription);
      if (!validationResult.success) {
        return validationResult;
      }

      // 구독 업데이트 실행
      this.subscriptionManager.addSubscription(newSubscription as Omit<UserSubscription, 'id' | 'createdAt' | 'updatedAt'>);

      logger.info(`웹에서 구독 업데이트: ${tokenInfo.platform}/${tokenInfo.userId}`);

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
      const tokenInfo = await this.tokenService.validateToken(token);
      if (!tokenInfo) {
        return [];
      }

      const subscription = this.subscriptionManager.getUserSubscription(
        tokenInfo.platform,
        tokenInfo.userId
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
  async getSubscriptionStats(token: string): Promise<Record<string, unknown> | null> {
    try {
      const tokenInfo = await this.tokenService.validateToken(token);
      if (!tokenInfo) {
        return null;
      }

      const stats = this.subscriptionManager.getStatistics();
      const userSubscription = this.subscriptionManager.getUserSubscription(
        tokenInfo.platform,
        tokenInfo.userId
      );

      return {
        overall: stats,
        user: {
          hasSubscription: !!userSubscription,
          platform: tokenInfo.platform,
          regions: userSubscription?.targetRegions?.length || 0,
          warningTypes: userSubscription?.warningTypes?.length || 0,
          enabled: userSubscription?.enabled ?? false
        },
        metadata: {
          availableRegions: this.getAvailableRegions(),
          availableWarningTypes: this.getAvailableWarningTypes(),
          platformInfo: {
            name: tokenInfo.platform,
            displayName: this.getPlatformDisplayName(tokenInfo.platform),
            features: this.getPlatformFeatures(tokenInfo.platform)
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
      const tokenInfo = await this.tokenService.validateToken(token);
      if (!tokenInfo) {
        return {
          success: false,
          message: '인증이 만료되었습니다.',
          error: 'TOKEN_EXPIRED'
        };
      }

      const subscription = this.subscriptionManager.getUserSubscription(
        tokenInfo.platform,
        tokenInfo.userId
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
        // 구독 삭제 성공 시 토큰도 무효화하여 재활성화 방지
        const tokenRevoked = await this.tokenService.revokeToken(token);
        if (tokenRevoked) {
          logger.info(`웹에서 구독 및 토큰 삭제: ${tokenInfo.platform}/${tokenInfo.userId}`);
        } else {
          logger.warn(`구독은 삭제되었으나 토큰 무효화 실패: ${tokenInfo.platform}/${tokenInfo.userId}`);
        }

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
   * 새로운 웹 접근 토큰 생성
   * 플랫폼 인터페이스에서 호출되어 사용자에게 설정 링크를 제공할 때 사용
   */
  async generateAccessToken(platform: string, userId: string, displayName?: string): Promise<TokenInfo> {
    return await this.tokenService.generateToken({
      platform,
      userId,
      displayName,
      expiresInHours: 720 // 30일
    });
  }

  /**
   * 토큰 등록 (하위 호환성 유지 - deprecated)
   * @deprecated Use generateAccessToken() instead
   */
  async registerToken(authToken: UserAuthToken): Promise<void> {
    await this.tokenService.generateToken({
      platform: authToken.platform,
      userId: authToken.userId,
      displayName: authToken.userId,
      expiresInHours: Math.floor((authToken.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))
    });

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