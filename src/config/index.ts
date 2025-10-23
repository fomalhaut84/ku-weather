import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { NotificationConfig } from '../services/notifications/interfaces';

dotenv.config();

export interface Config {
  weatherApiKey: string;
  slackWebhookUrl: string;
  targetRegionIds: string[];
  warningTypes: string[];
  subcd?: string;
  checkIntervalMinutes: number;
  nodeEnv: string;
  debug: boolean;
  environment: string;
  slackBatchMode: boolean;
  // Telegram 설정
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  telegramWebhookSecret?: string;
  // HTTP 서버 설정
  serverPort: number;
  serverEnabled: boolean;
  corsOrigin?: string;
  // 새로운 다중 플랫폼 설정
  notificationConfig: NotificationConfig;
}

function validateConfig(): Config {
  const weatherApiKey = process.env.WEATHER_API_KEY;
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  const targetRegionIds = process.env.TARGET_REGION_IDS?.split(',').filter(id => id.trim()) || [];
  const warningTypes = process.env.WARNING_TYPES?.split(',').filter(type => type.trim()) || [];
  const subcd = process.env.SUBCD?.trim();
  const checkIntervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES || '30', 10);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const debug = process.env.DEBUG === 'true';
  const environment = process.env.ENVIRONMENT || 'development';
  const slackBatchMode = process.env.SLACK_BATCH_MODE !== 'false'; // 기본값: true (배치 모드)

  // Telegram 설정
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
  const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const telegramEnabled = process.env.TELEGRAM_ENABLED === 'true' && !!telegramBotToken && !!telegramChatId;
  const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  // HTTP 서버 설정
  const serverPort = parseInt(process.env.PORT || '3000', 10);
  const serverEnabled = process.env.SERVER_ENABLED !== 'false'; // 기본값: true
  const corsOrigin = process.env.CORS_ORIGIN;

  if (telegramEnabled && telegramWebhookUrl && !telegramWebhookSecret) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다');
  }

  if (!weatherApiKey) {
    throw new Error('WEATHER_API_KEY 환경변수가 설정되지 않았습니다');
  }

  if (!slackWebhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL 환경변수가 설정되지 않았습니다');
  }

  if (isNaN(checkIntervalMinutes) || checkIntervalMinutes <= 0) {
    throw new Error('CHECK_INTERVAL_MINUTES는 양수여야 합니다');
  }

  // 다중 플랫폼 알림 설정 생성
  const platforms: string[] = ['slack'];
  if (telegramEnabled) {
    platforms.push('telegram');
  }

  // const notificationConfig: NotificationConfig = {
  //   platforms,
  //   environment,
  //   slack: {
  //     enabled: true,
  //     webhookUrl: slackWebhookUrl,
  //     batchMode: slackBatchMode
  //   },
  //   telegram: telegramEnabled ? {
  //     enabled: true,
  //     botToken: telegramBotToken,
  //     chatId: telegramChatId
  //   } : {
  //     enabled: false,
  //     botToken: '',
  //     chatId: ''
  //   }
  // };
    const notificationConfig: NotificationConfig = {
    platforms,
    environment,
    slack: {
      enabled: true,
      webhookUrl: slackWebhookUrl,
      batchMode: slackBatchMode
    },
    telegram: {
      enabled: telegramEnabled,
      botToken: telegramBotToken,
      chatId: telegramChatId,
      webhookUrl: telegramWebhookUrl,
      webhookSecret: telegramWebhookSecret
    }
  };

  const config: Config = {
    weatherApiKey,
    slackWebhookUrl,
    targetRegionIds,
    warningTypes,
    subcd,
    checkIntervalMinutes,
    nodeEnv,
    debug,
    environment,
    slackBatchMode,
    telegramBotToken,
    telegramChatId,
    telegramEnabled,
    telegramWebhookSecret,
    serverPort,
    serverEnabled,
    corsOrigin,
    notificationConfig
  };

  logger.info('설정 로드 완료:', {
    targetRegionIds: config.targetRegionIds.length > 0 ? config.targetRegionIds : ['전국'],
    warningTypes: config.warningTypes.length > 0 ? config.warningTypes : ['전체'],
    subcd: config.subcd || '전체',
    checkIntervalMinutes: config.checkIntervalMinutes,
    nodeEnv: config.nodeEnv,
    debug: config.debug,
    environment: config.environment,
    slackBatchMode: config.slackBatchMode,
    telegramEnabled: config.telegramEnabled,
    serverPort: config.serverPort,
    serverEnabled: config.serverEnabled,
    enabledPlatforms: config.notificationConfig.platforms
  });

  return config;
}

export const config = validateConfig();