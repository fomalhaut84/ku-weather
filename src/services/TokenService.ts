/**
 * TokenService
 * 웹 대시보드 접근 토큰 생성 및 관리
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface TokenInfo {
  token: string;
  platform: string;
  userId: string;
  displayName?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface TokenGenerationOptions {
  platform: string;
  userId: string;
  displayName?: string;
  expiresInHours?: number; // 기본값: 720시간 (30일)
}

export class TokenService {
  private prisma: PrismaClient;
  private readonly DEFAULT_EXPIRY_HOURS = 720; // 30일
  private readonly TOKEN_LENGTH = 32; // 256비트 (32바이트 hex)

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 안전한 랜덤 토큰 생성
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  /**
   * 새로운 웹 접근 토큰 생성
   *
   * 같은 플랫폼의 같은 사용자가 이미 토큰을 가지고 있으면 갱신
   */
  async generateToken(options: TokenGenerationOptions): Promise<TokenInfo> {
    const {
      platform,
      userId,
      displayName,
      expiresInHours = this.DEFAULT_EXPIRY_HOURS
    } = options;

    const token = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    try {
      // Upsert: 기존 토큰이 있으면 업데이트, 없으면 생성
      const tokenRecord = await this.prisma.webAccessToken.upsert({
        where: {
          platform_userId: {
            platform,
            userId
          }
        },
        update: {
          token,
          displayName,
          expiresAt,
          lastUsedAt: null // 새 토큰 발급 시 사용 기록 초기화
        },
        create: {
          token,
          platform,
          userId,
          displayName,
          expiresAt
        }
      });

      logger.info(`[TokenService] Token generated for ${platform}:${userId}`, {
        expiresAt: tokenRecord.expiresAt
      });

      return {
        token: tokenRecord.token,
        platform: tokenRecord.platform,
        userId: tokenRecord.userId,
        displayName: tokenRecord.displayName || undefined,
        expiresAt: tokenRecord.expiresAt,
        createdAt: tokenRecord.createdAt
      };
    } catch (error) {
      logger.error('[TokenService] Failed to generate token', { error });
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * 토큰 검증 및 정보 조회
   *
   * 만료된 토큰은 null 반환
   */
  async validateToken(token: string): Promise<TokenInfo | null> {
    try {
      const tokenRecord = await this.prisma.webAccessToken.findUnique({
        where: { token }
      });

      if (!tokenRecord) {
        logger.debug('[TokenService] Token not found', { token: token.substring(0, 8) + '...' });
        return null;
      }

      // 만료 확인
      if (tokenRecord.expiresAt < new Date()) {
        logger.debug('[TokenService] Token expired', {
          token: token.substring(0, 8) + '...',
          expiresAt: tokenRecord.expiresAt
        });
        return null;
      }

      // 마지막 사용 시각 업데이트 (비동기, 블로킹하지 않음)
      this.updateLastUsedAt(token).catch(err =>
        logger.error('[TokenService] Failed to update lastUsedAt', { error: err })
      );

      return {
        token: tokenRecord.token,
        platform: tokenRecord.platform,
        userId: tokenRecord.userId,
        displayName: tokenRecord.displayName || undefined,
        expiresAt: tokenRecord.expiresAt,
        createdAt: tokenRecord.createdAt
      };
    } catch (error) {
      logger.error('[TokenService] Failed to validate token', { error });
      return null;
    }
  }

  /**
   * 마지막 사용 시각 업데이트 (비동기)
   */
  private async updateLastUsedAt(token: string): Promise<void> {
    await this.prisma.webAccessToken.update({
      where: { token },
      data: { lastUsedAt: new Date() }
    });
  }

  /**
   * 특정 사용자의 토큰 조회
   */
  async getTokenByUser(platform: string, userId: string): Promise<TokenInfo | null> {
    try {
      const tokenRecord = await this.prisma.webAccessToken.findUnique({
        where: {
          platform_userId: {
            platform,
            userId
          }
        }
      });

      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        return null;
      }

      return {
        token: tokenRecord.token,
        platform: tokenRecord.platform,
        userId: tokenRecord.userId,
        displayName: tokenRecord.displayName || undefined,
        expiresAt: tokenRecord.expiresAt,
        createdAt: tokenRecord.createdAt
      };
    } catch (error) {
      logger.error('[TokenService] Failed to get token by user', { error, platform, userId });
      return null;
    }
  }

  /**
   * 토큰 무효화 (삭제)
   */
  async revokeToken(token: string): Promise<boolean> {
    try {
      await this.prisma.webAccessToken.delete({
        where: { token }
      });

      logger.info('[TokenService] Token revoked', { token: token.substring(0, 8) + '...' });
      return true;
    } catch (error) {
      logger.error('[TokenService] Failed to revoke token', { error });
      return false;
    }
  }

  /**
   * 만료된 토큰 정리 (크론잡 또는 주기적 실행)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await this.prisma.webAccessToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      if (result.count > 0) {
        logger.info(`[TokenService] Cleaned up ${result.count} expired tokens`);
      }

      return result.count;
    } catch (error) {
      logger.error('[TokenService] Failed to cleanup expired tokens', { error });
      return 0;
    }
  }

  /**
   * 플랫폼별 활성 토큰 수 조회 (통계)
   */
  async getActiveTokenStats(): Promise<Record<string, number>> {
    try {
      const tokens = await this.prisma.webAccessToken.findMany({
        where: {
          expiresAt: {
            gte: new Date()
          }
        },
        select: {
          platform: true
        }
      });

      const stats: Record<string, number> = {};
      for (const token of tokens) {
        stats[token.platform] = (stats[token.platform] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('[TokenService] Failed to get token stats', { error });
      return {};
    }
  }
}
