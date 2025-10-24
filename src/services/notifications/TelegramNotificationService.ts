import TelegramBot from 'node-telegram-bot-api';
import { NotificationService, NotificationResult, TelegramConfig } from './interfaces';
import { WeatherAlert, AlertChange, AlertChangeType } from '../../types/weather';
import { logger } from '../../utils/logger';
import {
  formatDateTime,
  getWarningTypeName,
  getWarningTypeEmoji,
  getWarningLevelName,
  getWarningLevelEmoji,
  generateWeatherSearchUrl
} from '../../utils/messageFormatter';
import { TelegramSubscriptionInterface } from '../subscriptions/TelegramSubscriptionInterface';
import { SubscriptionCommandParams } from '../subscriptions/interfaces';
import { SubscriptionManager } from './SubscriptionManager';

export class TelegramNotificationService implements NotificationService {
  readonly platformName = 'telegram';
  private bot: TelegramBot;
  /**
   * @deprecated 단일 chatId는 deprecated됩니다. 구독 시스템을 사용하세요.
   */
  private legacyChatId?: string;
  private subscriptionInterface: TelegramSubscriptionInterface;
  private subscriptionManager: SubscriptionManager;
  private isInitialized: boolean = false;
  private webhookUrl?: string;
  private webhookSecret?: string;

