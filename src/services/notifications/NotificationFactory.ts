import { logger } from '../../utils/logger';
import {
  NotificationService,
  NotificationConfig,
  SlackConfig,
  TelegramConfig,
  DiscordConfig,
  EmailConfig
} from './interfaces';
import { SlackNotificationService } from './SlackNotificationService';
import { MultiplatformNotificationService } from './MultiplatformNotificationService';
import { TelegramNotificationService } from './TelegramNotificationService';
import { SubscriptionManager } from './SubscriptionManager';
import { WeatherService } from '../weatherService';

/**
 * 알림 서비스 팩토리
 * 
 * 설정에 따라 적절한 알림 서비스 인스턴스를 생성하고 관리
 */
export class NotificationFactory {
  
  /**
   * 설정에 따라 개별 알림 서비스들을 생성
   */
  static createServices(config: NotificationConfig, weatherService?: WeatherService, subscriptionManager?: SubscriptionManager): NotificationService[] {
    const services: NotificationService[] = [];
    const environment = config.environment || 'development';
    const webDashboardUrl = config.webDashboardUrl || 'https://weather.starryjeju.net';

    logger.info(`알림 서비스 생성 시작: ${config.platforms.join(', ')}`);

    for (const platform of config.platforms) {
      try {
        const service = this.createSingleService(platform, config, environment, webDashboardUrl, weatherService, subscriptionManager);
        if (service) {
          services.push(service);
          logger.info(`${platform} 서비스 생성 완료`);
        }
      } catch (error) {
        logger.error(`${platform} 서비스 생성 실패:`, error);
      }
    }

    logger.info(`총 ${services.length}개 알림 서비스 생성 완료`);
    return services;
  }

  /**
   * 다중 플랫폼 매니저를 생성
   */
  static createMultiplatformService(config: NotificationConfig, weatherService?: WeatherService): MultiplatformNotificationService {
    // 공유 SubscriptionManager 생성
    const subscriptionManager = new SubscriptionManager();
    logger.info('공유 SubscriptionManager 생성 - 모든 알림 서비스가 동일한 구독 데이터 사용');

    // 모든 서비스에 공유 SubscriptionManager 전달
    const services = this.createServices(config, weatherService, subscriptionManager);

    // MultiplatformNotificationService에도 공유 SubscriptionManager 전달
    return new MultiplatformNotificationService(services, subscriptionManager);
  }

  /**
   * 특정 플랫폼의 단일 서비스 생성
   */
  private static createSingleService(
    platform: string,
    config: NotificationConfig,
    environment: string,
    webDashboardUrl: string,
    weatherService?: WeatherService,
    subscriptionManager?: SubscriptionManager
  ): NotificationService | null {

    switch (platform.toLowerCase()) {
      case 'slack':
        return this.createSlackService(config.slack, environment, webDashboardUrl, weatherService);

      case 'telegram':
        return this.createTelegramService(config.telegram, environment, webDashboardUrl, weatherService, subscriptionManager);

      case 'discord':
        return this.createDiscordService(config.discord, environment, webDashboardUrl);

      case 'email':
        return this.createEmailService(config.email, environment, webDashboardUrl);

      default:
        logger.warn(`지원하지 않는 알림 플랫폼: ${platform}`);
        return null;
    }
  }

  /**
   * Slack 알림 서비스 생성
   */
  private static createSlackService(config?: SlackConfig, environment?: string, webDashboardUrl?: string, weatherService?: WeatherService): NotificationService | null {
    if (!config) {
      logger.warn('Slack 설정이 없습니다');
      return null;
    }

    if (!config.enabled) {
      logger.info('Slack 알림이 비활성화되어 있습니다');
      return null;
    }

    try {
      const service = new SlackNotificationService(config, environment, weatherService);

      if (!service.validateConfig()) {
        logger.error('Slack 설정 검증 실패');
        return null;
      }

      return service;
    } catch (error) {
      logger.error('Slack 서비스 생성 중 오류:', error);
      return null;
    }
  }

  /**
   * Telegram 알림 서비스 생성 (향후 구현 예정)
   */
  private static createTelegramService(config?: TelegramConfig, environment?: string, webDashboardUrl?: string, weatherService?: WeatherService, subscriptionManager?: SubscriptionManager): NotificationService | null {
    if (!config) {
      logger.warn('Telegram 설정이 없습니다');
      return null;
    }

    if (!config.enabled) {
      logger.info('Telegram 알림이 비활성화되어 있습니다');
      return null;
    }
    try {
      const service = new TelegramNotificationService({
        ...config,
        webDashboardUrl
      }, weatherService, subscriptionManager);

      if (!service.validateConfig()) {
        logger.error('Telegram 설정 검증 실패');
        return null;
      }

      return service;
    } catch (error) {
      logger.error('Telegram 서비스 생성 중 오류:', error);
      return null;
    }
  }

