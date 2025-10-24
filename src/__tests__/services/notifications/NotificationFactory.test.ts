import { NotificationFactory } from '../../../services/notifications/NotificationFactory';
import { NotificationConfig } from '../../../services/notifications/interfaces';

// logger 모킹
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('NotificationFactory', () => {
  describe('createServices', () => {
    test('Slack 서비스 생성 성공', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        environment: 'development',
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
          batchMode: true
        }
      };

      const services = NotificationFactory.createServices(config);
      
      expect(services).toHaveLength(1);
      expect(services[0].platformName).toBe('slack');
      expect(services[0].validateConfig()).toBe(true);
    });

    test('비활성화된 Slack 서비스는 생성하지 않음', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        environment: 'development',
        slack: {
          enabled: false,
          webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
          batchMode: true
        }
      };

      const services = NotificationFactory.createServices(config);
      
      expect(services).toHaveLength(0);
    });

    test('설정이 없는 플랫폼은 생성하지 않음', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        environment: 'development'
        // slack 설정 누락
      };

      const services = NotificationFactory.createServices(config);
      
      expect(services).toHaveLength(0);
    });

    test('지원하지 않는 플랫폼은 무시', () => {
      const config: NotificationConfig = {
        platforms: ['unknown-platform'],
        environment: 'development'
      };

      const services = NotificationFactory.createServices(config);
      
      expect(services).toHaveLength(0);
    });

    test('Telegram 서비스 생성 성공', () => {
      const config: NotificationConfig = {
        platforms: ['telegram'],
        environment: 'development',
        telegram: {
          enabled: true,
          botToken: 'test-bot-token',
          chatId: 'test-chat-id'
        }
      };

      const services = NotificationFactory.createServices(config);

      expect(services).toHaveLength(1);
      expect(services[0].platformName).toBe('telegram');
      expect(services[0].validateConfig()).toBe(true);
    });
  });

  describe('createMultiplatformService', () => {
    test('MultiplatformNotificationService 생성', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        environment: 'development',
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
          batchMode: true
        }
      };

      const multiService = NotificationFactory.createMultiplatformService(config);
      
      expect(multiService.getPlatformNames()).toEqual(['slack']);
    });

    test('다중 플랫폼 서비스 생성', () => {
      const config: NotificationConfig = {
        platforms: ['slack', 'telegram', 'discord'],
        environment: 'development',
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
          batchMode: true
        },
        telegram: {
          enabled: true,
          botToken: 'test-token',
          chatId: 'test-chat'
        },
        discord: {
          enabled: true,
          webhookUrl: 'https://discord.com/api/webhooks/test'
        }
      };

      const multiService = NotificationFactory.createMultiplatformService(config);

      // Slack과 Telegram은 지원, Discord는 향후 구현 예정
      expect(multiService.getPlatformNames()).toEqual(['slack', 'telegram']);
    });
  });

  describe('validateConfig', () => {
    test('유효한 Slack 설정 검증', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
          batchMode: true
        }
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('플랫폼 설정 누락 검증', () => {
      const config: NotificationConfig = {
        platforms: []
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('최소 하나의 알림 플랫폼을 설정해야 합니다');
    });

    test('Slack webhookUrl 누락 검증', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        slack: {
          enabled: true,
          webhookUrl: '',
          batchMode: true
        }
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Slack webhookUrl이 설정되지 않았습니다');
    });

    test('잘못된 Slack webhookUrl 검증', () => {
      const config: NotificationConfig = {
        platforms: ['slack'],
        slack: {
          enabled: true,
          webhookUrl: 'https://invalid-webhook-url.com',
          batchMode: true
        }
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('유효하지 않은 Slack webhook URL입니다');
    });

    test('Telegram botToken 누락 검증', () => {
      const config: NotificationConfig = {
        platforms: ['telegram'],
        telegram: {
          enabled: true,
          botToken: ''
        }
      };

      const validation = NotificationFactory.validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Telegram botToken이 설정되지 않았습니다');
    });

    test('Telegram 유효한 설정 (chatId 없이)', () => {
      const config: NotificationConfig = {
        platforms: ['telegram'],
        telegram: {
          enabled: true,
          botToken: 'test-bot-token'
          // chatId는 이제 선택적 - 구독 시스템 사용
        }
      };

      const validation = NotificationFactory.validateConfig(config);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('Discord 설정 검증 (향후 구현)', () => {
      const config: NotificationConfig = {
        platforms: ['discord'],
        discord: {
          enabled: true,
          webhookUrl: 'https://invalid-discord-url.com'
        }
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('유효하지 않은 Discord webhook URL입니다');
    });

    test('Email 설정 검증 (향후 구현)', () => {
      const config: NotificationConfig = {
        platforms: ['email'],
        email: {
          enabled: true,
          smtpHost: '',
          smtpPort: 587,
          auth: {
            user: 'test@example.com',
            pass: 'password'
          },
          recipients: []
        }
      };

      const validation = NotificationFactory.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Email smtpHost가 설정되지 않았습니다');
      expect(validation.errors).toContain('최소 하나의 Email 수신자를 설정해야 합니다');
    });
  });

  describe('getSupportedFeatures', () => {
    test('Slack 지원 기능 확인', () => {
      const features = NotificationFactory.getSupportedFeatures('slack');
      
      expect(features.batchMessages).toBe(true);
      expect(features.richFormatting).toBe(true);
      expect(features.mentions).toBe(true);
      expect(features.attachments).toBe(true);
      expect(features.healthCheck).toBe(true);
    });

    test('Telegram 지원 기능 확인 (향후 구현)', () => {
      const features = NotificationFactory.getSupportedFeatures('telegram');
      
      expect(features.batchMessages).toBe(false);
      expect(features.richFormatting).toBe(true);
      expect(features.mentions).toBe(true);
      expect(features.attachments).toBe(false);
      expect(features.healthCheck).toBe(true);
    });

    test('Discord 지원 기능 확인 (향후 구현)', () => {
      const features = NotificationFactory.getSupportedFeatures('discord');
      
      expect(features.batchMessages).toBe(false);
      expect(features.richFormatting).toBe(true);
      expect(features.mentions).toBe(true);
      expect(features.attachments).toBe(true);
      expect(features.healthCheck).toBe(true);
    });

    test('Email 지원 기능 확인 (향후 구현)', () => {
      const features = NotificationFactory.getSupportedFeatures('email');
      
      expect(features.batchMessages).toBe(true);
      expect(features.richFormatting).toBe(true);
      expect(features.mentions).toBe(false);
      expect(features.attachments).toBe(true);
      expect(features.healthCheck).toBe(false);
    });

    test('지원하지 않는 플랫폼의 기본 기능', () => {
      const features = NotificationFactory.getSupportedFeatures('unknown');
      
      expect(features.batchMessages).toBe(false);
      expect(features.richFormatting).toBe(false);
      expect(features.mentions).toBe(false);
      expect(features.attachments).toBe(false);
      expect(features.healthCheck).toBe(true);
    });
  });

  describe('createDefaultConfig', () => {
    test('개발 환경 기본 설정 생성', () => {
      const config = NotificationFactory.createDefaultConfig('development');
      
      expect(config.platforms).toEqual(['slack']);
      expect(config.environment).toBe('development');
      expect(config.slack?.enabled).toBe(true);
      expect(config.slack?.batchMode).toBe(true);
      expect(config.slack?.webhookUrl).toBe('');
    });

    test('프로덕션 환경 기본 설정 생성', () => {
      const config = NotificationFactory.createDefaultConfig('production');
      
      expect(config.environment).toBe('production');
    });

    test('기본 환경값으로 설정 생성', () => {
      const config = NotificationFactory.createDefaultConfig();
      
      expect(config.environment).toBe('development');
    });
  });
});