  constructor(private config: TelegramConfig & { webhookUrl?: string }) {
    // Webhook 모드로 초기화 (polling 비활성화)
    // IPv4 강제 사용 + 타임아웃 설정으로 연결 안정성 향상
    // 이유: Node.js의 Happy Eyeballs 알고리즘이 IPv6를 먼저 시도하다가
    // ENETUNREACH로 실패하고 짧은 타임아웃(기본 5초)으로 인해 IPv4도 ETIMEDOUT 발생
    this.bot = new TelegramBot(config.botToken, {
      polling: false,
      request: {
        timeout: 60000,  // 60 second timeout
        family: 4,       // Force IPv4 only (no IPv6)
        agentOptions: {
          family: 4      // Ensure HTTP agent also uses IPv4
        }
      } as any  // Type assertion for request library options
    });

    // Legacy chatId support (하위 호환성)
    if (config.chatId) {
      this.legacyChatId = config.chatId;
      logger.warn('Telegram chatId is deprecated. Please use subscription system instead.');
    }

    this.webhookUrl = config.webhookUrl;
    this.webhookSecret = config.webhookSecret;

    // Initialize subscription manager
    this.subscriptionManager = new SubscriptionManager();
    this.subscriptionInterface = new TelegramSubscriptionInterface(
      this.subscriptionManager,
      config.botToken
    );

    // Legacy chatId를 자동으로 구독으로 전환
    if (this.legacyChatId) {
      this.subscriptionManager.addSubscription({
        platform: 'telegram',
        userId: this.legacyChatId,
        targetRegions: [], // 전체 지역
        warningTypes: [],  // 모든 특보
        enabled: true,
        displayName: 'Legacy Chat (자동 전환)'
      });
      logger.info(`Legacy chatId ${this.legacyChatId} automatically converted to subscription`);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Telegram Bot already initialized, skipping...');
      return;
    }

    try {
      // Webhook URL이 설정된 경우에만 setWebhook 호출
      if (this.webhookUrl) {
        const webhookOptions: TelegramBot.SetWebHookOptions = {};
        if (this.webhookSecret) {
          webhookOptions.secret_token = this.webhookSecret;
        }

        await this.bot.setWebHook(this.webhookUrl, webhookOptions);
        logger.info(`Telegram Bot webhook set to: ${this.webhookUrl}`);
      } else {
        // Webhook URL이 없으면 기존 webhook 제거
        await this.bot.deleteWebHook();
        logger.warn('Telegram Bot webhook URL not configured, webhook disabled');
      }

      const me = await this.bot.getMe();
      logger.info(`Telegram Bot initialized: @${me.username} (Webhook mode)`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Telegram Bot:', error);
      throw new Error(`Telegram Bot initialization failed: ${error}`);
    }
  }

  /**
   * Webhook으로 수신한 업데이트 처리
   * HTTP 서버의 /telegram/webhook 엔드포인트에서 호출
   */
  async processWebhookUpdate(update: TelegramBot.Update): Promise<void> {
    try {
      // Handle text messages (commands)
      if (update.message && update.message.text) {
        await this.handleMessage(update.message);
      }

      // Handle callback queries (inline keyboard buttons)
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      logger.error('Error processing Telegram webhook update:', error);
    }
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.text || !msg.text.startsWith('/')) {
      return;
    }

    const chatId = msg.chat.id.toString();
    // Use chatId (not user ID) for subscriptions to support group chats
    // This ensures notifications are sent to the chat room, not individual users

    // Parse command
    const [command, ...args] = msg.text.slice(1).split(' ');

    const params: SubscriptionCommandParams = {
      platform: 'telegram',
      userId: chatId, // Use chatId for group chat support
      command: command as any,
      args,
      rawMessage: msg.text
    };

    try {
      const result = await this.subscriptionInterface.handleCommand(params);
      await this.bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error handling Telegram command:', error);
      await this.bot.sendMessage(chatId, '❌ 명령어 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!query.data) return;

    const chatId = query.message?.chat.id.toString();
    // Use chatId (not user ID) for subscriptions to support group chats

    if (!chatId) return;

    try {
      await this.bot.answerCallbackQuery(query.id);

      // Parse callback data (format: "action:param1:param2")
      const [action, ...params] = query.data.split(':');

      const commandParams: SubscriptionCommandParams = {
        platform: 'telegram',
        userId: chatId, // Use chatId for group chat support
        command: action as any,
        args: params,
        rawMessage: query.data
      };

      const result = await this.subscriptionInterface.handleCommand(commandParams);

      // Send new message with result
      await this.bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error handling Telegram callback:', error);
      if (chatId) {
        await this.bot.sendMessage(chatId, '❌ 요청 처리 중 오류가 발생했습니다.');
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const me = await this.bot.getMe();
      const webhookInfo = await this.bot.getWebHookInfo();

      logger.info(`Telegram Bot health check passed: @${me.username}`);
      logger.debug(`Webhook info: ${webhookInfo.url || 'not set'}, pending updates: ${webhookInfo.pending_update_count}`);

      return true;
    } catch (error) {
      logger.error('Telegram Bot health check failed:', error);
      return false;
    }
  }

  validateConfig(): boolean {
    if (!this.config.botToken) {
      logger.error('Telegram configuration missing: botToken not provided');
      return false;
    }

    // chatId is now optional (deprecated)
    if (this.config.chatId) {
      logger.warn('Telegram chatId is deprecated. It will be automatically converted to subscription.');
    }

    logger.info('Telegram configuration validated successfully');
    return true;
  }

  async sendAlert(alert: WeatherAlert): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // 구독 기반 전송: 관련 구독자 조회
      const allSubscriptions = this.subscriptionManager.getRelevantSubscriptions(alert);

      // Telegram 플랫폼만 필터링
      const subscriptions = allSubscriptions.filter(sub => sub.platform === 'telegram');

      if (subscriptions.length === 0) {
        logger.warn(`Telegram 알림: 구독자 없음 - ${alert.REG_NAME} ${alert.WRN}`);
        return {
          success: true,
          platform: 'telegram',
          responseTime: Date.now() - startTime
        };
      }

      const message = this.formatWeatherAlert(alert);

      const options = {
        parse_mode: 'Markdown' as const,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 상세보기', url: 'https://weather.starryjeju.net' },
              { text: '🔕 알림설정', callback_data: 'settings:notifications' }
            ]
          ]
        }
      };

      // 모든 구독자에게 전송
      let successCount = 0;
      let failureCount = 0;