  /**
   * Discord 알림 서비스 생성 (향후 구현 예정)
   */
  private static createDiscordService(config?: DiscordConfig, environment?: string, webDashboardUrl?: string): NotificationService | null {
    if (!config) {
      logger.warn('Discord 설정이 없습니다');
      return null;
    }

    if (!config.enabled) {
      logger.info('Discord 알림이 비활성화되어 있습니다');
      return null;
    }

    // TODO: Phase 3에서 구현 예정
    logger.warn('Discord 서비스는 아직 구현되지 않았습니다 (Phase 3 예정)');
    return null;
  }

  /**
   * Email 알림 서비스 생성 (향후 구현 예정)
   */
  private static createEmailService(config?: EmailConfig, environment?: string, webDashboardUrl?: string): NotificationService | null {
    if (!config) {
      logger.warn('Email 설정이 없습니다');
      return null;
    }

    if (!config.enabled) {
      logger.info('Email 알림이 비활성화되어 있습니다');
      return null;
    }

    // TODO: Phase 4에서 구현 예정
    logger.warn('Email 서비스는 아직 구현되지 않았습니다 (Phase 4 예정)');
    return null;
  }

  /**
   * 설정 유효성 검사
   */
  static validateConfig(config: NotificationConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 기본 유효성 검사
    if (!config.platforms || config.platforms.length === 0) {
      errors.push('최소 하나의 알림 플랫폼을 설정해야 합니다');
    }

    // 플랫폼별 설정 검사
    for (const platform of config.platforms || []) {
      switch (platform.toLowerCase()) {
        case 'slack':
          if (!config.slack) {
            errors.push('Slack 플랫폼이 선택되었지만 설정이 없습니다');
          } else if (!config.slack.webhookUrl) {
            errors.push('Slack webhookUrl이 설정되지 않았습니다');
          } else if (!config.slack.webhookUrl.startsWith('https://hooks.slack.com/')) {
            errors.push('유효하지 않은 Slack webhook URL입니다');
          }
          break;
          
        case 'telegram':
          if (!config.telegram) {
            errors.push('Telegram 플랫폼이 선택되었지만 설정이 없습니다');
          } else {
            if (!config.telegram.botToken) {
              errors.push('Telegram botToken이 설정되지 않았습니다');
            }
            // chatId는 이제 선택적 (deprecated) - 구독 시스템 사용 권장
            // 레거시 chatId 사용 시에도 경고하지 않고 자동 전환됨
            if (config.telegram.webhookUrl && !config.telegram.webhookSecret) {
              errors.push('Telegram webhookSecret이 설정되지 않았습니다');
            }
          }
          break;
          
        case 'discord':
          if (!config.discord) {
            errors.push('Discord 플랫폼이 선택되었지만 설정이 없습니다');
          } else if (!config.discord.webhookUrl) {
            errors.push('Discord webhookUrl이 설정되지 않았습니다');
          } else if (!config.discord.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
            errors.push('유효하지 않은 Discord webhook URL입니다');
          }
          break;
          
        case 'email':
          if (!config.email) {
            errors.push('Email 플랫폼이 선택되었지만 설정이 없습니다');
          } else {
            if (!config.email.smtpHost) {
              errors.push('Email smtpHost가 설정되지 않았습니다');
            }
            if (!config.email.smtpPort || config.email.smtpPort <= 0) {
              errors.push('유효하지 않은 Email smtpPort입니다');
            }
            if (!config.email.auth || !config.email.auth.user || !config.email.auth.pass) {
              errors.push('Email 인증 정보가 올바르게 설정되지 않았습니다');
            }
            if (!config.email.recipients || config.email.recipients.length === 0) {
              errors.push('최소 하나의 Email 수신자를 설정해야 합니다');
            }
          }
          break;
          
        default:
          errors.push(`지원하지 않는 알림 플랫폼: ${platform}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 플랫폼별 지원 기능 확인
   */
  static getSupportedFeatures(platform: string): { 
    batchMessages: boolean; 
    richFormatting: boolean; 
    mentions: boolean;
    attachments: boolean;
    healthCheck: boolean;
  } {
    
    const defaultFeatures = {
      batchMessages: false,
      richFormatting: false,
      mentions: false,
      attachments: false,
      healthCheck: true
    };

    switch (platform.toLowerCase()) {
      case 'slack':
        return {
          batchMessages: true,
          richFormatting: true,
          mentions: true,
          attachments: true,
          healthCheck: true
        };
        
      case 'telegram':
        return {
          batchMessages: false,
          richFormatting: true,
          mentions: true,
          attachments: false,
          healthCheck: true
        };
        
      case 'discord':
        return {
          batchMessages: false,
          richFormatting: true,
          mentions: true,
          attachments: true,
          healthCheck: true
        };
        
      case 'email':
        return {
          batchMessages: true,
          richFormatting: true,
          mentions: false,
          attachments: true,
          healthCheck: false
        };
        
      default:
        return defaultFeatures;
    }
  }

  /**
   * 환경별 기본 설정 생성
   */
  static createDefaultConfig(environment: string = 'development'): Partial<NotificationConfig> {
    return {
      platforms: ['slack'], // 기본적으로 Slack만 활성화
      environment,
      slack: {
        enabled: true,
        webhookUrl: '', // 사용자가 설정해야 함
        batchMode: true
      }
    };
  }
}