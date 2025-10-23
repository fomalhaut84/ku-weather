import TelegramBot from 'node-telegram-bot-api';
import { NotificationService, NotificationResult, TelegramConfig } from './interfaces';
import { WeatherAlert, AlertChange, AlertChangeType } from '../../types/weather';
import { logger } from '../../utils/logger';
import { TelegramSubscriptionInterface } from '../subscriptions/TelegramSubscriptionInterface';
import { SubscriptionCommandParams } from '../subscriptions/interfaces';
import { SubscriptionManager } from './SubscriptionManager';

export class TelegramNotificationService implements NotificationService {
  readonly platformName = 'telegram';
  private bot: TelegramBot;
  private chatId: string;
  private subscriptionInterface: TelegramSubscriptionInterface;
  private subscriptionManager: SubscriptionManager;
  private isInitialized: boolean = false;

  constructor(private config: TelegramConfig) {
    // 수동 폴링 제어로 409 Conflict 방지
    this.bot = new TelegramBot(config.botToken, {
      polling: {
        autoStart: false,
        params: { timeout: 10 }
      }
    });
    this.chatId = config.chatId;

    // Initialize subscription manager
    this.subscriptionManager = new SubscriptionManager();
    this.subscriptionInterface = new TelegramSubscriptionInterface(
      this.subscriptionManager,
      config.botToken
    );

    this.setupBotHandlers();
  }