      for (const subscription of subscriptions) {
        try {
          await this.bot.sendMessage(subscription.userId, message, options);
          successCount++;
        } catch (error) {
          logger.error(`Telegram 알림 전송 실패 (userId: ${subscription.userId}):`, error);
          failureCount++;
        }
      }

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 알림 전송 완료: ${alert.REG_NAME} ${alert.WRN} - 성공 ${successCount}/${subscriptions.length} (${responseTime}ms)`);

      return {
        success: failureCount === 0,
        platform: 'telegram',
        responseTime,
        error: failureCount > 0 ? `${failureCount}/${subscriptions.length} 전송 실패` : undefined
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Telegram 알림 전송 실패:', error);

      return {
        success: false,
        platform: 'telegram',
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async sendAlertChange(change: AlertChange): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // 구독 기반 전송: 관련 구독자 조회
      const allSubscriptions = this.subscriptionManager.getRelevantSubscriptionsForChange(change);

      // Telegram 플랫폼만 필터링
      const subscriptions = allSubscriptions.filter(sub => sub.platform === 'telegram');

      if (subscriptions.length === 0) {
        logger.warn(`Telegram 변동 알림: 구독자 없음 - ${change.type} ${change.current?.regionName || change.previous?.regionName}`);
        return {
          success: true,
          platform: 'telegram',
          responseTime: Date.now() - startTime
        };
      }

      const message = this.formatAlertChange(change);
      const color = this.getChangeColor(change.type);

      const options = {
        parse_mode: 'Markdown' as const,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 현황보기', url: 'https://weather.starryjeju.net' },
              { text: '⚙️ 설정', callback_data: 'settings:main' }
            ]
          ]
        }
      };

      // 모든 구독자에게 전송
      let successCount = 0;
      let failureCount = 0;

      for (const subscription of subscriptions) {
        try {
          await this.bot.sendMessage(subscription.userId, `${color} ${message}`, options);
          successCount++;
        } catch (error) {
          logger.error(`Telegram 변동 알림 전송 실패 (userId: ${subscription.userId}):`, error);
          failureCount++;
        }
      }

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 변동 알림 전송 완료: ${change.type} - ${change.current?.regionName || change.previous?.regionName} - 성공 ${successCount}/${subscriptions.length} (${responseTime}ms)`);

      return {
        success: failureCount === 0,
        platform: 'telegram',
        responseTime,
        error: failureCount > 0 ? `${failureCount}/${subscriptions.length} 전송 실패` : undefined
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Telegram 변동 알림 전송 실패:', error);

      return {
        success: false,
        platform: 'telegram',
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (changes.length === 0) {
        return [{
          success: true,
          platform: 'telegram',
          responseTime: Date.now() - startTime
        }];
      }

      // Single change - use individual format
      if (changes.length === 1) {
        return [await this.sendAlertChange(changes[0])];
      }

      // Multiple changes - build per-subscriber filtered messages
      // Map userId -> relevant changes for that subscriber
      const subscriberChanges = new Map<string, AlertChange[]>();

      for (const change of changes) {
        const subscriptions = this.subscriptionManager.getRelevantSubscriptionsForChange(change);
        for (const sub of subscriptions) {
          if (sub.platform === 'telegram') {
            if (!subscriberChanges.has(sub.userId)) {
              subscriberChanges.set(sub.userId, []);
            }
            subscriberChanges.get(sub.userId)!.push(change);
          }
        }
      }

      if (subscriberChanges.size === 0) {
        logger.warn(`Telegram 배치 변동 알림: 구독자 없음 - ${changes.length}건`);
        return [{
          success: true,
          platform: 'telegram',
          responseTime: Date.now() - startTime
        }];
      }

      // 각 구독자에게 해당 구독자의 관심사에 맞는 변경사항만 포함된 배치 메시지 전송
      let successCount = 0;
      let failureCount = 0;

      for (const [userId, userChanges] of subscriberChanges.entries()) {
        try {
          // 해당 구독자의 관련 변경사항만으로 메시지 생성
          const message = this.formatBatchAlertChanges(userChanges);

          const options = {
            parse_mode: 'Markdown' as const,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: `📊 전체현황 (${userChanges.length}건)`, url: 'https://weather.starryjeju.net' },
                  { text: '🔔 알림설정', callback_data: 'settings:notifications' }
                ]
              ]
            }
          };

          await this.bot.sendMessage(userId, message, options);
          successCount++;
        } catch (error) {
          logger.error(`Telegram 배치 변동 알림 전송 실패 (userId: ${userId}):`, error);
          failureCount++;
        }
      }

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 배치 변동 알림 전송 완료: ${changes.length}건, 수신자 ${successCount}/${subscriberChanges.size} (${responseTime}ms)`);

      return [{
        success: failureCount === 0,
        platform: 'telegram',
        responseTime,
        error: failureCount > 0 ? `${failureCount}/${subscriberChanges.size} 전송 실패` : undefined
      }];
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Telegram 배치 변동 알림 전송 실패:', error);

      return [{
        success: false,
        platform: 'telegram',
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      }];
    }
  }

  private formatWeatherAlert(alert: WeatherAlert): string {
    const env = this.config.nodeEnv === 'development' ? '[DEV] ' :
               this.config.nodeEnv === 'staging' ? '[STAGING] ' : '';

    const weatherEmoji = getWarningTypeEmoji(alert.WRN);
    const levelEmoji = getWarningLevelEmoji(alert.LVL);
    const warningTypeName = getWarningTypeName(alert.WRN);
    const levelName = getWarningLevelName(alert.LVL);
    const weatherUrl = generateWeatherSearchUrl(alert.REG_NAME);

    return `${env}${weatherEmoji} *기상특보 발표*

