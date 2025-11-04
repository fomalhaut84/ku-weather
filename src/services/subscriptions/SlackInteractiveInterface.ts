/**
 * Slack 인터랙티브 메시지 구독 인터페이스
 * 
 * Slack의 Interactive Components를 활용한 구독 관리 시스템
 */

import { SubscriptionManager, UserSubscription } from '../notifications/SubscriptionManager';
import { WeatherAlert } from '../../types/weather';
import { logger } from '../../utils/logger';
import {
  PlatformSubscriptionInterface,
  InteractiveMessageInterface,
  SubscriptionCommandParams,
  SubscriptionCommandResult,
  UserAuthToken
} from './interfaces';
import { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from './CommandParser';
import { WebSubscriptionInterface } from './WebSubscriptionInterface';

/**
 * Slack 버튼 액션 페이로드
 */
interface SlackButtonPayload {
  type: string;
  user: { id: string; name?: string };
  channel: { id: string; name?: string };
  actions: Array<{
    name: string;
    type: string;
    value: string;
  }>;
  callback_id: string;
  team: { id: string; domain: string };
  original_message: any;
  response_url: string;
  trigger_id: string;
}

/**
 * Slack 메시지 블록 요소
 */
interface SlackMessageBlock {
  type: string;
  text?: { type: string; text: string };
  accessory?: any;
  elements?: any[];
}

/**
 * Slack 인터랙티브 구독 인터페이스 구현
 */
export class SlackInteractiveInterface implements PlatformSubscriptionInterface, InteractiveMessageInterface {
  readonly platformName = 'slack';

  private subscriptionManager: SubscriptionManager;
  private commandParser: CommonCommandParser;
  private webhookUrl?: string;
  private webInterface?: WebSubscriptionInterface;

  constructor(
    subscriptionManager: SubscriptionManager,
    webhookUrl?: string,
    webInterface?: WebSubscriptionInterface
  ) {
    this.subscriptionManager = subscriptionManager;
    this.commandParser = new CommonCommandParser();
    this.webhookUrl = webhookUrl;
    this.webInterface = webInterface;
    logger.info('Slack 인터랙티브 인터페이스 초기화 완료');
  }

  /**
   * WebSubscriptionInterface 설정 (나중에 주입)
   */
  setWebInterface(webInterface: WebSubscriptionInterface): void {
    this.webInterface = webInterface;
    logger.info('Slack 인터페이스에 WebInterface 연결 완료');
  }

  /**
   * Slack 명령어 처리 (제한적 지원)
   * 주로 웹 토큰 생성 및 기본 정보 제공용
   */
  async handleCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      logger.debug(`Slack 명령어 처리: ${params.command}`);

      switch (params.command) {
        case 'help':
          return await this.handleHelpCommand(params);
          
        case 'status':
          return await this.handleStatusCommand(params);
          
        case 'settings':
          return await this.handleSettingsCommand(params);
          
        default:
          return {
            success: false,
            message: 'Slack에서는 인터랙티브 버튼을 사용하여 구독을 관리하세요.\n또는 웹 설정 페이지를 이용해주세요.',
            error: 'USE_INTERACTIVE_BUTTONS'
          };
      }

    } catch (error) {
      logger.error('Slack 명령어 처리 중 오류:', error);
      return {
        success: false,
        message: '명령어 처리 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * 구독 설정용 인터랙티브 메시지 생성
   */
  async createSubscriptionMessage(userId: string, currentSettings?: UserSubscription): Promise<any> {
    try {
      const webToken = await this.generateWebToken(userId);
      const hasSubscription = !!currentSettings;

      const blocks: SlackMessageBlock[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🌦️ 기상특보 개인 구독 설정'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: hasSubscription 
              ? `현재 구독 현황:\n${this.formatCurrentSubscription(currentSettings!)}`
              : '아직 개인 구독을 설정하지 않았습니다.'
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🌍 지역 선택' },
              style: 'primary',
              action_id: 'select_regions',
              value: `region_${userId}`
            },
            {
              type: 'button', 
              text: { type: 'plain_text', text: '⚠️ 특보 선택' },
              action_id: 'select_warnings',
              value: `warning_${userId}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '⚙️ 웹에서 설정' },
              action_id: 'open_web_settings',
              url: `https://weather.starryjeju.net/subscribe?token=${webToken}`
            }
          ]
        }
      ];

      if (hasSubscription) {
        blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🔇 조용시간 설정' },
              action_id: 'set_quiet_hours',
              value: `quiet_${userId}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '📊 현재 설정 보기' },
              action_id: 'view_settings',
              value: `view_${userId}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '🗑️ 구독 해제' },
              style: 'danger',
              action_id: 'unsubscribe_all',
              value: `unsubscribe_${userId}`,
              confirm: {
                title: { type: 'plain_text', text: '구독 해제 확인' },
                text: { type: 'plain_text', text: '정말로 모든 개인 구독을 해제하시겠습니까?' },
                confirm: { type: 'plain_text', text: '해제' },
                deny: { type: 'plain_text', text: '취소' }
              }
            }
          ]
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `💡 *팁:* 웹 설정 페이지에서 더 자세한 설정이 가능합니다. 토큰: \`${webToken.substring(0, 20)}...\``
          }
        ]
      });

      return {
        blocks,
        text: '기상특보 개인 구독 설정' // fallback text
      };

    } catch (error) {
      logger.error('Slack 인터랙티브 메시지 생성 실패:', error);
      return {
        text: '구독 설정 메시지를 생성하는 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * 버튼 클릭 이벤트 처리
   */
  async handleButtonAction(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    try {
      const userId = payload.user.id;
      const action = payload.actions[0];
      const actionId = action.name || action.value;

      logger.debug(`Slack 버튼 액션: ${actionId} by ${userId}`);

      switch (action.name) {
        case 'select_regions':
          return await this.handleRegionSelection(payload);
          
        case 'select_warnings':
          return await this.handleWarningSelection(payload);
          
        case 'set_quiet_hours':
          return await this.handleQuietHoursSetup(payload);
          
        case 'view_settings':
          return await this.handleViewSettings(payload);
          
        case 'unsubscribe_all':
          return await this.handleUnsubscribeAll(payload);
          
        default:
          return {
            success: false,
            message: '알 수 없는 액션입니다.',
            error: 'UNKNOWN_ACTION'
          };
      }

    } catch (error) {
      logger.error('Slack 버튼 액션 처리 실패:', error);
      return {
        success: false,
        message: '액션 처리 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * 설정 변경 확인 메시지 생성
   */
  createConfirmationMessage(result: SubscriptionCommandResult): any {
    const emoji = result.success ? '✅' : '❌';
    const color = result.success ? 'good' : 'danger';

    return {
      attachments: [{
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} ${result.message}`
            }
          }
        ]
      }],
      text: result.message
    };
  }

  /**
   * 특보 알림과 함께 구독 설정 버튼 추가
   */
  enhanceAlertMessageWithSubscription(alertMessage: any, userId?: string): any {
    if (!userId) return alertMessage;

    const subscriptionBlock = {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '⚙️ 개인 구독 설정' },
          action_id: 'setup_personal_subscription',
          value: `setup_${userId}`
        }
      ]
    };

    // 기존 메시지에 구독 설정 버튼 추가
    if (alertMessage.blocks) {
      alertMessage.blocks.push({ type: 'divider' });
      alertMessage.blocks.push(subscriptionBlock);
    } else if (alertMessage.attachments) {
      // Legacy attachment 방식
      alertMessage.attachments.push({
        color: 'good',
        blocks: [subscriptionBlock]
      });
    }

    return alertMessage;
  }

  // PlatformSubscriptionInterface 구현

  async generateAuthToken(userId: string): Promise<UserAuthToken> {
    const token = await this.generateWebToken(userId);
    return {
      token,
      platform: 'slack',
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간
      createdAt: new Date()
    };
  }

  async notifySubscriptionChange(userId: string, change: string): Promise<void> {
    try {
      if (this.webhookUrl) {
        // Slack 개인 DM은 Bot API가 필요하므로 채널 메시지로 대체
        logger.info(`[Slack] 구독 변경 알림: ${userId} - ${change}`);
      } else {
        logger.info(`[Slack] 구독 변경 알림 (Mock): ${userId} - ${change}`);
      }
    } catch (error) {
      logger.error('Slack 구독 변경 알림 실패:', error);
    }
  }

  getHelpMessage(): string {
    return `🌦️ Slack 기상특보 개인 구독\n\n` +
      `Slack에서는 인터랙티브 버튼을 통해 쉽게 구독을 관리할 수 있습니다.\n\n` +
      `📝 이용 방법:\n` +
      `1. 기상특보 메시지의 [개인 구독 설정] 버튼 클릭\n` +
      `2. 원하는 지역과 특보 종류 선택\n` +
      `3. 조용한 시간대 등 세부 설정\n\n` +
      `🌐 웹 설정: 더 자세한 설정은 웹 페이지에서 가능합니다.\n` +
      `💬 Slack에서 직접 명령어는 제한적으로 지원됩니다.`;
  }

  // Private helper methods

  private async handleHelpCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    return {
      success: true,
      message: this.getHelpMessage()
    };
  }

  private async handleStatusCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      const stats = this.subscriptionManager.getStatistics();
      const userSubscription = this.subscriptionManager.getUserSubscription('slack', params.userId);
      
      const message = `📊 기상특보 구독 현황\n\n` +
        `👥 전체 구독자: ${stats.totalSubscriptions}명\n` +
        `✅ 활성 구독자: ${stats.activeSubscriptions}명\n` +
        `💬 Slack 사용자: ${stats.platformBreakdown.slack || 0}명\n\n` +
        `${userSubscription ? '✅ 개인 구독 설정됨' : '❌ 개인 구독 없음'}\n\n` +
        `자세한 설정은 인터랙티브 버튼을 이용하세요.`;

      return { success: true, message };
    } catch (error) {
      return {
        success: false,
        message: '상태 확인 중 오류가 발생했습니다.',
        error: 'STATUS_FAILED'
      };
    }
  }

  private async handleSettingsCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    const webToken = await this.generateWebToken(params.userId);
    const webUrl = `https://weather.starryjeju.net/subscribe?token=${webToken}`;
    
    const message = `⚙️ 개인 구독 설정\n\n` +
      `🌐 웹에서 설정: ${webUrl}\n\n` +
      `💡 또는 기상특보 메시지의 버튼을 이용하세요.\n` +
      `토큰 (24시간 유효): \`${webToken}\``;

    return { success: true, message };
  }

  private async handleRegionSelection(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    // 실제로는 Slack Modal을 열어서 지역 선택 UI 제공
    // 현재는 간단한 응답 메시지 반환
    const userId = payload.user.id;
    const webToken = await this.generateWebToken(userId);
    
    return {
      success: true,
      message: `🌍 지역 선택\n\n웹 설정 페이지에서 원하는 지역을 선택하세요:\nhttps://weather.starryjeju.net/subscribe?token=${webToken}#regions`
    };
  }

  private async handleWarningSelection(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    const userId = payload.user.id;
    const webToken = await this.generateWebToken(userId);
    
    return {
      success: true,
      message: `⚠️ 특보 종류 선택\n\n웹 설정 페이지에서 원하는 특보를 선택하세요:\nhttps://weather.starryjeju.net/subscribe?token=${webToken}#warnings`
    };
  }

  private async handleQuietHoursSetup(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    const userId = payload.user.id;
    const webToken = await this.generateWebToken(userId);
    
    return {
      success: true,
      message: `🔇 조용한 시간대 설정\n\n웹 설정 페이지에서 조용한 시간대를 설정하세요:\nhttps://weather.starryjeju.net/subscribe?token=${webToken}#quiet`
    };
  }

  private async handleViewSettings(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    const userId = payload.user.id;
    const subscription = this.subscriptionManager.getUserSubscription('slack', userId);
    
    if (!subscription) {
      return {
        success: false,
        message: '설정된 개인 구독이 없습니다.',
        error: 'NO_SUBSCRIPTION'
      };
    }

    const summary = this.commandParser.formatSubscriptionSummary(subscription);
    const webToken = await this.generateWebToken(userId);
    
    return {
      success: true,
      message: `📋 현재 구독 설정\n\n${summary}\n\n🔧 설정 변경: https://weather.starryjeju.net/subscribe?token=${webToken}`
    };
  }

  private async handleUnsubscribeAll(payload: SlackButtonPayload): Promise<SubscriptionCommandResult> {
    const userId = payload.user.id;
    const subscription = this.subscriptionManager.getUserSubscription('slack', userId);
    
    if (!subscription) {
      return {
        success: false,
        message: '해제할 구독이 없습니다.',
        error: 'NO_SUBSCRIPTION'
      };
    }

    try {
      const success = this.subscriptionManager.removeSubscription(subscription.id);
      
      if (success) {
        return {
          success: true,
          message: '✅ 개인 구독이 모두 해제되었습니다.\n채널의 전체 알림은 계속 수신됩니다.'
        };
      } else {
        return {
          success: false,
          message: '구독 해제에 실패했습니다.',
          error: 'UNSUBSCRIBE_FAILED'
        };
      }
    } catch (error) {
      logger.error('Slack 구독 해제 실패:', error);
      return {
        success: false,
        message: '구독 해제 중 오류가 발생했습니다.',
        error: 'UNSUBSCRIBE_ERROR'
      };
    }
  }

  private formatCurrentSubscription(subscription: UserSubscription): string {
    const regions = subscription.targetRegions.length > 0
      ? subscription.targetRegions.map(code => this.getRegionName(code)).join(', ')
      : '전국';
    
    const warnings = subscription.warningTypes && subscription.warningTypes.length > 0
      ? subscription.warningTypes.map(code => this.getWarningTypeName(code)).join(', ')
      : '전체';

    return `*지역:* ${regions}\n*특보:* ${warnings}\n*상태:* ${subscription.enabled ? '활성' : '비활성'}`;
  }

  private getRegionName(code: string): string {
    const region = Object.values(REGION_MAPPINGS).find(r => r.code === code);
    return region ? region.name : code;
  }

  private getWarningTypeName(code: string): string {
    const warning = Object.values(WARNING_TYPE_MAPPINGS).find(w => w.code === code);
    return warning ? warning.name : code;
  }

  private async generateWebToken(userId: string): Promise<string> {
    // WebSubscriptionInterface가 있으면 데이터베이스 기반 토큰 생성
    if (this.webInterface) {
      try {
        const subscription = this.subscriptionManager.getUserSubscription('slack', userId);
        const displayName = subscription?.displayName || `Slack User ${userId}`;

        const tokenInfo = await this.webInterface.generateAccessToken('slack', userId, displayName);
        logger.info(`Slack 웹 토큰 생성 (DB): ${userId}`);
        return tokenInfo.token;
      } catch (error) {
        logger.error('데이터베이스 토큰 생성 실패, 폴백 사용:', error);
        // 실패 시 폴백
      }
    }

    // 폴백: 임시 토큰 생성 (하위 호환성)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const userHash = this.hashUserId(userId);

    return `SL_${timestamp}_${userHash}_${random}`;
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
}