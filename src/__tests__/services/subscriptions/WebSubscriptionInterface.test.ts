import { WebSubscriptionInterface } from '../../../services/subscriptions/WebSubscriptionInterface';
import { SubscriptionManager } from '../../../services/notifications/SubscriptionManager';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

function createMockTokenService() {
  return {
    validateToken: jest.fn().mockResolvedValue({
      token: 'valid-token', platform: 'telegram', userId: 'user1',
      displayName: 'Test User', expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date()
    }),
    generateToken: jest.fn().mockResolvedValue({
      token: 'new-generated-token', platform: 'telegram', userId: 'user1',
      expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
    }),
    revokeToken: jest.fn().mockResolvedValue(true)
  };
}

describe('WebSubscriptionInterface', () => {
  let subManager: SubscriptionManager;
  let mockTokenService: ReturnType<typeof createMockTokenService>;
  let webInterface: WebSubscriptionInterface;

  beforeEach(() => {
    subManager = new SubscriptionManager();
    mockTokenService = createMockTokenService();
    webInterface = new WebSubscriptionInterface(subManager, mockTokenService as any);
  });

  describe('authenticateWithToken', () => {
    it('should return existing subscription for valid token', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'Test'
      });

      const result = await webInterface.authenticateWithToken('valid-token');
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('telegram');
      expect(result!.targetRegions).toContain('L1100000');
    });

    it('should return default subscription for new user', async () => {
      const result = await webInterface.authenticateWithToken('valid-token');
      expect(result).not.toBeNull();
      expect(result!.id).toMatch(/^temp_/);
      expect(result!.enabled).toBe(false);
      expect(result!.targetRegions).toEqual([]);
    });

    it('should return null for invalid token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const result = await webInterface.authenticateWithToken('bad-token');
      expect(result).toBeNull();
    });

    it('should return null on validation error', async () => {
      mockTokenService.validateToken.mockRejectedValue(new Error('DB error'));
      const result = await webInterface.authenticateWithToken('token');
      expect(result).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription with valid token', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        targetRegions: ['L1100000'],
        warningTypes: ['H'],
        enabled: true
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should fail with expired token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const result = await webInterface.updateSubscription('bad-token', {
        targetRegions: ['L1100000']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });

    it('should merge preferences with existing subscription', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test',
        preferences: { minLevel: '2' }
      });

      const result = await webInterface.updateSubscription('valid-token', {
        preferences: { quietHours: { start: '22:00', end: '08:00' } }
      });
      expect(result.success).toBe(true);
    });

    it('should remove quietHours when explicitly set to null', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test',
        preferences: { quietHours: { start: '22:00', end: '08:00' } }
      });

      const result = await webInterface.updateSubscription('valid-token', {
        preferences: { quietHours: null }
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid region code', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        targetRegions: ['INVALID_CODE']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_REGION_CODE');
    });

    it('should reject invalid warning type', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        warningTypes: ['X']
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_WARNING_TYPE');
    });

    it('should reject invalid time format in quiet hours', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        preferences: { quietHours: { start: '25:00', end: '08:00' } }
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_TIME_FORMAT');
    });

    it('should reject invalid min level', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        preferences: { minLevel: '5' }
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_WARNING_LEVEL');
    });

    it('should accept valid region codes', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        targetRegions: ['L1100000', 'L1150000']
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty region (nationwide)', async () => {
      const result = await webInterface.updateSubscription('valid-token', {
        targetRegions: ['']
      });
      expect(result.success).toBe(true);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return subscriptions for valid token', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const subs = await webInterface.getUserSubscriptions('valid-token');
      expect(subs).toHaveLength(1);
    });

    it('should return empty for invalid token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const subs = await webInterface.getUserSubscriptions('bad-token');
      expect(subs).toEqual([]);
    });

    it('should return empty for user without subscription', async () => {
      const subs = await webInterface.getUserSubscriptions('valid-token');
      expect(subs).toEqual([]);
    });
  });

  describe('getSubscriptionStats', () => {
    it('should return stats for valid token', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'Test'
      });

      const stats = await webInterface.getSubscriptionStats('valid-token');
      expect(stats).not.toBeNull();
      expect(stats!.overall).toBeDefined();
      expect(stats!.user).toBeDefined();
      expect(stats!.metadata).toBeDefined();
    });

    it('should return null for invalid token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const stats = await webInterface.getSubscriptionStats('bad-token');
      expect(stats).toBeNull();
    });

    it('should show user without subscription', async () => {
      const stats = await webInterface.getSubscriptionStats('valid-token');
      expect(stats).not.toBeNull();
      expect((stats!.user as any).hasSubscription).toBe(false);
    });
  });

  describe('getEnhancedSubscriptionInfo', () => {
    it('should return enhanced info with region names', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: ['H'],
        enabled: true, displayName: 'Test'
      });

      const result = await webInterface.getEnhancedSubscriptionInfo('valid-token');
      expect(result.success).toBe(true);
      expect(result.data!.regionNames).toContain('서울특별시');
      expect(result.data!.warningTypeNames).toContain('폭염');
      expect(result.data!.platformDisplayName).toBe('Telegram');
    });

    it('should return default subscription for new user', async () => {
      const result = await webInterface.getEnhancedSubscriptionInfo('valid-token');
      expect(result.success).toBe(true);
      expect(result.data!.regionNames).toEqual(['전국']);
    });

    it('should fail for invalid token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const result = await webInterface.getEnhancedSubscriptionInfo('bad-token');
      expect(result.success).toBe(false);
    });
  });

  describe('deleteSubscription', () => {
    it('should delete existing subscription', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      const result = await webInterface.deleteSubscription('valid-token');
      expect(result.success).toBe(true);
      expect(subManager.getUserSubscription('telegram', 'user1')).toBeUndefined();
    });

    it('should fail for invalid token', async () => {
      mockTokenService.validateToken.mockResolvedValue(null);
      const result = await webInterface.deleteSubscription('bad-token');
      expect(result.success).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });

    it('should fail when no subscription exists', async () => {
      const result = await webInterface.deleteSubscription('valid-token');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_SUBSCRIPTION');
    });

    it('should revoke token after successful delete', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      await webInterface.deleteSubscription('valid-token');
      expect(mockTokenService.revokeToken).toHaveBeenCalledWith('valid-token');
    });

    it('should handle token revocation failure gracefully', async () => {
      subManager.addSubscription({
        platform: 'telegram', userId: 'user1',
        targetRegions: ['L1100000'], warningTypes: [],
        enabled: true, displayName: 'Test'
      });

      mockTokenService.revokeToken.mockResolvedValue(false);
      const result = await webInterface.deleteSubscription('valid-token');
      expect(result.success).toBe(true); // Subscription still deleted
    });
  });

  describe('generateAccessToken', () => {
    it('should delegate to token service', async () => {
      const tokenInfo = await webInterface.generateAccessToken('telegram', 'user1', 'Test');
      expect(mockTokenService.generateToken).toHaveBeenCalledWith({
        platform: 'telegram', userId: 'user1', displayName: 'Test',
        expiresInHours: 720
      });
      expect(tokenInfo.token).toBe('new-generated-token');
    });
  });

  describe('registerToken (deprecated)', () => {
    it('should delegate to token service', async () => {
      const authToken = {
        token: 'old-token', platform: 'slack', userId: 'U1',
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date()
      };
      await webInterface.registerToken(authToken);
      expect(mockTokenService.generateToken).toHaveBeenCalled();
    });
  });

  describe('getAvailableRegions', () => {
    it('should return all regions', () => {
      const regions = webInterface.getAvailableRegions();
      expect(regions.length).toBeGreaterThan(10);
      expect(regions.find(r => r.name === '서울특별시')).toBeDefined();
    });
  });

  describe('getAvailableWarningTypes', () => {
    it('should return all warning types', () => {
      const types = webInterface.getAvailableWarningTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types.find(t => t.name === '폭염')).toBeDefined();
    });
  });
});