📍 *지역*: [${alert.REG_NAME}](${weatherUrl})
⚠️ *특보종류*: ${warningTypeName}
📊 *수준*: ${levelEmoji} ${levelName}
📅 *발표*: ${formatDateTime(alert.TM_FC)}
🕐 *발효*: ${formatDateTime(alert.TM_EF)}

_한국 기상청 제공_`;
  }

  private formatAlertChange(change: AlertChange): string {
    const env = this.config.nodeEnv === 'development' ? '[DEV] ' :
               this.config.nodeEnv === 'staging' ? '[STAGING] ' : '';

    const emoji = this.getChangeEmoji(change.type);
    const title = this.getChangeTitle(change.type);

    const regionName = change.current?.regionName || change.previous?.regionName || '알 수 없음';
    const warningType = change.current?.warningType || change.previous?.warningType || '알 수 없음';
    const warningTypeName = getWarningTypeName(warningType);
    const weatherUrl = generateWeatherSearchUrl(regionName);

    let details = `📍 *지역*: [${regionName}](${weatherUrl})\n⚠️ *특보종류*: ${warningTypeName}`;

    switch (change.type) {
      case 'NEW':
        if (change.current) {
          const levelEmoji = getWarningLevelEmoji(change.current.level);
          const levelName = getWarningLevelName(change.current.level);
          details += `\n📊 *수준*: ${levelEmoji} ${levelName}`;
        }
        break;
      case 'RESOLVED':
        if (change.previous) {
          const levelEmoji = getWarningLevelEmoji(change.previous.level);
          const levelName = getWarningLevelName(change.previous.level);
          details += `\n❌ *해제수준*: ${levelEmoji} ${levelName}`;
        }
        break;
      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        if (change.previous && change.current) {
          const prevLevelName = getWarningLevelName(change.previous.level);
          const currLevelName = getWarningLevelName(change.current.level);
          details += `\n📈 *수준변화*: ${prevLevelName} → ${currLevelName}`;
        }
        break;
      case 'TIME_EXTENDED':
        if (change.current) {
          details += `\n⏰ *발효시각*: ${formatDateTime(change.current.effectiveAt)}`;
        }
        break;
      case 'MODIFIED':
        if (change.current) {
          const levelEmoji = getWarningLevelEmoji(change.current.level);
          const levelName = getWarningLevelName(change.current.level);
          details += `\n📊 *수준*: ${levelEmoji} ${levelName}`;
        }
        break;
    }

    // 발표시각과 발효시각 추가 (Slack과 일관성 유지)
    const alert = change.current || change.previous;
    if (alert) {
      details += `\n📅 *발표*: ${formatDateTime(alert.announcedAt)}`;
      details += `\n🕐 *발효*: ${formatDateTime(alert.effectiveAt)}`;
    }

    return `${env}${emoji} *${title}*

