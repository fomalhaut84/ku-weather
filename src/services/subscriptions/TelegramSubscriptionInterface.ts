/**
 * Telegram Bot 구독 인터페이스
 * 
 * Telegram Bot API를 통한 개별 사용자 구독 관리 시스템
 */

import { SubscriptionManager, UserSubscription } from '../notifications/SubscriptionManager';
import { logger } from '../../utils/logger';
import {
  PlatformSubscriptionInterface,
  SubscriptionCommandParams,
  SubscriptionCommandResult,
  UserAuthToken
} from './interfaces';
import { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from './CommandParser';
import { WebSubscriptionInterface } from './WebSubscriptionInterface';

/**
 * Telegram Bot 구독 인터페이스 구현
 */
export class TelegramSubscriptionInterface implements PlatformSubscriptionInterface {
  readonly platformName = 'telegram';

  private subscriptionManager: SubscriptionManager;
  private commandParser: CommonCommandParser;
  private botToken?: string;
  private webInterface?: WebSubscriptionInterface;

  constructor(
    subscriptionManager: SubscriptionManager,
    botToken?: string,
    webInterface?: WebSubscriptionInterface
  ) {
    this.subscriptionManager = subscriptionManager;
    this.commandParser = new CommonCommandParser();
    this.botToken = botToken;
    this.webInterface = webInterface;
    logger.info('Telegram 구독 인터페이스 초기화 완료');
  }

  /**
   * Telegram Bot 명령어 처리
   */
  async handleCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      // 명령어 유효성 검증
      if (!this.commandParser.validateCommand(params)) {
        return {
          success: false,
          message: '잘못된 명령어 형식입니다. /help를 입력하여 도움말을 확인하세요.',
          error: 'INVALID_COMMAND_FORMAT'
        };
      }

      logger.debug(`Telegram 명령어 처리: ${params.command} - ${params.args.join(' ')}`);

      // 명령어별 처리
      switch (params.command) {
        case 'subscribe':
          return await this.handleSubscribeCommand(params);
          
        case 'unsubscribe':
          return await this.handleUnsubscribeCommand(params);
          
        case 'list':
        case 'settings':
          return await this.handleListCommand(params);
          
        case 'quiet':
          return await this.handleQuietCommand(params);
          
        case 'status':
          return await this.handleStatusCommand(params);
          
        case 'help':
          return await this.handleHelpCommand(params);
          
        default:
          return {
            success: false,
            message: '알 수 없는 명령어입니다. /help를 입력하여 사용 가능한 명령어를 확인하세요.',
            error: 'UNKNOWN_COMMAND'
          };
      }

    } catch (error) {
      logger.error('Telegram 명령어 처리 중 오류:', error);
      return {
        success: false,
        message: '명령어 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * 구독 추가 명령어 처리
   * 사용법: /subscribe seoul heat
   * 사용법: /subscribe busan
   * 사용법: /subscribe all typhoon
   */
  private async handleSubscribeCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    if (params.args.length < 1) {
      return {
        success: false,
        message: '지역을 지정해주세요\\.\n사용법: /subscribe \\<지역\\> \\[특보종류\\]\n예시: /subscribe seoul heat',
        error: 'MISSING_REGION'
      };
    }

    // 지역 파싱
    const regionInfo = this.commandParser.parseRegion(params.args[0]);
    if (!regionInfo) {
      const availableRegions = Object.values(REGION_MAPPINGS).map(m => m.aliases[0]).slice(0, 10).join(', ');
      return {
        success: false,
        message: `잘못된 지역명입니다: ${params.args[0]}\n사용 가능한 지역: ${availableRegions}`,
        error: 'INVALID_REGION'
      };
    }

    // 특보 종류 파싱 (선택사항)
    let warningTypes: string[] = [];
    if (params.args.length > 1) {
      for (let i = 1; i < params.args.length; i++) {
        const warningInfo = this.commandParser.parseWarningType(params.args[i]);
        if (warningInfo) {
          if (warningInfo.code === '') {
            warningTypes = []; // 'all'인 경우 전체
            break;
          }
          warningTypes.push(warningInfo.code);
        } else {
          return {
            success: false,
            message: `잘못된 특보 종류입니다: ${params.args[i]}\n사용 가능한 특보: heat, rain, typhoon, all 등`,
            error: 'INVALID_WARNING_TYPE'
          };
        }
      }
    }

    // 기존 구독 정보 조회
    const existingSubscription = this.subscriptionManager.getUserSubscription('telegram', params.userId);
    
    // 새 지역 추가
    const currentRegions = existingSubscription?.targetRegions || [];
    const newRegions = regionInfo.code === '' 
      ? [] // 전국 설정
      : [...new Set([...currentRegions, regionInfo.code])]; // 중복 제거

    // 새 특보 종류 설정
    const currentWarningTypes = existingSubscription?.warningTypes || [];
    const newWarningTypes = warningTypes.length === 0 
      ? [] // 전체 특보
      : [...new Set([...currentWarningTypes, ...warningTypes])]; // 중복 제거

    try {
      // 구독 추가/업데이트
      this.subscriptionManager.addSubscription({
        platform: 'telegram',
        userId: params.userId,
        targetRegions: newRegions,
        warningTypes: newWarningTypes,
        enabled: true,
        displayName: existingSubscription?.displayName || `Telegram 사용자 ${params.userId.substring(-6)}`
      });

      const regionName = regionInfo.code === '' ? '전국' : regionInfo.name;
      const warningName = warningTypes.length === 0 ? '모든 특보' : warningTypes.map(code => 
        Object.values(WARNING_TYPE_MAPPINGS).find(w => w.code === code)?.name || code
      ).join(', ');

      return {
        success: true,
        message: `✅ 구독이 추가되었습니다!\n📍 지역: ${regionName}\n⚠️ 특보: ${warningName}\n\n현재 구독 현황을 보려면 /list를 입력하세요.`
      };

    } catch (error) {
      logger.error('구독 추가 실패:', error);
      return {
        success: false,
        message: '구독 추가 중 오류가 발생했습니다. 관리자에게 문의하세요.',
        error: 'SUBSCRIPTION_ADD_FAILED'
      };
    }
  }

  /**
   * 구독 해제 명령어 처리
   * 사용법: /unsubscribe seoul
   * 사용법: /unsubscribe (전체 해제)
   */
  private async handleUnsubscribeCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    const existingSubscription = this.subscriptionManager.getUserSubscription('telegram', params.userId);
    
    if (!existingSubscription) {
      return {
        success: false,
        message: '구독 중인 알림이 없습니다\\.\n새로 구독하려면 /subscribe \\<지역\\>을 입력하세요\\.',
        error: 'NO_SUBSCRIPTION'
      };
    }

    try {
      // 전체 해제
      if (params.args.length === 0) {
        this.subscriptionManager.removeSubscription(existingSubscription.id);
        return {
          success: true,
          message: '✅ 모든 구독이 해제되었습니다\\.\n새로 구독하려면 /subscribe \\<지역\\>을 입력하세요\\.'
        };
      }

      // 특정 지역 해제
      const regionInfo = this.commandParser.parseRegion(params.args[0]);
      if (!regionInfo) {
        return {
          success: false,
          message: `잘못된 지역명입니다: ${params.args[0]}\n/list로 현재 구독 중인 지역을 확인하세요.`,
          error: 'INVALID_REGION'
        };
      }

      const currentRegions = existingSubscription.targetRegions || [];
      const newRegions = currentRegions.filter(region => region !== regionInfo.code);

      // 해제할 지역이 없는 경우
      if (newRegions.length === currentRegions.length) {
        return {
          success: false,
          message: `${regionInfo.name} 지역은 구독 중이지 않습니다.\n현재 구독 현황: /list`,
          error: 'REGION_NOT_SUBSCRIBED'
        };
      }

      // 모든 지역이 해제된 경우 전체 구독 제거
      if (newRegions.length === 0) {
        this.subscriptionManager.removeSubscription(existingSubscription.id);
        return {
          success: true,
          message: `✅ ${regionInfo.name} 지역 구독이 해제되었습니다.\n모든 지역이 해제되어 구독이 완전히 제거되었습니다.`
        };
      }

      // 특정 지역만 제거
      this.subscriptionManager.addSubscription({
        ...existingSubscription,
        targetRegions: newRegions
      });

      return {
        success: true,
        message: `✅ ${regionInfo.name} 지역 구독이 해제되었습니다.\n현재 구독 현황을 보려면 /list를 입력하세요.`
      };

    } catch (error) {
      logger.error('구독 해제 실패:', error);
      return {
        success: false,
        message: '구독 해제 중 오류가 발생했습니다. 관리자에게 문의하세요.',
        error: 'UNSUBSCRIBE_FAILED'
      };
    }
  }

  /**
   * 구독 목록 조회 명령어 처리
   */
  private async handleListCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    const subscription = this.subscriptionManager.getUserSubscription('telegram', params.userId);
    
    if (!subscription) {
      return {
        success: true,
        message: '📭 구독 중인 알림이 없습니다\\.\n\n새로 구독하려면:\n/subscribe \\<지역\\> \\[특보종류\\]\n\n예시:\n/subscribe seoul heat\n/subscribe busan'
      };
    }

    try {
      const summary = this.commandParser.formatSubscriptionSummary(subscription);
      const webToken = await this.generateWebToken(params.userId);
      
      return {
        success: true,
        message: `📋 내 구독 현황\n\n${summary}\n\n🔧 웹에서 상세 설정:\nhttps://weather.starryjeju.net/subscribe?token=${this.escapeMarkdown(webToken)}\n\n📝 명령어로 설정 변경:\n/subscribe \\<지역\\> \\- 지역 추가\n/unsubscribe \\<지역\\> \\- 지역 해제\n/quiet \\<시작\\> \\<끝\\> \\- 조용시간 설정`
      };

    } catch (error) {
      logger.error('구독 목록 조회 실패:', error);
      return {
        success: false,
        message: '구독 정보를 가져오는 중 오류가 발생했습니다.',
        error: 'LIST_FAILED'
      };
    }
  }

  /**
   * 조용한 시간대 설정 명령어 처리
   * 사용법: /quiet 22:00 08:00
   */
  private async handleQuietCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    if (params.args.length < 2) {
      return {
        success: false,
        message: '시작시간과 종료시간을 입력해주세요\\.\n사용법: /quiet \\<시작시간\\> \\<종료시간\\>\n예시: /quiet 22:00 08:00',
        error: 'MISSING_TIME_ARGS'
      };
    }

    const startTime = params.args[0];
    const endTime = params.args[1];

    if (!this.commandParser.validateTimeFormat(startTime) || !this.commandParser.validateTimeFormat(endTime)) {
      return {
        success: false,
        message: '잘못된 시간 형식입니다.\n형식: HH:MM (24시간)\n예시: /quiet 22:00 08:00',
        error: 'INVALID_TIME_FORMAT'
      };
    }

    const existingSubscription = this.subscriptionManager.getUserSubscription('telegram', params.userId);
    
    if (!existingSubscription) {
      return {
        success: false,
        message: '먼저 알림을 구독해야 합니다\\.\n/subscribe \\<지역\\>으로 구독을 추가하세요\\.',
        error: 'NO_SUBSCRIPTION'
      };
    }

    try {
      // 조용한 시간대 설정 업데이트
      this.subscriptionManager.addSubscription({
        ...existingSubscription,
        preferences: {
          ...existingSubscription.preferences,
          quietHours: {
            start: startTime,
            end: endTime
          }
        }
      });

      return {
        success: true,
        message: `🔇 조용한 시간대가 설정되었습니다.\n⏰ ${startTime} ~ ${endTime}\n\n이 시간대에는 알림을 받지 않습니다.\n설정을 해제하려면 웹 설정 페이지를 이용하세요.`
      };

    } catch (error) {
      logger.error('조용한 시간대 설정 실패:', error);
      return {
        success: false,
        message: '설정 중 오류가 발생했습니다. 관리자에게 문의하세요.',
        error: 'QUIET_HOURS_FAILED'
      };
    }
  }

  /**
   * 구독 상태 확인 명령어 처리
   */
  private async handleStatusCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      const stats = this.subscriptionManager.getStatistics();
      const userSubscription = this.subscriptionManager.getUserSubscription('telegram', params.userId);
      
      const statusMessage = `📊 기상특보 구독 시스템 현황\n\n` +
        `👥 전체 구독자: ${stats.totalSubscriptions}명\n` +
        `✅ 활성 구독자: ${stats.activeSubscriptions}명\n` +
        `📱 Telegram 사용자: ${stats.platformBreakdown.telegram || 0}명\n\n` +
        `${userSubscription ? '✅ 구독 중' : '❌ 구독 안함'}\n\n` +
        `자세한 설정은 /list를 입력하세요.`;

      return {
        success: true,
        message: statusMessage
      };

    } catch (error) {
      logger.error('상태 확인 실패:', error);
      return {
        success: false,
        message: '상태 확인 중 오류가 발생했습니다.',
        error: 'STATUS_FAILED'
      };
    }
  }

  /**
   * 도움말 명령어 처리
   */
  private async handleHelpCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    const helpMessage = this.commandParser.generateHelpMessage('telegram');
    
    return {
      success: true,
      message: helpMessage
    };
  }

  /**
   * 사용자 인증 토큰 생성 (웹 설정 페이지 연동용)
   */
  async generateAuthToken(userId: string): Promise<UserAuthToken> {
    const token = this.generateSecureToken(userId);
    const authToken: UserAuthToken = {
      token,
      platform: 'telegram',
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간
      createdAt: new Date()
    };

    logger.info(`Telegram 웹 토큰 생성: ${userId}`);
    return authToken;
  }

  /**
   * 구독 설정 변경 알림
   */
  async notifySubscriptionChange(userId: string, change: string): Promise<void> {
    try {
      if (this.botToken) {
        // 실제 Telegram Bot API 호출
        await this.sendTelegramMessage(userId, `🔔 구독 설정이 변경되었습니다.\n${change}`);
      } else {
        logger.info(`[Telegram] 구독 변경 알림 (Mock): ${userId} - ${change}`);
      }
    } catch (error) {
      logger.error('Telegram 알림 전송 실패:', error);
    }
  }

  /**
   * 도움말 메시지 반환
   */
  getHelpMessage(): string {
    return this.commandParser.generateHelpMessage('telegram');
  }

  // Private helper methods

  private generateSecureToken(userId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const userHash = this.hashUserId(userId);
    
    return `TG_${timestamp}_${userHash}_${random}`;
  }

  private hashUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async generateWebToken(userId: string): Promise<string> {
    // WebSubscriptionInterface가 있으면 데이터베이스 기반 토큰 생성
    if (this.webInterface) {
      try {
        const subscription = this.subscriptionManager.getUserSubscription('telegram', userId);
        const displayName = subscription?.displayName || `Telegram User ${userId}`;

        const tokenInfo = await this.webInterface.generateAccessToken('telegram', userId, displayName);
        logger.info(`Telegram 웹 토큰 생성 (DB): ${userId}`);
        return tokenInfo.token;
      } catch (error) {
        logger.error('데이터베이스 토큰 생성 실패, 폴백 사용:', error);
        // 실패 시 폴백
      }
    }

    // 폴백: 임시 토큰 생성 (하위 호환성)
    const authToken = await this.generateAuthToken(userId);
    return authToken.token;
  }

  private async sendTelegramMessage(userId: string, message: string): Promise<void> {
    if (!this.botToken) {
      throw new Error('Telegram Bot Token이 설정되지 않았습니다');
    }

    // 실제 Telegram Bot API 호출 로직
    // 현재는 로깅만 수행 (Phase 2에서 실제 구현)
    logger.info(`[Telegram API] ${userId}: ${message}`);
  }

  /**
   * Telegram Markdown에서 특수 문자 이스케이프
   */
  private escapeMarkdown(text: string): string {
    // Telegram Markdown에서 이스케이프가 필요한 문자들
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}