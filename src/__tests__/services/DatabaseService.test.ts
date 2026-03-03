import { AlertChangeType, CachedAlert } from '../../types/weather';

// Mock logger - must be before DatabaseService import
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock PrismaClient - jest.mock is hoisted, so use inline object
const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  weatherAlert: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  alertHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  regionMapping: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  };
});

import { DatabaseService } from '../../services/DatabaseService';

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    // 싱글톤 인스턴스 리셋
    (DatabaseService as any).instance = undefined;
    dbService = new DatabaseService();
  });

  describe('getInstance', () => {
    it('싱글톤 인스턴스를 반환한다', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getPrismaClient', () => {
    it('Prisma 클라이언트를 반환한다', () => {
      const client = dbService.getPrismaClient();
      expect(client).toBeDefined();
    });
  });

  describe('connect', () => {
    it('데이터베이스에 성공적으로 연결한다', async () => {
      mockPrisma.$connect.mockResolvedValue(undefined);

      await dbService.connect();

      expect(mockPrisma.$connect).toHaveBeenCalledTimes(1);
    });

    it('연결 실패 시 예외를 던진다', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('Connection failed'));

      await expect(dbService.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('데이터베이스 연결을 종료한다', async () => {
      mockPrisma.$disconnect.mockResolvedValue(undefined);

      await dbService.disconnect();

      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('연결 종료 실패 시 예외를 던진다', async () => {
      mockPrisma.$disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(dbService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('saveWeatherAlert', () => {
    const mockAlert = {
      REG_ID: 'L1100000',
      REG_NAME: '서울특별시',
      upperRegion: '서울특별시',
      WRN: 'W',
      LVL: '주의보',
      CMD: '1',
      TM_FC: '202602261000',
      TM_EF: '202602261200',
      TM_ED: '',
      other: 'value',
    } as any;

    it('특보를 성공적으로 저장한다', async () => {
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});

      await dbService.saveWeatherAlert(mockAlert);

      expect(mockPrisma.weatherAlert.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.weatherAlert.upsert.mock.calls[0][0];
      expect(call.where.regionId_warningType.regionId).toBe('L1100000');
      expect(call.where.regionId_warningType.warningType).toBe('W');
    });

    it('저장 실패 시 예외를 던진다', async () => {
      mockPrisma.weatherAlert.upsert.mockRejectedValue(new Error('Save failed'));

      await expect(dbService.saveWeatherAlert(mockAlert)).rejects.toThrow('Save failed');
    });
  });

  describe('saveAlertHistory', () => {
    it('특보 변동 이력을 저장한다', async () => {
      mockPrisma.alertHistory.create.mockResolvedValue({});
      const change = {
        type: 'NEW' as AlertChangeType,
        current: {
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
        },
        previous: undefined,
      };

      await dbService.saveAlertHistory(change as any);

      expect(mockPrisma.alertHistory.create).toHaveBeenCalledTimes(1);
    });

    it('RESOLVED 타입에서 previous 데이터를 사용한다', async () => {
      mockPrisma.alertHistory.create.mockResolvedValue({});
      const change = {
        type: 'RESOLVED' as AlertChangeType,
        current: undefined,
        previous: {
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          level: '주의보',
          command: '3',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
        },
      };

      await dbService.saveAlertHistory(change as any);

      expect(mockPrisma.alertHistory.create).toHaveBeenCalledTimes(1);
    });

    it('필수 필드 누락 시 예외를 던진다', async () => {
      const change = {
        type: 'NEW' as AlertChangeType,
        current: {
          regionId: '',
          regionName: '',
          warningType: '',
          level: '',
          command: '1',
        },
        previous: undefined,
      };

      await expect(dbService.saveAlertHistory(change as any)).rejects.toThrow('필수 필드 누락');
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.alertHistory.create.mockRejectedValue(new Error('DB error'));
      const change = {
        type: 'NEW' as AlertChangeType,
        current: {
          regionId: 'L1100000',
          regionName: '서울',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
        },
      };

      await expect(dbService.saveAlertHistory(change as any)).rejects.toThrow('DB error');
    });
  });

  describe('saveWeatherAlerts', () => {
    it('여러 특보를 일괄 저장한다', async () => {
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});

      const alerts = [
        { REG_ID: 'L1100000', REG_NAME: '서울', WRN: 'W', LVL: '주의보', CMD: '1', TM_FC: '202602261000', TM_EF: '202602261200' },
        { REG_ID: 'L2600000', REG_NAME: '부산', WRN: 'R', LVL: '경보', CMD: '1', TM_FC: '202602261000', TM_EF: '202602261200' },
      ] as any[];

      await dbService.saveWeatherAlerts(alerts);

      expect(mockPrisma.weatherAlert.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveAlertHistories', () => {
    it('여러 이력을 일괄 저장한다', async () => {
      mockPrisma.alertHistory.create.mockResolvedValue({});

      const changes = [
        {
          type: 'NEW' as AlertChangeType,
          current: { regionId: 'L1100000', regionName: '서울', warningType: 'W', level: '주의보', command: '1', announcedAt: '202602261000', effectiveAt: '202602261200' },
        },
      ];

      await dbService.saveAlertHistories(changes as any);

      expect(mockPrisma.alertHistory.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentAlerts', () => {
    it('현재 발효 중인 특보를 조회한다', async () => {
      const mockAlerts = [
        { id: 1, regionId: 'L1100000', regionName: '서울', warningType: 'W' },
      ];
      mockPrisma.weatherAlert.findMany.mockResolvedValue(mockAlerts);

      const result = await dbService.getCurrentAlerts();

      expect(result).toHaveLength(1);
      expect(mockPrisma.weatherAlert.findMany).toHaveBeenCalledTimes(1);
    });

    it('필터를 적용하여 조회한다', async () => {
      mockPrisma.weatherAlert.findMany.mockResolvedValue([]);

      await dbService.getCurrentAlerts({
        regionId: 'L1100000',
        warningType: 'W',
        warningLevel: '주의보',
        upperRegion: '서울특별시',
      });

      const call = mockPrisma.weatherAlert.findMany.mock.calls[0][0];
      expect(call.where.regionId).toBe('L1100000');
      expect(call.where.warningType).toBe('W');
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.weatherAlert.findMany.mockRejectedValue(new Error('Query failed'));

      await expect(dbService.getCurrentAlerts()).rejects.toThrow('Query failed');
    });
  });

  describe('getAlertHistory', () => {
    it('기간별 특보 이력을 조회한다', async () => {
      mockPrisma.alertHistory.findMany.mockResolvedValue([{ id: 1 }]);

      const result = await dbService.getAlertHistory({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-26'),
      });

      expect(result).toHaveLength(1);
    });

    it('모든 필터를 적용한다', async () => {
      mockPrisma.alertHistory.findMany.mockResolvedValue([]);

      await dbService.getAlertHistory({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-26'),
        regionId: 'L1100000',
        warningType: 'W',
        changeType: 'NEW' as AlertChangeType,
      });

      const call = mockPrisma.alertHistory.findMany.mock.calls[0][0];
      expect(call.where.regionId).toBe('L1100000');
      expect(call.where.changeType).toBe('NEW');
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.alertHistory.findMany.mockRejectedValue(new Error('Query error'));

      await expect(
        dbService.getAlertHistory({
          startDate: new Date(),
          endDate: new Date(),
        })
      ).rejects.toThrow('Query error');
    });
  });

  describe('getAlertStatistics', () => {
    it('지역별 통계를 조회한다', async () => {
      mockPrisma.alertHistory.groupBy.mockResolvedValue([
        { upperRegion: '서울특별시', _count: { id: 10 } },
      ]);

      const result = await dbService.getAlertStatistics({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-26'),
        groupBy: 'region',
      });

      expect(result).toHaveLength(1);
      const call = mockPrisma.alertHistory.groupBy.mock.calls[0][0];
      expect(call.by).toEqual(['upperRegion']);
    });

    it('특보종류별 통계를 조회한다', async () => {
      mockPrisma.alertHistory.groupBy.mockResolvedValue([]);

      await dbService.getAlertStatistics({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-26'),
        groupBy: 'warningType',
      });

      const call = mockPrisma.alertHistory.groupBy.mock.calls[0][0];
      expect(call.by).toEqual(['warningType']);
    });

    it('수준별 통계를 조회한다', async () => {
      mockPrisma.alertHistory.groupBy.mockResolvedValue([]);

      await dbService.getAlertStatistics({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-26'),
        groupBy: 'level',
      });

      const call = mockPrisma.alertHistory.groupBy.mock.calls[0][0];
      expect(call.by).toEqual(['warningLevel']);
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.alertHistory.groupBy.mockRejectedValue(new Error('Stats error'));

      await expect(
        dbService.getAlertStatistics({
          startDate: new Date(),
          endDate: new Date(),
          groupBy: 'region',
        })
      ).rejects.toThrow('Stats error');
    });
  });

  describe('cleanupOldData', () => {
    it('기본 365일 이전 데이터를 삭제한다', async () => {
      mockPrisma.alertHistory.deleteMany.mockResolvedValue({ count: 100 });

      const result = await dbService.cleanupOldData();

      expect(result).toBe(100);
    });

    it('지정된 보관 기간으로 삭제한다', async () => {
      mockPrisma.alertHistory.deleteMany.mockResolvedValue({ count: 50 });

      const result = await dbService.cleanupOldData(30);

      expect(result).toBe(50);
    });

    it('DB 오류 시 예외를 던진다', async () => {
      mockPrisma.alertHistory.deleteMany.mockRejectedValue(new Error('Cleanup error'));

      await expect(dbService.cleanupOldData()).rejects.toThrow('Cleanup error');
    });
  });

  describe('syncCachedAlerts', () => {
    it('캐시된 특보 데이터를 동기화한다', async () => {
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});
      mockPrisma.weatherAlert.updateMany.mockResolvedValue({ count: 2 });

      const cachedAlerts: CachedAlert[] = [
        {
          key: 'L1100000-W-주의보-1',
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
          lastUpdated: new Date().toISOString(),
        },
      ];

      await dbService.syncCachedAlerts(cachedAlerts);

      expect(mockPrisma.weatherAlert.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.weatherAlert.updateMany).toHaveBeenCalledTimes(1);
    });

    it('빈 캐시일 때 모든 특보를 해제한다', async () => {
      mockPrisma.weatherAlert.updateMany.mockResolvedValue({ count: 3 });

      await dbService.syncCachedAlerts([]);

      expect(mockPrisma.weatherAlert.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.weatherAlert.updateMany).toHaveBeenCalledTimes(1);
    });

    it('endTime이 있는 캐시 데이터를 처리한다', async () => {
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});
      mockPrisma.weatherAlert.updateMany.mockResolvedValue({ count: 0 });

      const cachedAlerts: CachedAlert[] = [
        {
          key: 'L1100000-W-주의보-1',
          regionId: 'L1100000',
          regionName: '서울특별시',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
          endTime: '202602271000',
          lastUpdated: new Date().toISOString(),
        },
      ];

      await dbService.syncCachedAlerts(cachedAlerts);

      expect(mockPrisma.weatherAlert.upsert).toHaveBeenCalledTimes(1);
    });

    it('동기화 실패 시 예외를 던진다', async () => {
      mockPrisma.weatherAlert.upsert.mockRejectedValue(new Error('Sync failed'));

      const cachedAlerts: CachedAlert[] = [
        {
          key: 'L1100000-W-주의보-1',
          regionId: 'L1100000',
          regionName: '서울',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
          lastUpdated: new Date().toISOString(),
        },
      ];

      await expect(dbService.syncCachedAlerts(cachedAlerts)).rejects.toThrow('Sync failed');
    });
  });

  describe('parseKmaTimestamp (private)', () => {
    it('유효한 KMA 타임스탬프를 변환한다', async () => {
      // syncCachedAlerts를 통해 간접 테스트
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});
      mockPrisma.weatherAlert.updateMany.mockResolvedValue({ count: 0 });

      const cachedAlerts: CachedAlert[] = [
        {
          key: 'L1100000-W-주의보-1',
          regionId: 'L1100000',
          regionName: '서울',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: '202602261000',
          effectiveAt: '202602261200',
          lastUpdated: new Date().toISOString(),
        },
      ];

      await dbService.syncCachedAlerts(cachedAlerts);

      const upsertCall = mockPrisma.weatherAlert.upsert.mock.calls[0][0];
      expect(upsertCall.create.announcedAt).toBeInstanceOf(Date);
      expect(upsertCall.create.effectiveAt).toBeInstanceOf(Date);
    });

    it('잘못된 형식의 타임스탬프는 예외를 던진다', async () => {
      mockPrisma.weatherAlert.upsert.mockResolvedValue({});

      const cachedAlerts: CachedAlert[] = [
        {
          key: 'L1100000-W-주의보-1',
          regionId: 'L1100000',
          regionName: '서울',
          warningType: 'W',
          level: '주의보',
          command: '1',
          announcedAt: 'invalid',
          effectiveAt: '202602261200',
          lastUpdated: new Date().toISOString(),
        },
      ];

      await expect(dbService.syncCachedAlerts(cachedAlerts)).rejects.toThrow('Invalid KMA timestamp');
    });
  });

  describe('saveRegionMapping', () => {
    it('지역 매핑을 저장한다', async () => {
      mockPrisma.regionMapping.upsert.mockResolvedValue({});

      await dbService.saveRegionMapping('L1100000', '서울특별시', '서울특별시');

      expect(mockPrisma.regionMapping.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.regionMapping.upsert.mock.calls[0][0];
      expect(call.where.regionId).toBe('L1100000');
    });

    it('저장 실패 시 예외를 던진다', async () => {
      mockPrisma.regionMapping.upsert.mockRejectedValue(new Error('Mapping error'));

      await expect(
        dbService.saveRegionMapping('L1100000', '서울', '서울특별시')
      ).rejects.toThrow('Mapping error');
    });
  });

  describe('getRegionMapping', () => {
    it('지역 매핑을 조회한다', async () => {
      mockPrisma.regionMapping.findUnique.mockResolvedValue({
        regionId: 'L1100000',
        regionName: '서울특별시',
        upperRegion: '서울특별시',
      });

      const result = await dbService.getRegionMapping('L1100000');

      expect(result).not.toBeNull();
      expect(result.regionName).toBe('서울특별시');
    });

    it('존재하지 않는 매핑은 null을 반환한다', async () => {
      mockPrisma.regionMapping.findUnique.mockResolvedValue(null);

      const result = await dbService.getRegionMapping('L9999999');

      expect(result).toBeNull();
    });

    it('조회 실패 시 예외를 던진다', async () => {
      mockPrisma.regionMapping.findUnique.mockRejectedValue(new Error('Query error'));

      await expect(dbService.getRegionMapping('L1100000')).rejects.toThrow('Query error');
    });
  });
});
