import { PrismaClient, WeatherAlert as PrismaWeatherAlert, AlertHistory as PrismaAlertHistory, RegionMapping as PrismaRegionMapping } from '@prisma/client';
import { AlertChange, AlertChangeType, CachedAlert, WeatherAlert } from '../../types/weather';
import { logger } from '../../utils/logger';

/**
 * 기상특보 Repository
 * Prisma를 통해 WeatherAlert, AlertHistory 테이블에 접근
 */
export class WeatherRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 특보 데이터 upsert (같은 지역+특보종류 → 업데이트)
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
        update: { ...data, updatedAt: new Date() },
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
   * 여러 특보 일괄 저장
   */
  async saveWeatherAlerts(alerts: WeatherAlert[]): Promise<void> {
    await Promise.all(alerts.map(alert => this.saveWeatherAlert(alert)));
    logger.info(`${alerts.length}개 특보 일괄 저장 완료`);
  }

  /**
   * 특보 변동 이력 저장
   */
  async saveAlertHistory(change: AlertChange): Promise<void> {
    const alert = change.current || change.previous!;

    if (!alert.regionId || !alert.regionName || !alert.warningType || !alert.level) {
      throw new Error(`AlertHistory 저장 실패 - 필수 필드 누락: ${JSON.stringify({
        regionId: alert.regionId,
        regionName: alert.regionName,
        warningType: alert.warningType,
        level: alert.level,
        changeType: change.type,
      })}`);
    }

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
  }

  /**
   * 여러 특보 이력 일괄 저장
   */
  async saveAlertHistories(changes: AlertChange[]): Promise<void> {
    await Promise.all(changes.map(change => this.saveAlertHistory(change)));
    logger.info(`${changes.length}개 특보 이력 일괄 저장 완료`);
  }

  /**
   * CachedAlert → DB 동기화
   * 캐시에 있는 특보는 upsert, 없는 특보는 해제 처리
   */
  async syncCachedAlerts(cachedAlerts: CachedAlert[]): Promise<void> {
    // 활성 특보 upsert
    if (cachedAlerts.length > 0) {
      await Promise.all(cachedAlerts.map(async (alert) => {
        const announcedAt = this.parseKmaTimestamp(alert.announcedAt);
        const effectiveAt = this.parseKmaTimestamp(alert.effectiveAt);
        const endTime = alert.endTime ? this.parseKmaTimestamp(alert.endTime) : null;

        await this.prisma.weatherAlert.upsert({
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
            announcedAt,
            effectiveAt,
            endTime,
            updatedAt: new Date(),
          },
          create: {
            regionId: alert.regionId,
            regionName: alert.regionName,
            upperRegion: alert.upperRegion || null,
            warningType: alert.warningType,
            warningLevel: alert.level,
            command: alert.command,
            announcedAt,
            effectiveAt,
            endTime,
          },
        });
      }));
    }

    // 캐시에 없는 특보 해제 처리
    const resolvedCondition = cachedAlerts.length > 0
      ? {
          NOT: {
            OR: cachedAlerts.map(a => ({
              AND: [{ regionId: a.regionId }, { warningType: a.warningType }],
            })),
          },
          command: { notIn: ['3', '4', '7'] },
        }
      : { command: { notIn: ['3', '4', '7'] } };

    const result = await this.prisma.weatherAlert.updateMany({
      where: resolvedCondition,
      data: { command: '3', updatedAt: new Date() },
    });

    logger.debug(`캐시 특보 동기화 완료: ${cachedAlerts.length}개 활성, ${result.count}개 해제`);
  }

  /**
   * 현재 활성 특보 조회
   */
  async getCurrentAlerts(filters?: {
    regionId?: string;
    warningType?: string;
    warningLevel?: string;
    upperRegion?: string;
  }): Promise<PrismaWeatherAlert[]> {
    const alerts = await this.prisma.weatherAlert.findMany({
      where: {
        regionId: filters?.regionId,
        warningType: filters?.warningType,
        warningLevel: filters?.warningLevel,
        upperRegion: filters?.upperRegion,
        command: { notIn: ['3', '4', '7'] },
      },
      orderBy: { announcedAt: 'desc' },
    });

    logger.debug(`현재 특보 조회: ${alerts.length}건`);
    return alerts;
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
  }): Promise<PrismaAlertHistory[]> {
    const histories = await this.prisma.alertHistory.findMany({
      where: {
        timestamp: { gte: filters.startDate, lte: filters.endDate },
        regionId: filters.regionId,
        warningType: filters.warningType,
        changeType: filters.changeType,
      },
      orderBy: { timestamp: 'desc' },
    });

    logger.debug(`특보 이력 조회: ${histories.length}건`);
    return histories;
  }

  /**
   * 특보 통계 (groupBy)
   */
  async getAlertStatistics(filters: {
    startDate: Date;
    endDate: Date;
    groupBy: 'region' | 'warningType' | 'level';
  }): Promise<Record<string, unknown>[]> {
    type GroupByField = 'upperRegion' | 'warningType' | 'warningLevel';
    const groupByMap: Record<string, GroupByField> = {
      region: 'upperRegion',
      warningType: 'warningType',
      level: 'warningLevel',
    };
    const groupByKey = groupByMap[filters.groupBy];

    const stats = await this.prisma.alertHistory.groupBy({
      by: [groupByKey],
      where: {
        timestamp: { gte: filters.startDate, lte: filters.endDate },
        changeType: 'NEW',
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    logger.debug(`특보 통계 조회: ${stats.length}건`);
    return stats;
  }

  /**
   * 오래된 이력 정리
   */
  async cleanupOldData(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.alertHistory.deleteMany({
      where: { timestamp: { lt: cutoffDate } },
    });

    logger.info(`${result.count}개 오래된 이력 데이터 삭제 (${retentionDays}일 이전)`);
    return result.count;
  }

  /**
   * 지역 매핑 저장
   */
  async saveRegionMapping(regionId: string, regionName: string, upperRegion: string): Promise<void> {
    await this.prisma.regionMapping.upsert({
      where: { regionId },
      update: { regionName, upperRegion },
      create: { regionId, regionName, upperRegion },
    });
  }

  /**
   * 지역 매핑 조회
   */
  async getRegionMapping(regionId: string): Promise<PrismaRegionMapping | null> {
    return this.prisma.regionMapping.findUnique({ where: { regionId } });
  }

  /**
   * KMA 타임스탬프(YYYYMMDDHHmm) → Date
   */
  private parseKmaTimestamp(kmaTimestamp: string): Date {
    if (!kmaTimestamp || kmaTimestamp.length !== 12 || !/^\d{12}$/.test(kmaTimestamp)) {
      throw new Error(`Invalid KMA timestamp format: ${kmaTimestamp}`);
    }

    const year = kmaTimestamp.substring(0, 4);
    const month = kmaTimestamp.substring(4, 6);
    const day = kmaTimestamp.substring(6, 8);
    const hour = kmaTimestamp.substring(8, 10);
    const minute = kmaTimestamp.substring(10, 12);

    const isoString = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
    const date = new Date(isoString);

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date from KMA timestamp: ${kmaTimestamp}`);
    }

    return date;
  }
}