  async initialize(): Promise<void> {
    // 이미 초기화되었으면 건너뛰기
    if (this.isInitialized) {
      logger.info('Telegram Bot already initialized, skipping...');
      return;
    }

    try {
      // 수동으로 폴링 시작 (중복 방지)
      if (!this.bot.isPolling()) {
        await this.bot.startPolling();
      }

      const me = await this.bot.getMe();
      logger.info(`Telegram Bot initialized: @${me.username}`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Telegram Bot:', error);
      throw new Error(`Telegram Bot initialization failed: ${error}`);
    }
  }

  private setupBotHandlers(): void {
    // Handle text messages (commands)
    this.bot.on('message', async (msg) => {
      if (!msg.text || !msg.text.startsWith('/')) {
        return;
      }

      const chatId = msg.chat.id.toString();
      const userId = msg.from?.id.toString() || chatId;

      // Parse command
      const [command, ...args] = msg.text.slice(1).split(' ');

      const params: SubscriptionCommandParams = {
        platform: 'telegram',
        userId,
        command: command as any, // Cast to handle potential command types
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
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (query) => {
      if (!query.data) return;

      const chatId = query.message?.chat.id.toString();
      const userId = query.from.id.toString();

      if (!chatId) return;

      try {
        await this.bot.answerCallbackQuery(query.id);

        // Parse callback data (format: "action:param1:param2")
        const [action, ...params] = query.data.split(':');

        const commandParams: SubscriptionCommandParams = {
          platform: 'telegram',
          userId,
          command: action as any, // Cast to handle potential command types
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
    });

    // Handle errors
    this.bot.on('error', (error) => {
      logger.error('Telegram Bot error:', error);
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram Bot polling error:', error);

      // 409 Conflict 감지 시 자동 폴링 중지
      if ('code' in error && error.code === 'ETELEGRAM' &&
          'response' in error && (error as any).response?.statusCode === 409) {
        logger.warn('Telegram 봇 409 충돌 감지, 폴링을 중지합니다.');
        this.bot.stopPolling({ cancel: true, reason: 'Conflict detected' });
      }
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const me = await this.bot.getMe();
      logger.info(`Telegram Bot health check passed: @${me.username}`);
      return true;
    } catch (error) {
      logger.error('Telegram Bot health check failed:', error);
      return false;
    }
  }

  validateConfig(): boolean {
    if (!this.config.botToken || !this.config.chatId) {
      logger.error('Telegram configuration missing: botToken or chatId not provided');
      return false;
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

      await this.bot.sendMessage(this.chatId, message, options);

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 알림 전송 완료: ${alert.REG_NAME} ${alert.WRN} (${responseTime}ms)`);

      return {
        success: true,
        platform: 'telegram',
        responseTime
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

      await this.bot.sendMessage(this.chatId, `${color} ${message}`, options);

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 변동 알림 전송 완료: ${change.type} - ${change.current?.regionName || change.previous?.regionName} (${responseTime}ms)`);

      return {
        success: true,
        platform: 'telegram',
        responseTime
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

      // Multiple changes - use batch format
      const message = this.formatBatchAlertChanges(changes);

      const options = {
        parse_mode: 'Markdown' as const,
        reply_markup: {
          inline_keyboard: [
            [
              { text: `📊 전체현황 (${changes.length}건)`, url: 'https://weather.starryjeju.net' },
              { text: '🔔 알림설정', callback_data: 'settings:notifications' }
            ]
          ]
        }
      };

      await this.bot.sendMessage(this.chatId, message, options);

      const responseTime = Date.now() - startTime;
      logger.info(`Telegram 배치 변동 알림 전송 완료: ${changes.length}건 (${responseTime}ms)`);

      return [{
        success: true,
        platform: 'telegram',
        responseTime
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

    const emoji = this.getWeatherEmoji(alert.WRN);
    const levelEmoji = alert.LVL === '경보' ? '🚨' : '⚠️';
    const warningTypeName = this.getWarningTypeName(alert.WRN);

    return `${env}${emoji} *기상특보 발표*

📍 *지역*: ${alert.REG_NAME}
⚠️ *특보종류*: ${warningTypeName}
📊 *수준*: ${levelEmoji} ${alert.LVL}
📅 *발표*: ${this.formatDate(alert.TM_FC)}
🕐 *발효*: ${this.formatDate(alert.TM_EF)}

_한국 기상청 제공_`;
  }

  private formatAlertChange(change: AlertChange): string {
    const env = this.config.nodeEnv === 'development' ? '[DEV] ' :
               this.config.nodeEnv === 'staging' ? '[STAGING] ' : '';

    const emoji = this.getChangeEmoji(change.type);
    const title = this.getChangeTitle(change.type);

    const regionName = change.current?.regionName || change.previous?.regionName || '알 수 없음';
    const warningType = change.current?.warningType || change.previous?.warningType || '알 수 없음';

    let details = `📍 *지역*: ${regionName}\n⚠️ *특보종류*: ${warningType}`;

    switch (change.type) {
      case 'NEW':
        details += `\n📊 *수준*: ${change.current?.level}`;
        break;
      case 'RESOLVED':
        details += `\n❌ *해제수준*: ${change.previous?.level}`;
        break;
      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        details += `\n📈 *수준변화*: ${change.previous?.level} → ${change.current?.level}`;
        break;
      case 'TIME_EXTENDED':
        if (change.current) {
          details += `\n⏰ *발효시각*: ${this.formatDate(change.current.effectiveAt)}`;
        }
        break;
      case 'MODIFIED':
        details += `\n📊 *수준*: ${change.current?.level}`;
        break;
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

      message += `${emoji} *${title}*\n`;
      message += `📍 ${regionName} | ⚠️ ${warningType}`;

      switch (change.type) {
        case 'NEW':
          message += ` | 📊 ${change.current?.level}`;
          break;
        case 'RESOLVED':
          message += ` | ❌ 해제수준: ${change.previous?.level}`;
          break;
        case 'LEVEL_UP':
        case 'LEVEL_DOWN':
          message += ` | 📈 ${change.previous?.level} → ${change.current?.level}`;
          break;
        case 'TIME_EXTENDED':
          message += ` | ⏰ 시간연장`;
          break;
        case 'MODIFIED':
          message += ` | 🔄 내용변경`;
          break;
      }

      if (index < changes.length - 1) {
        message += '\n\n';
      }
    });

    message += `\n\n_한국 기상청_`;
    return message;
  }

  private getWarningTypeName(warningCode: string): string {
    const warningTypes: Record<string, string> = {
      'W': '강풍',
      'R': '호우',
      'C': '한파',
      'D': '건조',
      'O': '해일',
      'N': '지진해일',
      'V': '풍랑',
      'T': '태풍',
      'S': '대설',
      'Y': '황사',
      'H': '폭염',
      'F': '안개'
    };
    return warningTypes[warningCode.trim()] || warningCode;
  }

  private getWeatherEmoji(warningCode: string): string {
    const warningTypeName = this.getWarningTypeName(warningCode);
    const emojiMap: Record<string, string> = {
      '강풍': '💨',
      '호우': '🌧️',
      '한파': '🥶',
      '건조': '🏜️',
      '해일': '🌊',
      '지진해일': '🌊',
      '풍랑': '🌊',
      '태풍': '🌀',
      '대설': '❄️',
      '황사': '🌫️',
      '폭염': '🔥',
      '안개': '🌫️'
    };
    return emojiMap[warningTypeName] || '⚠️';
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

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
      return kstDate.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
      });
    } catch (error) {
      logger.error('Date formatting error:', error);
      return dateString;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.bot.isPolling()) {
        await this.bot.stopPolling({ cancel: true, reason: 'Service stopped' });
        this.isInitialized = false;
        logger.info('Telegram Bot stopped successfully');
      } else {
        logger.info('Telegram Bot was not polling, nothing to stop');
      }
    } catch (error) {
      logger.error('Error stopping Telegram Bot:', error);
    }
  }
}