${details}

_한국 기상청_`;
  }

  private formatBatchAlertChanges(changes: AlertChange[]): string {
    const env = this.config.nodeEnv === 'development' ? '[DEV] ' :
               this.config.nodeEnv === 'staging' ? '[STAGING] ' : '';

    let message = `${env}🌦️ *기상특보 변동 알림 (${changes.length}건)*\n\n`;

    changes.forEach((change, index) => {
      const emoji = this.getChangeEmoji(change.type);
      const title = this.getChangeTitle(change.type);
      const regionName = change.current?.regionName || change.previous?.regionName || '알 수 없음';
      const warningType = change.current?.warningType || change.previous?.warningType || '알 수 없음';
      const warningTypeName = getWarningTypeName(warningType);
      const weatherUrl = generateWeatherSearchUrl(regionName);

      message += `${emoji} *${title}*\n`;
      message += `📍 [${regionName}](${weatherUrl}) | ⚠️ ${warningTypeName}`;

      switch (change.type) {
        case 'NEW':
          if (change.current) {
            const levelEmoji = getWarningLevelEmoji(change.current.level);
            const levelName = getWarningLevelName(change.current.level);
            message += ` | 📊 ${levelEmoji} ${levelName}`;
          }
          break;
        case 'RESOLVED':
          if (change.previous) {
            const levelEmoji = getWarningLevelEmoji(change.previous.level);
            const levelName = getWarningLevelName(change.previous.level);
            message += ` | ❌ 해제수준: ${levelEmoji} ${levelName}`;
          }
          break;
        case 'LEVEL_UP':
        case 'LEVEL_DOWN':
          if (change.previous && change.current) {
            const prevLevelName = getWarningLevelName(change.previous.level);
            const currLevelName = getWarningLevelName(change.current.level);
            message += ` | 📈 ${prevLevelName} → ${currLevelName}`;
          }
          break;
        case 'TIME_EXTENDED':
          message += ` | ⏰ 시간연장`;
          break;
        case 'MODIFIED':
          if (change.current) {
            const levelEmoji = getWarningLevelEmoji(change.current.level);
            const levelName = getWarningLevelName(change.current.level);
            message += ` | 📊 ${levelEmoji} ${levelName}`;
          }
          break;
      }

      if (index < changes.length - 1) {
        message += '\n\n';
      }
    });

    message += `\n\n_한국 기상청_`;
    return message;
  }

  private getChangeEmoji(type: AlertChangeType): string {
    const emojiMap: Record<AlertChangeType, string> = {
      'NEW': '🆕',
      'RESOLVED': '✅',
      'LEVEL_UP': '⬆️',
      'LEVEL_DOWN': '⬇️',
      'TIME_EXTENDED': '⏰',
      'MODIFIED': '🔄'
    };
    return emojiMap[type];
  }

  private getChangeTitle(type: AlertChangeType): string {
    const titleMap: Record<AlertChangeType, string> = {
      'NEW': '신규 발표',
      'RESOLVED': '특보 해제',
      'LEVEL_UP': '수준 상향',
      'LEVEL_DOWN': '수준 하향',
      'TIME_EXTENDED': '시간 연장',
      'MODIFIED': '내용 변경'
    };
    return titleMap[type];
  }

  private getChangeColor(type: AlertChangeType): string {
    // Telegram doesn't support colors, so we use emojis for visual distinction
    return this.getChangeEmoji(type);
  }

  async stop(): Promise<void> {
    try {
      // Webhook 모드에서는 webhook만 제거
      await this.bot.deleteWebHook();
      this.isInitialized = false;
      logger.info('Telegram Bot webhook removed successfully');
    } catch (error) {
      logger.error('Error removing Telegram Bot webhook:', error);
    }
  }
}
