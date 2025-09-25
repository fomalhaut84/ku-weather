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

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
    telegramInterface = new TelegramSubscriptionInterface(
      subscriptionManager,
      'test-bot-token'
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