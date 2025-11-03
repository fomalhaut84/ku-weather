import request from 'supertest';
import express, { Express } from 'express';
import alertRoutes from '../../routes/alertRoutes';
import { databaseService } from '../../services/DatabaseService';

// Mock DatabaseService
jest.mock('../../services/DatabaseService', () => ({
  databaseService: {
    getCurrentAlerts: jest.fn(),
    getAlertHistory: jest.fn(),
    getAlertStatistics: jest.fn()
  }
}));

describe('Alert Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/alerts', alertRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/alerts/current', () => {
    it('should return current alerts without filters', async () => {
      const mockAlerts = [
        {
          id: '1',
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          warningLevel: '2',
          command: '1',
          announcedAt: new Date('2025-01-01T00:00:00Z'),
          effectiveAt: new Date('2025-01-01T01:00:00Z'),
          endTime: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      (databaseService.getCurrentAlerts as jest.Mock).mockResolvedValue(mockAlerts);

      const response = await request(app)
        .get('/api/alerts/current')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].regionId).toBe('L1100000');
      expect(response.body.data[0].regionName).toBe('서울특별시');
      expect(response.body.data[0].warningType).toBe('W');
      expect(databaseService.getCurrentAlerts).toHaveBeenCalledWith({});
    });

    it('should return current alerts with regionId filter', async () => {
      const mockAlerts = [
        {
          id: '1',
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          warningLevel: '2',
          command: '1',
          announcedAt: new Date('2025-01-01T00:00:00Z'),
          effectiveAt: new Date('2025-01-01T01:00:00Z'),
          endTime: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      (databaseService.getCurrentAlerts as jest.Mock).mockResolvedValue(mockAlerts);

      const response = await request(app)
        .get('/api/alerts/current?regionId=L1100000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(databaseService.getCurrentAlerts).toHaveBeenCalledWith({
        regionId: 'L1100000'
      });
    });

    it('should return 400 for invalid warningType', async () => {
      const response = await request(app)
        .get('/api/alerts/current?warningType=X')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid warningType');
    });

    it('should return 400 for invalid warningLevel', async () => {
      const response = await request(app)
        .get('/api/alerts/current?warningLevel=9')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid warningLevel');
    });

    it('should handle database errors gracefully', async () => {
      (databaseService.getCurrentAlerts as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/alerts/current')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/alerts/history', () => {
    it('should return alert history with required parameters', async () => {
      const mockHistory = [
        {
          id: '1',
          regionId: 'L1100000',
          regionName: '서울특별시',
          upperRegion: '서울특별시',
          warningType: 'W',
          warningLevel: '2',
          changeType: 'NEW',
          previousData: null,
          currentData: { level: '2' },
          timestamp: new Date('2025-01-01T00:00:00Z')
        }
      ];

      (databaseService.getAlertHistory as jest.Mock).mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/alerts/history?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].regionId).toBe('L1100000');
      expect(response.body.data[0].changeType).toBe('NEW');
      expect(databaseService.getAlertHistory).toHaveBeenCalled();
    });

    it('should return 400 when startDate is missing', async () => {
      const response = await request(app)
        .get('/api/alerts/history?endDate=2025-01-02T00:00:00Z')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameters');
    });

    it('should return 400 when endDate is missing', async () => {
      const response = await request(app)
        .get('/api/alerts/history?startDate=2025-01-01T00:00:00Z')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameters');
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .get('/api/alerts/history?startDate=invalid&endDate=2025-01-02T00:00:00Z')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid date format');
    });

    it('should return 400 when startDate is after endDate', async () => {
      const response = await request(app)
        .get('/api/alerts/history?startDate=2025-01-02T00:00:00Z&endDate=2025-01-01T00:00:00Z')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('startDate must be before endDate');
    });

    it('should return 400 for invalid changeType', async () => {
      const response = await request(app)
        .get('/api/alerts/history?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&changeType=INVALID')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid changeType');
    });

    it('should accept valid changeType', async () => {
      (databaseService.getAlertHistory as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/alerts/history?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&changeType=NEW')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(databaseService.getAlertHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: 'NEW'
        })
      );
    });
  });

  describe('GET /api/alerts/statistics', () => {
    it('should return statistics with required parameters', async () => {
      const mockStats = [
        { upperRegion: '서울특별시', _count: { id: 10 } },
        { upperRegion: '경기도', _count: { id: 5 } }
      ];

      (databaseService.getAlertStatistics as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&groupBy=region')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toEqual(mockStats);
      expect(databaseService.getAlertStatistics).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        groupBy: 'region'
      });
    });

    it('should return 400 when required parameters are missing', async () => {
      const response = await request(app)
        .get('/api/alerts/statistics?startDate=2025-01-01T00:00:00Z')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameters');
    });

    it('should return 400 for invalid groupBy value', async () => {
      const response = await request(app)
        .get('/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&groupBy=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid groupBy');
    });

    it('should accept valid groupBy values', async () => {
      (databaseService.getAlertStatistics as jest.Mock).mockResolvedValue([]);

      const validGroupBy = ['region', 'warningType', 'level'];

      for (const groupBy of validGroupBy) {
        const response = await request(app)
          .get(`/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&groupBy=${groupBy}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(databaseService.getAlertStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            groupBy
          })
        );
      }
    });

    it('should handle database errors gracefully', async () => {
      (databaseService.getAlertStatistics as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/alerts/statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-02T00:00:00Z&groupBy=region')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});
