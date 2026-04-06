import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

let prismaInstance: PrismaClient | null = null;

/**
 * Prisma 클라이언트 싱글턴
 * 애플리케이션 전체에서 하나의 인스턴스만 사용
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
    logger.info('Prisma client initialized');
  }
  return prismaInstance;
}

/**
 * Prisma 연결 해제 (graceful shutdown 시 사용)
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('Prisma client disconnected');
  }
}
