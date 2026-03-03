import { SlackInteractiveInterface } from '../../../services/subscriptions/SlackInteractiveInterface';
import { SubscriptionManager } from '../../../services/notifications/SubscriptionManager';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('SlackInteractiveInterface', () => {
  let subManager: SubscriptionManager;
  let slackInterface: SlackInteractiveInterface;
  let mockWebInterface: any;

  beforeEach(() => {
    subManager = new SubscriptionManager();
    mockWebInterface = {
      generateAccessToken: jest.fn().mockResolvedValue({
        token: 'slack-web-token-123',
        platform: 'slack', userId: 'U123',
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
      })
    };
    slackInterface = new SlackInteractiveInterface(
      subManager, 'https://hooks.slack.com/test', mockWebInterface
    );
  });

  describe('constructor', () => {
    it('should initialize with platform name slack', () => {
      expect(slackInterface.platformName).toBe('slack');
    });

    it('should work without optional params', () => {
      const si = new SlackInteractiveInterface(subManager);
      expect(si.platformName).toBe('slack');
    });
  });

  describe('setWebInterface', () => {
    it('should set the web interface', () => {
      const si = new SlackInteractiveInterface(subManager);
      si.setWebInterface(mockWebInterface);
      // No throw
    });
  });

  describe('handleCommand', () => {
    it('should handle help command', async () => {
      const result = await slackInterface.handleCommand({
        command: 'help', platform: 'slack', userId: 'U123', args: []
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('구독');
    });

    it('should handle status command', async () => {
      subManager.addSubscription({
        platform: 'slack', userId: 'U123',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'TestUser'
      });

      const result = await slackInterface.handleCommand({
        command: 'status', platform: 'slack', userId: 'U123', args: []
      });
      expect(result.success).toBe(true);
    });

    it('should handle settings command', async () => {
      const result = await slackInterface.handleCommand({
        command: 'settings', platform: 'slack', userId: 'U123', args: []
      });
      expect(result.success).toBe(true);
    });

    it('should return USE_INTERACTIVE_BUTTONS for subscribe', async () => {
      const result = await slackInterface.handleCommand({
        command: 'subscribe', platform: 'slack', userId: 'U123', args: ['seoul']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('USE_INTERACTIVE_BUTTONS');
    });

    it('should return USE_INTERACTIVE_BUTTONS for unsubscribe', async () => {
      const result = await slackInterface.handleCommand({
        command: 'unsubscribe', platform: 'slack', userId: 'U123', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('USE_INTERACTIVE_BUTTONS');
    });

    it('should return USE_INTERACTIVE_BUTTONS for list', async () => {
      const result = await slackInterface.handleCommand({
        command: 'list', platform: 'slack', userId: 'U123', args: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('USE_INTERACTIVE_BUTTONS');
    });
  });

  describe('createSubscriptionMessage', () => {
    it('should create message for new user', async () => {
      const message = await slackInterface.createSubscriptionMessage('U456');
      expect(message).toBeDefined();
      expect(message.blocks || message.text).toBeTruthy();
    });

    it('should create message for existing user', async () => {
      subManager.addSubscription({
        platform: 'slack', userId: 'U123',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'Test'
      });

      const subscription = subManager.getUserSubscription('slack', 'U123');
      const message = await slackInterface.createSubscriptionMessage('U123', subscription!);
      expect(message).toBeDefined();
    });
  });

  describe('handleButtonAction', () => {
    it('should handle region selection action', async () => {
      const payload = {
        type: 'interactive_message',
        user: { id: 'U123', name: 'test' },
        channel: { id: 'C123' },
        actions: [{ name: 'select_regions', type: 'button', value: 'L1100000' }],
        callback_id: 'subscription_manage',
        team: { id: 'T123', domain: 'test' },
        original_message: {},
        response_url: 'https://hooks.slack.com/response',
        trigger_id: 'trig123'
      };

      const result = await slackInterface.handleButtonAction(payload);
      expect(result.success).toBe(true);
    });

    it('should handle warning selection action', async () => {
      subManager.addSubscription({
        platform: 'slack', userId: 'U123',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const payload = {
        type: 'interactive_message',
        user: { id: 'U123' },
        channel: { id: 'C123' },
        actions: [{ name: 'select_warnings', type: 'button', value: 'H' }],
        callback_id: 'subscription_manage',
        team: { id: 'T123', domain: 'test' },
        original_message: {},
        response_url: 'https://hooks.slack.com/response',
        trigger_id: 'trig123'
      };

      const result = await slackInterface.handleButtonAction(payload);
      expect(result.success).toBe(true);
    });

    it('should handle view_settings action', async () => {
      const payload = {
        type: 'interactive_message',
        user: { id: 'U123' },
        channel: { id: 'C123' },
        actions: [{ name: 'view_settings', type: 'button', value: 'view' }],
        callback_id: 'subscription_manage',
        team: { id: 'T123', domain: 'test' },
        original_message: {},
        response_url: 'https://hooks.slack.com/response',
        trigger_id: 'trig123'
      };

      const result = await slackInterface.handleButtonAction(payload);
      expect(result).toBeDefined();
    });

    it('should handle unsubscribe_all action', async () => {
      subManager.addSubscription({
        platform: 'slack', userId: 'U123',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const payload = {
        type: 'interactive_message',
        user: { id: 'U123' },
        channel: { id: 'C123' },
        actions: [{ name: 'unsubscribe_all', type: 'button', value: 'confirm' }],
        callback_id: 'subscription_manage',
        team: { id: 'T123', domain: 'test' },
        original_message: {},
        response_url: 'https://hooks.slack.com/response',
        trigger_id: 'trig123'
      };

      const result = await slackInterface.handleButtonAction(payload);
      expect(result.success).toBe(true);
    });

    it('should handle unknown action', async () => {
      const payload = {
        type: 'interactive_message',
        user: { id: 'U123' },
        channel: { id: 'C123' },
        actions: [{ name: 'unknown_action', type: 'button', value: 'xxx' }],
        callback_id: 'subscription_manage',
        team: { id: 'T123', domain: 'test' },
        original_message: {},
        response_url: 'https://hooks.slack.com/response',
        trigger_id: 'trig123'
      };

      const result = await slackInterface.handleButtonAction(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('createConfirmationMessage', () => {
    it('should create success confirmation', () => {
      const message = slackInterface.createConfirmationMessage({
        success: true, message: '구독 추가 완료'
      });
      expect(message).toBeDefined();
      expect(message.text || (message as any).blocks).toBeTruthy();
    });

    it('should create failure confirmation', () => {
      const message = slackInterface.createConfirmationMessage({
        success: false, message: '실패', error: 'ERR'
      });
      expect(message).toBeDefined();
    });
  });

  describe('enhanceAlertMessageWithSubscription', () => {
    it('should enhance alert message with subscription button', () => {
      const original = { text: '기상특보 발령', attachments: [] };
      const enhanced = slackInterface.enhanceAlertMessageWithSubscription(original, 'U123');
      expect(enhanced).toBeDefined();
    });

    it('should work without userId', () => {
      const original = { text: '기상특보 발령' };
      const enhanced = slackInterface.enhanceAlertMessageWithSubscription(original);
      expect(enhanced).toBeDefined();
    });
  });

  describe('generateAuthToken', () => {
    it('should generate auth token via web interface', async () => {
      const token = await slackInterface.generateAuthToken('U123');
      expect(token.platform).toBe('slack');
      expect(token.userId).toBe('U123');
      expect(token.token).toBeTruthy();
    });
  });

  describe('notifySubscriptionChange', () => {
    it('should not throw', async () => {
      await expect(
        slackInterface.notifySubscriptionChange('U123', 'test change')
      ).resolves.not.toThrow();
    });
  });

  describe('getHelpMessage', () => {
    it('should return help with subscription info', () => {
      const help = slackInterface.getHelpMessage();
      expect(help).toContain('구독');
    });
  });
});
