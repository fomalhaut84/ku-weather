import { TelegramSubscriptionInterface } from '../../../services/subscriptions/TelegramSubscriptionInterface';
import { SubscriptionManager } from '../../../services/notifications/SubscriptionManager';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('TelegramSubscriptionInterface', () => {
  let subscriptionManager: SubscriptionManager;
  let telegramInterface: TelegramSubscriptionInterface;
  let mockWebInterface: any;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
    mockWebInterface = {
      generateAccessToken: jest.fn().mockResolvedValue({
        token: 'tg-web-token-abc123',
        platform: 'telegram', userId: 'user123',
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
      })
    };
    telegramInterface = new TelegramSubscriptionInterface(
      subscriptionManager,
      'test-bot-token',
      mockWebInterface
    );
  });

  describe('escapeMarkdown', () => {
    it('should escape underscores in tokens correctly', () => {
      // Test escaping method through reflection since it's private
      const escapeMarkdown = (telegramInterface as any).escapeMarkdown;

      const testToken = 'TG_mfypj0gq_uvsekr_49r7x2w6eo4';
      const escapedToken = escapeMarkdown(testToken);

      expect(escapedToken).toBe('TG\\_mfypj0gq\\_uvsekr\\_49r7x2w6eo4');
    });

    it('should escape all Telegram Markdown special characters', () => {
      const escapeMarkdown = (telegramInterface as any).escapeMarkdown;

      const testCases = [
        { input: 'text_with_underscores', expected: 'text\\_with\\_underscores' },
        { input: 'text*with*asterisks', expected: 'text\\*with\\*asterisks' },
        { input: 'text[with]brackets', expected: 'text\\[with\\]brackets' },
        { input: 'text(with)parentheses', expected: 'text\\(with\\)parentheses' },
        { input: 'text~with~tildes', expected: 'text\\~with\\~tildes' },
        { input: 'text`with`backticks', expected: 'text\\`with\\`backticks' },
        { input: 'text>with>greater', expected: 'text\\>with\\>greater' },
        { input: 'text#with#hash', expected: 'text\\#with\\#hash' },
        { input: 'text+with+plus', expected: 'text\\+with\\+plus' },
        { input: 'text-with-hyphens', expected: 'text\\-with\\-hyphens' },
        { input: 'text=with=equals', expected: 'text\\=with\\=equals' },
        { input: 'text|with|pipes', expected: 'text\\|with\\|pipes' },
        { input: 'text{with}braces', expected: 'text\\{with\\}braces' },
        { input: 'text.with.dots', expected: 'text\\.with\\.dots' },
        { input: 'text!with!exclamation', expected: 'text\\!with\\!exclamation' },
        { input: 'text\\with\\backslashes', expected: 'text\\\\with\\\\backslashes' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = escapeMarkdown(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle complex mixed special characters', () => {
      const escapeMarkdown = (telegramInterface as any).escapeMarkdown;

      const complexText = 'URL: https://example.com/path?token=ABC_123&param=value[0]';
      const escapedText = escapeMarkdown(complexText);

      // Should escape the special characters (? and & are not special in Telegram Markdown)
      expect(escapedText).toBe('URL: https://example\\.com/path?token\\=ABC\\_123&param\\=value\\[0\\]');
    });
  });

  describe('constructor', () => {
    it('should initialize with platform name telegram', () => {
      expect(telegramInterface.platformName).toBe('telegram');
    });

    it('should work without optional params', () => {
      const t = new TelegramSubscriptionInterface(subscriptionManager);
      expect(t.platformName).toBe('telegram');
    });

    it('should accept custom dashboard URL', () => {
      const t = new TelegramSubscriptionInterface(subscriptionManager, undefined, undefined, 'https://custom.url');
      expect(t.platformName).toBe('telegram');
    });
  });

  describe('setWebInterface', () => {
    it('should set the web interface', () => {
      const t = new TelegramSubscriptionInterface(subscriptionManager);
      t.setWebInterface(mockWebInterface);
    });
  });

  describe('handleCommand - subscribe', () => {
    it('should subscribe to a region', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['seoul']
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('구독이 추가');
    });

    it('should subscribe with warning type', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['seoul', 'heat']
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('폭염');
    });

    it('should subscribe with "all" warning type', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['seoul', 'all']
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('모든 특보');
    });

    it('should fail without region arg (caught by validateCommand)', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_COMMAND_FORMAT');
    });

    it('should fail with invalid region', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['mars']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_REGION');
    });

    it('should fail with invalid warning type', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['seoul', 'invalidtype']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_WARNING_TYPE');
    });

    it('should merge with existing subscription regions', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      await telegramInterface.handleCommand({
        command: 'subscribe', platform: 'telegram', userId: 'user1', args: ['busan']
      });

      const sub = subscriptionManager.getUserSubscription('telegram', 'user1');
      expect(sub!.targetRegions).toContain('L1100000');
      expect(sub!.targetRegions).toContain('L1150000');
    });
  });

  describe('handleCommand - unsubscribe', () => {
    it('should fail when no subscription exists', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_SUBSCRIPTION');
    });

    it('should remove all subscriptions without args', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(subscriptionManager.getUserSubscription('telegram', 'user1')).toBeUndefined();
    });

    it('should remove specific region', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000', 'L1150000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: ['seoul']
      });
      expect(result.success).toBe(true);

      const sub = subscriptionManager.getUserSubscription('telegram', 'user1');
      expect(sub!.targetRegions).not.toContain('L1100000');
      expect(sub!.targetRegions).toContain('L1150000');
    });

    it('should remove subscription when last region removed', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: ['seoul']
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('완전히 제거');
    });

    it('should fail with invalid region', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: ['mars']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_REGION');
    });

    it('should fail when region not subscribed', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'unsubscribe', platform: 'telegram', userId: 'user1', args: ['busan']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('REGION_NOT_SUBSCRIBED');
    });
  });

  describe('handleCommand - quiet', () => {
    it('should fail without time arguments (caught by validateCommand)', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'quiet', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_COMMAND_FORMAT');
    });

    it('should fail with invalid time format (caught by validateCommand)', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'quiet', platform: 'telegram', userId: 'user1', args: ['25:00', '08:00']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_COMMAND_FORMAT');
    });

    it('should fail when no subscription exists', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'quiet', platform: 'telegram', userId: 'user1', args: ['22:00', '08:00']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_SUBSCRIPTION');
    });

    it('should set quiet hours successfully', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'quiet', platform: 'telegram', userId: 'user1', args: ['22:00', '08:00']
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('22:00');
    });
  });

  describe('handleCommand - status', () => {
    it('should show system status', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'status', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('구독 시스템 현황');
    });

    it('should show subscription status when subscribed', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'status', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('구독 중');
    });
  });

  describe('handleCommand - help', () => {
    it('should return help message', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'help', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('subscribe');
    });
  });

  describe('handleCommand - unknown/invalid', () => {
    it('should return error for unknown command (caught by validateCommand)', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'unknown' as any, platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_COMMAND_FORMAT');
    });

    it('should return error for invalid command format', async () => {
      const result = await telegramInterface.handleCommand({
        command: '' as any, platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_COMMAND_FORMAT');
    });
  });

  describe('handleCommand - list', () => {
    it('should show no subscription message', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'list', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('구독 중인 알림이 없습니다');
    });

    it('should handle settings as alias for list', async () => {
      const result = await telegramInterface.handleCommand({
        command: 'settings', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
    });
  });

  describe('generateAuthToken', () => {
    it('should return a valid auth token', async () => {
      const token = await telegramInterface.generateAuthToken('user123');
      expect(token.platform).toBe('telegram');
      expect(token.userId).toBe('user123');
      expect(token.token).toMatch(/^TG_/);
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('notifySubscriptionChange', () => {
    it('should not throw without bot token', async () => {
      const t = new TelegramSubscriptionInterface(subscriptionManager);
      await expect(
        t.notifySubscriptionChange('user1', 'test change')
      ).resolves.not.toThrow();
    });

    it('should not throw with bot token', async () => {
      await expect(
        telegramInterface.notifySubscriptionChange('user1', 'test change')
      ).resolves.not.toThrow();
    });
  });

  describe('getHelpMessage', () => {
    it('should return help text', () => {
      const help = telegramInterface.getHelpMessage();
      expect(help).toContain('subscribe');
    });
  });

  describe('web token generation', () => {
    it('should use web interface for token when available', async () => {
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'list', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(mockWebInterface.generateAccessToken).toHaveBeenCalled();
    });

    it('should fallback to auth token when web interface fails', async () => {
      mockWebInterface.generateAccessToken.mockRejectedValue(new Error('DB error'));
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await telegramInterface.handleCommand({
        command: 'list', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('TG\\_');
    });

    it('should use fallback token when no web interface', async () => {
      const t = new TelegramSubscriptionInterface(subscriptionManager);
      subscriptionManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await t.handleCommand({
        command: 'list', platform: 'telegram', userId: 'user1', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('TG\\_');
    });
  });

  describe('handleListCommand Markdown safety', () => {
    it('should produce Telegram-safe Markdown for list command response', async () => {
      // Add a test subscription with typical data
      subscriptionManager.addSubscription({
        platform: 'telegram',
        userId: 'test-user-123',
        targetRegions: ['L1100000'], // Seoul
        warningTypes: ['H'], // Heat
        enabled: true,
        displayName: 'Test User',
        preferences: {
          quietHours: { start: '22:00', end: '08:00' },
          minLevel: '2'
        }
      });

      const params = {
        command: 'list' as const,
        platform: 'telegram',
        userId: 'test-user-123',
        args: []
      };

      const result = await telegramInterface.handleCommand(params);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();

      // Check that special characters in angle brackets are escaped
      expect(result.message).toContain('\\<지역\\>');
      expect(result.message).toContain('\\<시작\\>');
      expect(result.message).toContain('\\<끝\\>');

      // Check that hyphens in command descriptions are escaped
      expect(result.message).toContain('\\-');

      // Check that the token in URL is properly escaped
      if (result.message.includes('token=')) {
        const tokenMatch = result.message.match(/token=([^&\s]+)/);
        if (tokenMatch && tokenMatch[1].includes('_')) {
          // If there are underscores in the token, they should be escaped
          expect(result.message).toMatch(/token=[^_]*\\_[^&\s]*/);
        }
      }
    });
  });
});