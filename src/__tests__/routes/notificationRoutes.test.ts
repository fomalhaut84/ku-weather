import request from 'supertest';
import express, { Express } from 'express';
import notificationRoutes, { initializeNotificationRoutes } from '../../routes/notificationRoutes';
import { CircuitState } from '../../services/notifications/CircuitBreaker';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Notification Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);
  });

  describe('서비스 미초기화', () => {
    beforeEach(() => {
      // 서비스를 null로 초기화
      initializeNotificationRoutes(null as any);
    });

    it('GET /stats → 서비스 미초기화 시 500 반환', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service not initialized');
    });

    it('GET /health → 서비스 미초기화 시 500 반환', async () => {
      const response = await request(app)
        .get('/api/notifications/health')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service not initialized');
    });

    it('POST /circuit-breaker/:platform/reset → 서비스 미초기화 시 500 반환', async () => {
      const response = await request(app)
        .post('/api/notifications/circuit-breaker/slack/reset')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service not initialized');
    });
  });

  describe('서비스 초기화 후', () => {
    const mockGetDetailedStatistics = jest.fn();
    const mockGetDetailedPlatformStats = jest.fn();
    const mockHealthCheck = jest.fn();
    const mockGetPlatformNames = jest.fn();
    const mockGetCircuitBreakerState = jest.fn();
    const mockResetCircuitBreaker = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      const mockService = {
        getDetailedStatistics: mockGetDetailedStatistics,
        getDetailedPlatformStats: mockGetDetailedPlatformStats,
        healthCheck: mockHealthCheck,
        getPlatformNames: mockGetPlatformNames,
        getCircuitBreakerState: mockGetCircuitBreakerState,
        resetCircuitBreaker: mockResetCircuitBreaker
      };

      initializeNotificationRoutes(mockService as any);
    });

    describe('GET /api/notifications/stats', () => {
      it('전체 통계 + summary 반환', async () => {
        const mockPlatforms = [
          {
            platform: 'slack',
            totalSent: 100,
            successCount: 95,
            failureCount: 5,
            successRate: 0.95,
            averageResponseTimeMs: 120,
            lastSuccessAt: new Date('2026-03-01'),
            lastFailureAt: null,
            circuitBreakerState: CircuitState.CLOSED,
            hourlyStats: []
          },
          {
            platform: 'telegram',
            totalSent: 50,
            successCount: 48,
            failureCount: 2,
            successRate: 0.96,
            averageResponseTimeMs: 200,
            lastSuccessAt: new Date('2026-03-01'),
            lastFailureAt: null,
            circuitBreakerState: CircuitState.CLOSED,
            hourlyStats: []
          }
        ];

        mockGetDetailedStatistics.mockReturnValue(mockPlatforms);

        const response = await request(app)
          .get('/api/notifications/stats')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.platforms).toHaveLength(2);
        expect(response.body.data.summary).toEqual({
          totalPlatforms: 2,
          totalSent: 150,
          totalSuccess: 143,
          totalFailure: 7,
          overallSuccessRate: 143 / 150
        });
      });

      it('platform 쿼리 파라미터로 단일 플랫폼 통계 반환', async () => {
        const mockStats = {
          platform: 'slack',
          totalSent: 100,
          successCount: 95,
          failureCount: 5,
          successRate: 0.95,
          averageResponseTimeMs: 120,
          lastSuccessAt: new Date('2026-03-01').toISOString(),
          lastFailureAt: null,
          circuitBreakerState: CircuitState.CLOSED,
          hourlyStats: []
        };

        mockGetDetailedPlatformStats.mockReturnValue(mockStats);

        const response = await request(app)
          .get('/api/notifications/stats?platform=slack')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.platform).toBe('slack');
        expect(response.body.data.totalSent).toBe(100);
        expect(mockGetDetailedPlatformStats).toHaveBeenCalledWith('slack');
      });

      it('존재하지 않는 플랫폼 조회 시 404 반환', async () => {
        mockGetDetailedPlatformStats.mockReturnValue(undefined);

        const response = await request(app)
          .get('/api/notifications/stats?platform=unknown')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('unknown');
      });

      it('내부 오류 발생 시 500 반환', async () => {
        mockGetDetailedStatistics.mockImplementation(() => {
          throw new Error('Unexpected error');
        });

        const response = await request(app)
          .get('/api/notifications/stats')
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Internal server error');
      });
    });

    describe('GET /api/notifications/health', () => {
      it('플랫폼별 connected + circuitBreakerState 반환', async () => {
        mockHealthCheck.mockResolvedValue({
          slack: true,
          telegram: false
        });
        mockGetPlatformNames.mockReturnValue(['slack', 'telegram']);
        mockGetCircuitBreakerState
          .mockReturnValueOnce(CircuitState.CLOSED)
          .mockReturnValueOnce(CircuitState.OPEN);

        const response = await request(app)
          .get('/api/notifications/health')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.slack).toEqual({
          connected: true,
          circuitBreakerState: 'CLOSED'
        });
        expect(response.body.data.telegram).toEqual({
          connected: false,
          circuitBreakerState: 'OPEN'
        });
      });

      it('내부 오류 발생 시 500 반환', async () => {
        mockHealthCheck.mockRejectedValue(new Error('Health check failed'));

        const response = await request(app)
          .get('/api/notifications/health')
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Internal server error');
      });
    });

    describe('POST /api/notifications/circuit-breaker/:platform/reset', () => {
      it('성공적으로 리셋 시 200 반환', async () => {
        mockResetCircuitBreaker.mockReturnValue(true);

        const response = await request(app)
          .post('/api/notifications/circuit-breaker/slack/reset')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.platform).toBe('slack');
        expect(response.body.data.message).toContain('slack');
        expect(mockResetCircuitBreaker).toHaveBeenCalledWith('slack');
      });

      it('존재하지 않는 플랫폼 리셋 시 404 반환', async () => {
        mockResetCircuitBreaker.mockReturnValue(false);

        const response = await request(app)
          .post('/api/notifications/circuit-breaker/unknown/reset')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('unknown');
      });

      it('내부 오류 발생 시 500 반환', async () => {
        mockResetCircuitBreaker.mockImplementation(() => {
          throw new Error('Reset failed');
        });

        const response = await request(app)
          .post('/api/notifications/circuit-breaker/slack/reset')
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Internal server error');
      });
    });
  });
});
