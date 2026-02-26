import { TokenService } from '../../services/TokenService';

// Mock Prisma
const mockPrisma = {
  webAccessToken: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
};

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    tokenService = new TokenService(mockPrisma as any);
  });

  describe('generateToken', () => {
    it('새 토큰을 생성한다', async () => {
      const mockRecord = {
        token: 'abc123',
        platform: 'telegram',
        userId: 'user1',
        displayName: 'Test User',
        expiresAt: new Date('2026-03-28'),
        createdAt: new Date('2026-02-26'),
      };
      mockPrisma.webAccessToken.upsert.mockResolvedValue(mockRecord);

      const result = await tokenService.generateToken({
        platform: 'telegram',
        userId: 'user1',
        displayName: 'Test User',
      });

      expect(result.platform).toBe('telegram');
      expect(result.userId).toBe('user1');
      expect(result.displayName).toBe('Test User');
      expect(mockPrisma.webAccessToken.upsert).toHaveBeenCalledTimes(1);
    });

    it('expiresInHours 옵션을 사용한다', async () => {
      const mockRecord = {
        token: 'abc123',
        platform: 'slack',
        userId: 'u2',
        displayName: null,
        expiresAt: new Date('2026-02-27'),
        createdAt: new Date('2026-02-26'),
      };
      mockPrisma.webAccessToken.upsert.mockResolvedValue(mockRecord);

      const result = await tokenService.generateToken({
        platform: 'slack',
        userId: 'u2',
        expiresInHours: 24,
      });

      expect(result.displayName).toBeUndefined();
      expect(result.platform).toBe('slack');
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.webAccessToken.upsert.mockRejectedValue(new Error('DB error'));

      await expect(
        tokenService.generateToken({
          platform: 'telegram',
          userId: 'user1',
        })
      ).rejects.toThrow('Failed to generate access token');
    });
  });

  describe('validateToken', () => {
    it('유효한 토큰의 정보를 반환한다', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);
      const mockRecord = {
        token: 'valid-token',
        platform: 'telegram',
        userId: 'user1',
        displayName: 'Test',
        expiresAt: futureDate,
        createdAt: new Date(),
      };
      mockPrisma.webAccessToken.findUnique.mockResolvedValue(mockRecord);
      mockPrisma.webAccessToken.update.mockResolvedValue(mockRecord);

      const result = await tokenService.validateToken('valid-token');

      expect(result).not.toBeNull();
      expect(result!.platform).toBe('telegram');
      expect(result!.userId).toBe('user1');
    });

    it('존재하지 않는 토큰은 null을 반환한다', async () => {
      mockPrisma.webAccessToken.findUnique.mockResolvedValue(null);

      const result = await tokenService.validateToken('invalid-token');

      expect(result).toBeNull();
    });

    it('만료된 토큰은 null을 반환한다', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 24);
      mockPrisma.webAccessToken.findUnique.mockResolvedValue({
        token: 'expired-token',
        platform: 'telegram',
        userId: 'user1',
        displayName: null,
        expiresAt: pastDate,
        createdAt: new Date(),
      });

      const result = await tokenService.validateToken('expired-token');

      expect(result).toBeNull();
    });

    it('DB 오류 시 null을 반환한다', async () => {
      mockPrisma.webAccessToken.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await tokenService.validateToken('some-token');

      expect(result).toBeNull();
    });

    it('lastUsedAt 업데이트 실패해도 토큰 검증은 성공한다', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);
      mockPrisma.webAccessToken.findUnique.mockResolvedValue({
        token: 'valid-token',
        platform: 'telegram',
        userId: 'user1',
        displayName: null,
        expiresAt: futureDate,
        createdAt: new Date(),
      });
      mockPrisma.webAccessToken.update.mockRejectedValue(new Error('update failed'));

      const result = await tokenService.validateToken('valid-token');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user1');
    });
  });

  describe('getTokenByUser', () => {
    it('사용자의 유효한 토큰을 반환한다', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);
      mockPrisma.webAccessToken.findUnique.mockResolvedValue({
        token: 'user-token',
        platform: 'telegram',
        userId: 'user1',
        displayName: 'Test',
        expiresAt: futureDate,
        createdAt: new Date(),
      });

      const result = await tokenService.getTokenByUser('telegram', 'user1');

      expect(result).not.toBeNull();
      expect(result!.token).toBe('user-token');
    });

    it('토큰이 없으면 null을 반환한다', async () => {
      mockPrisma.webAccessToken.findUnique.mockResolvedValue(null);

      const result = await tokenService.getTokenByUser('telegram', 'unknown');

      expect(result).toBeNull();
    });

    it('만료된 토큰이면 null을 반환한다', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 24);
      mockPrisma.webAccessToken.findUnique.mockResolvedValue({
        token: 'expired',
        platform: 'telegram',
        userId: 'user1',
        displayName: null,
        expiresAt: pastDate,
        createdAt: new Date(),
      });

      const result = await tokenService.getTokenByUser('telegram', 'user1');

      expect(result).toBeNull();
    });

    it('DB 오류 시 null을 반환한다', async () => {
      mockPrisma.webAccessToken.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await tokenService.getTokenByUser('telegram', 'user1');

      expect(result).toBeNull();
    });
  });

  describe('revokeToken', () => {
    it('토큰을 성공적으로 삭제한다', async () => {
      mockPrisma.webAccessToken.delete.mockResolvedValue({});

      const result = await tokenService.revokeToken('token-to-revoke');

      expect(result).toBe(true);
      expect(mockPrisma.webAccessToken.delete).toHaveBeenCalledWith({
        where: { token: 'token-to-revoke' },
      });
    });

    it('삭제 실패 시 false를 반환한다', async () => {
      mockPrisma.webAccessToken.delete.mockRejectedValue(new Error('Not found'));

      const result = await tokenService.revokeToken('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('만료된 토큰을 정리하고 개수를 반환한다', async () => {
      mockPrisma.webAccessToken.deleteMany.mockResolvedValue({ count: 5 });

      const result = await tokenService.cleanupExpiredTokens();

      expect(result).toBe(5);
      expect(mockPrisma.webAccessToken.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('만료된 토큰이 없으면 0을 반환한다', async () => {
      mockPrisma.webAccessToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await tokenService.cleanupExpiredTokens();

      expect(result).toBe(0);
    });

    it('DB 오류 시 0을 반환한다', async () => {
      mockPrisma.webAccessToken.deleteMany.mockRejectedValue(new Error('DB error'));

      const result = await tokenService.cleanupExpiredTokens();

      expect(result).toBe(0);
    });
  });

  describe('getActiveTokenStats', () => {
    it('플랫폼별 활성 토큰 통계를 반환한다', async () => {
      mockPrisma.webAccessToken.findMany.mockResolvedValue([
        { platform: 'telegram' },
        { platform: 'telegram' },
        { platform: 'slack' },
        { platform: 'email' },
      ]);

      const result = await tokenService.getActiveTokenStats();

      expect(result).toEqual({
        telegram: 2,
        slack: 1,
        email: 1,
      });
    });

    it('활성 토큰이 없으면 빈 객체를 반환한다', async () => {
      mockPrisma.webAccessToken.findMany.mockResolvedValue([]);

      const result = await tokenService.getActiveTokenStats();

      expect(result).toEqual({});
    });

    it('DB 오류 시 빈 객체를 반환한다', async () => {
      mockPrisma.webAccessToken.findMany.mockRejectedValue(new Error('DB error'));

      const result = await tokenService.getActiveTokenStats();

      expect(result).toEqual({});
    });
  });
});
