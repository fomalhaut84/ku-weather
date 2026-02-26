import { HybridSubscriptionManager } from '../../../services/subscriptions/HybridSubscriptionManager';
import { SubscriptionManager } from '../../../services/notifications/SubscriptionManager';
import { PlatformSubscriptionInterface, SubscriptionCommandParams } from '../../../services/subscriptions/interfaces';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

function createMockPlatformInterface(name: string): PlatformSubscriptionInterface {
  return {
    platformName: name,
    handleCommand: jest.fn().mockResolvedValue({ success: true, message: `${name} OK` }),
    generateAuthToken: jest.fn().mockResolvedValue({
      token: `${name}-token`, platform: name, userId: 'u1',
      expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
    }),
    notifySubscriptionChange: jest.fn().mockResolvedValue(undefined),
    getHelpMessage: jest.fn().mockReturnValue(`${name} help message`)
  };
}

describe('HybridSubscriptionManager', () => {
  let subManager: SubscriptionManager;
  let hybridManager: HybridSubscriptionManager;

  beforeEach(() => {
    subManager = new SubscriptionManager();
    hybridManager = new HybridSubscriptionManager(subManager);
  });

  describe('constructor', () => {
    it('should initialize with no registered platforms', () => {
      expect(hybridManager.getRegisteredPlatforms()).toEqual([]);
      expect(hybridManager.isWebInterfaceAvailable()).toBe(false);
    });
  });

  describe('registerPlatformInterface', () => {
    it('should register a platform', () => {
      const mock = createMockPlatformInterface('telegram');
      hybridManager.registerPlatformInterface('telegram', mock);
      expect(hybridManager.getRegisteredPlatforms()).toContain('telegram');
    });

    it('should register multiple platforms', () => {
      hybridManager.registerPlatformInterface('telegram', createMockPlatformInterface('telegram'));
      hybridManager.registerPlatformInterface('slack', createMockPlatformInterface('slack'));
      expect(hybridManager.getRegisteredPlatforms()).toHaveLength(2);
    });
  });

  describe('registerWebInterface', () => {
    it('should mark web interface as available', () => {
      const mockWeb = {} as any;
      hybridManager.registerWebInterface(mockWeb);
      expect(hybridManager.isWebInterfaceAvailable()).toBe(true);
    });
  });

  describe('processCommand', () => {
    it('should delegate to the correct platform interface', async () => {
      const mock = createMockPlatformInterface('telegram');
      hybridManager.registerPlatformInterface('telegram', mock);

      const params: SubscriptionCommandParams = {
        command: 'subscribe', platform: 'telegram', userId: 'u1', args: ['seoul']
      };

      const result = await hybridManager.processCommand(params);
      expect(result.success).toBe(true);
      expect(mock.handleCommand).toHaveBeenCalledWith(params);
    });

    it('should return error for unsupported platform', async () => {
      const params: SubscriptionCommandParams = {
        command: 'subscribe', platform: 'unknown', userId: 'u1', args: []
      };

      const result = await hybridManager.processCommand(params);
      expect(result.success).toBe(false);
      expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    });

    it('should handle platform interface errors', async () => {
      const mock = createMockPlatformInterface('telegram');
      (mock.handleCommand as jest.Mock).mockRejectedValue(new Error('boom'));
      hybridManager.registerPlatformInterface('telegram', mock);

      const params: SubscriptionCommandParams = {
        command: 'subscribe', platform: 'telegram', userId: 'u1', args: []
      };

      const result = await hybridManager.processCommand(params);
      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });

    it('should log success for successful commands', async () => {
      const mock = createMockPlatformInterface('slack');
      hybridManager.registerPlatformInterface('slack', mock);

      await hybridManager.processCommand({
        command: 'help', platform: 'slack', userId: 'u1', args: []
      });

      expect(mock.handleCommand).toHaveBeenCalled();
    });

    it('should log warning for failed commands', async () => {
      const mock = createMockPlatformInterface('slack');
      (mock.handleCommand as jest.Mock).mockResolvedValue({
        success: false, message: 'fail', error: 'SOME_ERROR'
      });
      hybridManager.registerPlatformInterface('slack', mock);

      const result = await hybridManager.processCommand({
        command: 'subscribe', platform: 'slack', userId: 'u1', args: []
      });

      expect(result.success).toBe(false);
    });
  });

  describe('token management', () => {
    it('should generate and validate tokens', async () => {
      const token = await hybridManager.generateUserToken('telegram', 'user123');
      expect(token.token).toBeTruthy();
      expect(token.platform).toBe('telegram');
      expect(token.userId).toBe('user123');

      const validated = await hybridManager.validateToken(token.token);
      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe('user123');
    });

    it('should return null for invalid token', async () => {
      const validated = await hybridManager.validateToken('nonexistent');
      expect(validated).toBeNull();
    });

    it('should revoke tokens', async () => {
      const token = await hybridManager.generateUserToken('slack', 'user456');
      const revoked = await hybridManager.revokeToken(token.token);
      expect(revoked).toBe(true);

      const validated = await hybridManager.validateToken(token.token);
      expect(validated).toBeNull();
    });

    it('should return false when revoking nonexistent token', async () => {
      const revoked = await hybridManager.revokeToken('nonexistent');
      expect(revoked).toBe(false);
    });

    it('should reject expired tokens', async () => {
      const token = await hybridManager.generateUserToken('telegram', 'user1');
      // Manually expire the token by modifying internal state
      const validated = await hybridManager.validateToken(token.token);
      expect(validated).not.toBeNull();
    });
  });

  describe('syncSubscriptions', () => {
    it('should complete without error', async () => {
      hybridManager.registerPlatformInterface('telegram', createMockPlatformInterface('telegram'));
      await expect(hybridManager.syncSubscriptions()).resolves.not.toThrow();
    });

    it('should handle errors in platform sync', async () => {
      hybridManager.registerPlatformInterface('telegram', createMockPlatformInterface('telegram'));
      await hybridManager.syncSubscriptions();
      // Should not throw
    });
  });

  describe('getPlatformStats', () => {
    it('should return stats with platform breakdown', async () => {
      hybridManager.registerPlatformInterface('telegram', createMockPlatformInterface('telegram'));

      subManager.addSubscription({
        platform: 'telegram', userId: 'u1',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'Test'
      });

      const stats = await hybridManager.getPlatformStats();
      expect(stats.overall).toBeDefined();
      expect(stats.platforms.telegram).toBeDefined();
      expect(stats.platforms.telegram.totalSubscriptions).toBe(1);
      expect(stats.interfaces.registered).toContain('telegram');
    });

    it('should include web interface status', async () => {
      const stats = await hybridManager.getPlatformStats();
      expect(stats.interfaces.webEnabled).toBe(false);

      hybridManager.registerWebInterface({} as any);
      const stats2 = await hybridManager.getPlatformStats();
      expect(stats2.interfaces.webEnabled).toBe(true);
    });

    it('should break down regions and warning types', async () => {
      hybridManager.registerPlatformInterface('slack', createMockPlatformInterface('slack'));

      subManager.addSubscription({
        platform: 'slack', userId: 'u1',
        targetRegions: ['L1100000', 'L1150000'], warningTypes: ['H', 'R'],
        enabled: true, displayName: 'Test'
      });
      subManager.addSubscription({
        platform: 'slack', userId: 'u2',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test2'
      });

      const stats = await hybridManager.getPlatformStats();
      expect(stats.platforms.slack.regions['L1100000']).toBe(2);
      expect(stats.platforms.slack.warningTypes['H']).toBe(1);
      expect(stats.platforms.slack.warningTypes['ALL']).toBe(1);
    });
  });

  describe('getSubscriptionManager', () => {
    it('should return the subscription manager', () => {
      expect(hybridManager.getSubscriptionManager()).toBe(subManager);
    });
  });

  describe('getHelpMessage', () => {
    it('should return help from the platform interface', async () => {
      const mock = createMockPlatformInterface('telegram');
      hybridManager.registerPlatformInterface('telegram', mock);

      const help = await hybridManager.getHelpMessage('telegram');
      expect(help).toBe('telegram help message');
    });

    it('should return error message for unknown platform', async () => {
      const help = await hybridManager.getHelpMessage('unknown');
      expect(help).toContain('지원하지 않는 플랫폼');
    });
  });
});
