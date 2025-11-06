import { PrismaClient } from '@prisma/client';
import { WeatherAlert, AlertChange, AlertChangeType } from '../types/weather';
import { logger } from '../utils/logger';

/**
 * 데이터베이스 서비스
 * Prisma를 사용하여 기상특보 데이터를 PostgreSQL에 저장하고 조회합니다.
 */
export class DatabaseService {
  private prisma: PrismaClient;
  private static instance: DatabaseService;

  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.DEBUG === 'true' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
      // Phase 5: 연결 풀 최적화
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Prisma 클라이언트 반환
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * 데이터베이스 연결 테스트
   */
  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('데이터베이스 연결 성공');
    } catch (error) {
      logger.error('데이터베이스 연결 실패:', error);
      throw error;
    }
  }

  /**
   * 데이터베이스 연결 종료
   */
  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('데이터베이스 연결 종료');
    } catch (error) {
      logger.error('데이터베이스 연결 종료 실패:', error);
      throw error;
    }
  }

  /**
   * 기상특보 데이터 저장 (upsert)
   * 같은 지역의 같은 특보 종류는 업데이트, 없으면 생성
   */
  async saveWeatherAlert(alert: WeatherAlert): Promise<void> {
    try {
      const data = {
        regionId: alert.REG_ID,
        regionName: alert.REG_NAME,
        upperRegion: alert.upperRegion || null,
        warningType: alert.WRN,
        warningLevel: alert.LVL,
        command: alert.CMD,
        announcedAt: new Date(alert.TM_FC),
        effectiveAt: new Date(alert.TM_EF),
        endTime: alert.TM_ED ? new Date(alert.TM_ED) : null,
      };

      await this.prisma.weatherAlert.upsert({
        where: {
          regionId_warningType: {
            regionId: alert.REG_ID,
            warningType: alert.WRN,
          },
        },
        update: {
          ...data,
          updatedAt: new Date(),
        },
        create: data,
      });

      logger.debug(`특보 저장 완료: ${alert.REG_NAME} ${alert.WRN}`);
    } catch (error) {
      logger.error('특보 저장 실패:', {
        regionId: alert.REG_ID,
        warningType: alert.WRN,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 특보 변동 이력 저장
   */
  async saveAlertHistory(change: AlertChange): Promise<void> {
    try {
      const alert = change.current || change.previous!;

      await this.prisma.alertHistory.create({
        data: {
          regionId: alert.regionId,
          regionName: alert.regionName,
          upperRegion: alert.upperRegion || null,
          warningType: alert.warningType,
          warningLevel: alert.level,
          changeType: change.type,
          previousData: change.previous ? JSON.parse(JSON.stringify(change.previous)) : null,
          currentData: change.current ? JSON.parse(JSON.stringify(change.current)) : null,
        },
      });

      logger.debug(`특보 이력 저장 완료: ${alert.regionName} ${change.type}`);
    } catch (error) {
      logger.error('특보 이력 저장 실패:', {
        changeType: change.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 여러 특보 데이터 일괄 저장
   */
  async saveWeatherAlerts(alerts: WeatherAlert[]): Promise<void> {
    try {
      await Promise.all(alerts.map(alert => this.saveWeatherAlert(alert)));
      logger.info(`${alerts.length}개 특보 일괄 저장 완료`);
    } catch (error) {
      logger.error('특보 일괄 저장 실패:', error);
      throw error;
    }
  }

  /**
   * CachedAlert 데이터를 데이터베이스에 동기화
   * - 캐시에 있는 특보: upsert
   * - 캐시에 없는 특보: command='6' (해제)으로 업데이트
   */
  async syncCachedAlerts(cachedAlerts: Array<{
    regionId: string;
    regionName: string;
    upperRegion?: string;
    warningType: string;
    level: string;
    command: string;
    announcedAt: string;
    effectiveAt: string;
    endTime?: string;
  }>): Promise<void> {
    try {
      // 1. 모든 캐시된 특보를 upsert
      if (cachedAlerts.length > 0) {
        await Promise.all(cachedAlerts.map(alert =>
          this.prisma.weatherAlert.upsert({
            where: {
              regionId_warningType: {
                regionId: alert.regionId,
                warningType: alert.warningType,
              },
            },
            update: {
              regionName: alert.regionName,
              upperRegion: alert.upperRegion || null,
              warningLevel: alert.level,
              command: alert.command,
              announcedAt: new Date(alert.announcedAt),
              effectiveAt: new Date(alert.effectiveAt),
              endTime: alert.endTime ? new Date(alert.endTime) : null,
              updatedAt: new Date(),
            },
            create: {
              regionId: alert.regionId,
              regionName: alert.regionName,
              upperRegion: alert.upperRegion || null,
              warningType: alert.warningType,
              warningLevel: alert.level,
              command: alert.command,
              announcedAt: new Date(alert.announcedAt),
              effectiveAt: new Date(alert.effectiveAt),
              endTime: alert.endTime ? new Date(alert.endTime) : null,
            },
          })
        ));
      }

      // 2. 캐시에 없는 특보들을 해제 상태(command='6')로 업데이트
      let resolvedCount = 0;
      if (cachedAlerts.length > 0) {
        // 캐시에 있는 특보들의 키 생성
        const cachedKeys = cachedAlerts.map(a => ({
          regionId: a.regionId,
          warningType: a.warningType
        }));

        // 캐시에 없고 아직 해제되지 않은 특보들을 해제 상태로 업데이트
        const result = await this.prisma.weatherAlert.updateMany({
          where: {
            NOT: {
              OR: cachedKeys.map(key => ({
                AND: [
                  { regionId: key.regionId },
                  { warningType: key.warningType }
                ]
              }))
            },
            command: { not: '6' } // 이미 해제된 건 제외
          },
          data: {
            command: '6', // 해제로 마킹
            updatedAt: new Date()
          }
        });
        resolvedCount = result.count;
      } else {
        // 모든 특보가 해제된 경우 (cachedAlerts.length === 0)
        const result = await this.prisma.weatherAlert.updateMany({
          where: {
            command: { not: '6' }
          },
          data: {
            command: '6',
            updatedAt: new Date()
          }
        });
        resolvedCount = result.count;
      }

      logger.debug(`캐시 특보 동기화 완료: ${cachedAlerts.length}개 활성, ${resolvedCount}개 해제`);
    } catch (error) {
      logger.error('캐시 특보 동기화 실패:', error);
      throw error;
    }
  }

  /**
   * 여러 특보 이력 일괄 저장
   */
  async saveAlertHistories(changes: AlertChange[]): Promise<void> {
    try {
      await Promise.all(changes.map(change => this.saveAlertHistory(change)));
      logger.info(`${changes.length}개 특보 이력 일괄 저장 완료`);
    } catch (error) {
      logger.error('특보 이력 일괄 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 현재 발효 중인 특보 조회
   */
  async getCurrentAlerts(filters?: {
    regionId?: string;
    warningType?: string;
    warningLevel?: string;
    upperRegion?: string;
  }): Promise<any[]> {
    try {
      const alerts = await this.prisma.weatherAlert.findMany({
        where: {
          regionId: filters?.regionId,
          warningType: filters?.warningType,
          warningLevel: filters?.warningLevel,
          upperRegion: filters?.upperRegion,
          // 해제되지 않은 특보만 (CMD != 6)
          command: { not: '6' },
        },
        orderBy: {
          announcedAt: 'desc',
        },
      });

      logger.debug(`현재 특보 조회: ${alerts.length}건`);
      return alerts;
    } catch (error) {
      logger.error('현재 특보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 특보 이력 조회 (기간별)
   */
  async getAlertHistory(filters: {
    startDate: Date;
    endDate: Date;
    regionId?: string;
    warningType?: string;
    changeType?: AlertChangeType;
  }): Promise<any[]> {
    try {
      const histories = await this.prisma.alertHistory.findMany({
        where: {
          timestamp: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
          regionId: filters.regionId,
          warningType: filters.warningType,
          changeType: filters.changeType,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      logger.debug(`특보 이력 조회: ${histories.length}건`);
      return histories;
    } catch (error) {
      logger.error('특보 이력 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 특보 발생 빈도 통계
   */
  async getAlertStatistics(filters: {
    startDate: Date;
    endDate: Date;
    groupBy: 'region' | 'warningType' | 'level';
  }): Promise<any[]> {
    try {
      let groupByField: any;

      switch (filters.groupBy) {
        case 'region':
          groupByField = { upperRegion: true };
          break;
        case 'warningType':
          groupByField = { warningType: true };
          break;
        case 'level':
          groupByField = { warningLevel: true };
          break;
      }

      const stats = await this.prisma.alertHistory.groupBy({
        by: Object.keys(groupByField) as any,
        where: {
          timestamp: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
          changeType: 'NEW', // 신규 발표만 카운트
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      });

      logger.debug(`특보 통계 조회: ${stats.length}건`);
      return stats;
    } catch (error) {
      logger.error('특보 통계 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 오래된 데이터 정리
   */
  async cleanupOldData(retentionDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.prisma.alertHistory.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`${result.count}개 오래된 이력 데이터 삭제 (${retentionDays}일 이전)`);
      return result.count;
    } catch (error) {
      logger.error('데이터 정리 실패:', error);
      throw error;
    }
  }

  /**
   * 지역 매핑 캐시 저장
   */
  async saveRegionMapping(regionId: string, regionName: string, upperRegion: string): Promise<void> {
    try {
      await this.prisma.regionMapping.upsert({
        where: { regionId },
        update: {
          regionName,
          upperRegion,
        },
        create: {
          regionId,
          regionName,
          upperRegion,
        },
      });

      logger.debug(`지역 매핑 저장: ${regionName} -> ${upperRegion}`);
    } catch (error) {
      logger.error('지역 매핑 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 지역 매핑 조회
   */
  async getRegionMapping(regionId: string): Promise<any | null> {
    try {
      return await this.prisma.regionMapping.findUnique({
        where: { regionId },
      });
    } catch (error) {
      logger.error('지역 매핑 조회 실패:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 export
export const databaseService = DatabaseService.getInstance();
