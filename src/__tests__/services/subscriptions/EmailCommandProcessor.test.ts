import { EmailCommandProcessor } from '../../../services/subscriptions/EmailCommandProcessor';
import { SubscriptionManager } from '../../../services/notifications/SubscriptionManager';
import { WebSubscriptionInterface } from '../../../services/subscriptions/WebSubscriptionInterface';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('EmailCommandProcessor', () => {
  let subManager: SubscriptionManager;
  let processor: EmailCommandProcessor;
  let mockWebInterface: jest.Mocked<Pick<WebSubscriptionInterface, 'generateAccessToken'>>;

  beforeEach(() => {
    subManager = new SubscriptionManager();
    mockWebInterface = {
      generateAccessToken: jest.fn().mockResolvedValue({
        token: 'test-web-token-abc123',
        platform: 'email', userId: 'test@example.com',
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
      })
    };
    processor = new EmailCommandProcessor(
      subManager, undefined, mockWebInterface as any
    );
  });

  describe('constructor', () => {
    it('should initialize with default dashboard URL', () => {
      const p = new EmailCommandProcessor(subManager);
      expect(p.platformName).toBe('email');
    });

    it('should accept custom dashboard URL', () => {
      const p = new EmailCommandProcessor(subManager, undefined, undefined, 'https://custom.url');
      expect(p.platformName).toBe('email');
    });
  });

  describe('setWebInterface', () => {
    it('should set the web interface', () => {
      const p = new EmailCommandProcessor(subManager);
      p.setWebInterface(mockWebInterface as any);
      // Should not throw
    });
  });

  describe('handleCommand', () => {
    describe('subscribe', () => {
      it('should subscribe to a region', async () => {
        const result = await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: ['seoul']
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('서울');
      });

      it('should subscribe to a region with warning type', async () => {
        const result = await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: ['seoul', 'heat']
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('폭염');
      });

      it('should fail with invalid region', async () => {
        const result = await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: ['mars']
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_REGION');
      });

      it('should fail without region arg', async () => {
        const result = await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_COMMAND_FORMAT');
      });

      it('should merge with existing subscription regions', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: [],
          enabled: true, displayName: 'Test'
        });

        await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: ['busan']
        });

        const sub = subManager.getUserSubscription('email', 'test@example.com');
        expect(sub!.targetRegions).toContain('L1100000');
        expect(sub!.targetRegions).toContain('L1150000');
      });

      it('should handle "all" warning type by clearing warning types', async () => {
        const result = await processor.handleCommand({
          command: 'subscribe', platform: 'email', userId: 'test@example.com',
          args: ['seoul', 'all']
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('모든 특보');
      });
    });

    describe('unsubscribe', () => {
      it('should fail when no subscription exists', async () => {
        const result = await processor.handleCommand({
          command: 'unsubscribe', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('NO_SUBSCRIPTION');
      });

      it('should remove all subscriptions without args', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: [],
          enabled: true, displayName: 'Test'
        });

        const result = await processor.handleCommand({
          command: 'unsubscribe', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(true);
        expect(subManager.getUserSubscription('email', 'test@example.com')).toBeUndefined();
      });

      it('should remove specific region', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000', 'L1150000'], warningTypes: [],
          enabled: true, displayName: 'Test'
        });

        const result = await processor.handleCommand({
          command: 'unsubscribe', platform: 'email', userId: 'test@example.com',
          args: ['seoul']
        });
        expect(result.success).toBe(true);

        const sub = subManager.getUserSubscription('email', 'test@example.com');
        expect(sub!.targetRegions).not.toContain('L1100000');
        expect(sub!.targetRegions).toContain('L1150000');
      });

      it('should remove subscription when last region removed', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: [],
          enabled: true, displayName: 'Test'
        });

        const result = await processor.handleCommand({
          command: 'unsubscribe', platform: 'email', userId: 'test@example.com',
          args: ['seoul']
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('모든 구독이 제거');
      });

      it('should fail with invalid region', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: [],
          enabled: true, displayName: 'Test'
        });

        const result = await processor.handleCommand({
          command: 'unsubscribe', platform: 'email', userId: 'test@example.com',
          args: ['mars']
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_REGION');
      });
    });

    describe('status/list', () => {
      it('should show status with subscription', async () => {
        subManager.addSubscription({
          platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: ['H'],
          enabled: true, displayName: 'Test'
        });

        const result = await processor.handleCommand({
          command: 'status', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('구독 현황');
        expect(result.message).toContain('test-web-token');
      });

      it('should show status without subscription', async () => {
        const result = await processor.handleCommand({
          command: 'status', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('구독 중인 알림이 없습니다');
      });

      it('should handle list as alias for status', async () => {
        const result = await processor.handleCommand({
          command: 'list', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(true);
      });
    });

    describe('help', () => {
      it('should return help message', async () => {
        const result = await processor.handleCommand({
          command: 'help', platform: 'email', userId: 'test@example.com',
          args: []
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('도움말');
      });
    });

    describe('unknown command', () => {
      it('should return error for unsupported command', async () => {
        const result = await processor.handleCommand({
          command: 'quiet' as any, platform: 'email', userId: 'test@example.com',
          args: ['22:00', '08:00']
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('extractCommand', () => {
    it('should extract command from Re: subject', () => {
      const result = processor.extractCommand(
        'Re: 기상특보 - SUBSCRIBE seoul heat',
        'From: test@example.com'
      );
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
      expect(result!.args).toContain('seoul');
    });

    it('should extract command from direct subject', () => {
      const result = processor.extractCommand(
        'SUBSCRIBE seoul',
        'From: test@example.com'
      );
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should extract command from body when subject has no command', () => {
      const result = processor.extractCommand(
        'Random subject',
        'SUBSCRIBE seoul\nFrom: test@example.com'
      );
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should extract From email as userId', () => {
      const result = processor.extractCommand(
        'STATUS',
        'Some body\nFrom: user@test.com'
      );
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user@test.com');
    });

    it('should use default userId when no From header', () => {
      const result = processor.extractCommand(
        'STATUS',
        'No from header here'
      );
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('unknown@email.com');
    });

    it('should return null when no command found', () => {
      const result = processor.extractCommand(
        'Random subject',
        'Random body with no commands'
      );
      expect(result).toBeNull();
    });

    it('should return null for empty inputs', () => {
      expect(processor.extractCommand('', '')).toBeNull();
    });
  });

  describe('createResponseEmail', () => {
    it('should create success email', () => {
      const email = processor.createResponseEmail(
        { success: true, message: '구독 추가 완료' },
        'test@example.com'
      );
      expect(email.subject).toContain('성공');
      expect(email.html).toContain('구독 추가 완료');
      expect(email.text).toContain('구독 추가 완료');
    });

    it('should create failure email', () => {
      const email = processor.createResponseEmail(
        { success: false, message: '잘못된 명령어', error: 'INVALID' },
        'test@example.com'
      );
      expect(email.subject).toContain('실패');
      expect(email.html).toContain('error');
    });

    it('should include HTML help section', () => {
      const email = processor.createResponseEmail(
        { success: true, message: 'OK' },
        'test@example.com'
      );
      expect(email.html).toContain('SUBSCRIBE');
      expect(email.html).toContain('UNSUBSCRIBE');
    });
  });

  describe('createConfirmationEmail', () => {
    it('should include subscription summary', async () => {
      const email = await processor.createConfirmationEmail(
        {
          id: '1', platform: 'email', userId: 'test@example.com',
          targetRegions: ['L1100000'], warningTypes: ['H'],
          enabled: true, createdAt: new Date(), updatedAt: new Date()
        },
        'test@example.com'
      );
      expect(email.subject).toContain('구독 설정 확인');
      expect(email.text).toContain('서울');
      expect(email.html).toContain('test-web-token');
    });
  });

  describe('generateAuthToken', () => {
    it('should return a valid auth token', async () => {
      const token = await processor.generateAuthToken('test@example.com');
      expect(token.platform).toBe('email');
      expect(token.userId).toBe('test@example.com');
      expect(token.token).toBeTruthy();
    });
  });

  describe('notifySubscriptionChange', () => {
    it('should not throw with SMTP config', async () => {
      const p = new EmailCommandProcessor(subManager, { host: 'smtp.test.com' });
      await expect(p.notifySubscriptionChange('user@test.com', 'test change')).resolves.not.toThrow();
    });

    it('should not throw without SMTP config', async () => {
      await expect(processor.notifySubscriptionChange('user@test.com', 'test change')).resolves.not.toThrow();
    });
  });

  describe('getHelpMessage', () => {
    it('should return help text with commands', () => {
      const help = processor.getHelpMessage();
      expect(help).toContain('SUBSCRIBE');
      expect(help).toContain('UNSUBSCRIBE');
      expect(help).toContain('STATUS');
      expect(help).toContain('HELP');
    });
  });
});
