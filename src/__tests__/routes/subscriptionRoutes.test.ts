import request from 'supertest';
import express, { Express } from 'express';
import subscriptionRouter, { initializeSubscriptionRoutes } from '../../routes/subscriptionRoutes';
import { WebSubscriptionInterface } from '../../services/subscriptions/WebSubscriptionInterface';
import { SubscriptionManager } from '../../services/notifications/SubscriptionManager';
import { TokenService } from '../../services/TokenService';

// Mock dependencies
jest.mock('../../services/subscriptions/WebSubscriptionInterface');
jest.mock('../../services/notifications/SubscriptionManager');
jest.mock('../../services/TokenService');

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Subscription Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/subscriptions', subscriptionRouter);
  });

  describe('초기화 전 요청', () => {
    it('WebSubscriptionInterface 미초기화 시 500을 반환한다', async () => {
      const res = await request(app).post('/api/subscriptions/auth').send({ token: 'test' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Service not initialized');
    });
  });

  describe('초기화 후 요청', () => {
    let mockWebInterface: any;

    beforeAll(() => {
      // WebSubscriptionInterface mock 설정
      const mockSubscriptionManager = new SubscriptionManager() as any;
      const mockTokenService = new TokenService(null as any) as any;

      initializeSubscriptionRoutes(mockSubscriptionManager, mockTokenService);

      // WebSubscriptionInterface의 프로토타입 메서드를 mock
      mockWebInterface = (WebSubscriptionInterface as jest.Mock).mock.instances[0];
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('POST /api/subscriptions/auth', () => {
      it('유효한 토큰으로 인증에 성공한다', async () => {
        const mockSubscription = {
          platform: 'web',
          userId: 'user1',
          targetRegions: ['L1100000'],
          enabled: true,
        };
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue(mockSubscription);

        const res = await request(app)
          .post('/api/subscriptions/auth')
          .send({ token: 'valid-token' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('토큰이 없으면 400을 반환한다', async () => {
        const res = await request(app)
          .post('/api/subscriptions/auth')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Missing or invalid token');
      });

      it('토큰이 문자열이 아니면 400을 반환한다', async () => {
        const res = await request(app)
          .post('/api/subscriptions/auth')
          .send({ token: 123 });

        expect(res.status).toBe(400);
      });

      it('유효하지 않은 토큰이면 401을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue(null);

        const res = await request(app)
          .post('/api/subscriptions/auth')
          .send({ token: 'invalid-token' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid or expired token');
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockRejectedValue(new Error('Internal'));

        const res = await request(app)
          .post('/api/subscriptions/auth')
          .send({ token: 'some-token' });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal server error');
      });
    });

    describe('GET /api/subscriptions/me', () => {
      it('인증된 사용자의 구독 정보를 반환한다', async () => {
        const mockSub = { platform: 'web', userId: 'u1' };
        const mockEnhanced = { success: true, data: { ...mockSub, regionNames: ['서울'] } };
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue(mockSub);
        mockWebInterface.getEnhancedSubscriptionInfo = jest.fn().mockResolvedValue(mockEnhanced);

        const res = await request(app)
          .get('/api/subscriptions/me')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('토큰이 없으면 401을 반환한다', async () => {
        const res = await request(app).get('/api/subscriptions/me');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Missing authorization token');
      });

      it('유효하지 않은 토큰이면 401을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue(null);

        const res = await request(app)
          .get('/api/subscriptions/me')
          .set('Authorization', 'Bearer bad-token');

        expect(res.status).toBe(401);
      });

      it('확장 정보 조회 실패 시 404를 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.getEnhancedSubscriptionInfo = jest.fn().mockResolvedValue({
          success: false,
          error: 'Not found',
        });

        const res = await request(app)
          .get('/api/subscriptions/me')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(404);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockRejectedValue(new Error('err'));

        const res = await request(app)
          .get('/api/subscriptions/me')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(500);
      });
    });

    describe('PUT /api/subscriptions/update', () => {
      it('구독 설정을 업데이트한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.updateSubscription = jest.fn().mockResolvedValue({ success: true });

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({
            targetRegions: ['L1100000'],
            warningTypes: ['W'],
            enabled: true,
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('토큰이 없으면 401을 반환한다', async () => {
        const res = await request(app)
          .put('/api/subscriptions/update')
          .send({ enabled: true });

        expect(res.status).toBe(401);
      });

      it('targetRegions가 배열이 아니면 400을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({ targetRegions: 'not-array' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('targetRegions must be an array');
      });

      it('warningTypes가 배열이 아니면 400을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({ warningTypes: 'not-array' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('warningTypes must be an array');
      });

      it('enabled가 boolean이 아니면 400을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({ enabled: 'yes' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('enabled must be a boolean');
      });

      it('업데이트 실패 시 400을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.updateSubscription = jest.fn().mockResolvedValue({
          success: false,
          error: 'Update failed',
        });

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({ enabled: false });

        expect(res.status).toBe(400);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.updateSubscription = jest.fn().mockRejectedValue(new Error('err'));

        const res = await request(app)
          .put('/api/subscriptions/update')
          .set('Authorization', 'Bearer valid-token')
          .send({ enabled: true });

        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/subscriptions/delete', () => {
      it('구독을 삭제한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.deleteSubscription = jest.fn().mockResolvedValue({ success: true });

        const res = await request(app)
          .delete('/api/subscriptions/delete')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('토큰이 없으면 401을 반환한다', async () => {
        const res = await request(app).delete('/api/subscriptions/delete');

        expect(res.status).toBe(401);
      });

      it('삭제 실패 시 400을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.deleteSubscription = jest.fn().mockResolvedValue({
          success: false,
          error: 'Delete failed',
        });

        const res = await request(app)
          .delete('/api/subscriptions/delete')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(400);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.deleteSubscription = jest.fn().mockRejectedValue(new Error('err'));

        const res = await request(app)
          .delete('/api/subscriptions/delete')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/subscriptions/stats', () => {
      it('구독 통계를 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.getSubscriptionStats = jest.fn().mockResolvedValue({ total: 10 });

        const res = await request(app)
          .get('/api/subscriptions/stats')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(200);
        expect(res.body.data.total).toBe(10);
      });

      it('토큰이 없으면 401을 반환한다', async () => {
        const res = await request(app).get('/api/subscriptions/stats');

        expect(res.status).toBe(401);
      });

      it('통계 조회 실패 시 401을 반환한다', async () => {
        mockWebInterface.authenticateWithToken = jest.fn().mockResolvedValue({ userId: 'u1' });
        mockWebInterface.getSubscriptionStats = jest.fn().mockResolvedValue(null);

        const res = await request(app)
          .get('/api/subscriptions/stats')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(401);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.getSubscriptionStats = jest.fn().mockRejectedValue(new Error('err'));

        const res = await request(app)
          .get('/api/subscriptions/stats')
          .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/subscriptions/regions', () => {
      it('사용 가능한 지역 목록을 반환한다', async () => {
        mockWebInterface.getAvailableRegions = jest.fn().mockReturnValue([
          { id: 'L1100000', name: '서울특별시' },
        ]);

        const res = await request(app).get('/api/subscriptions/regions');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.getAvailableRegions = jest.fn().mockImplementation(() => {
          throw new Error('Region error');
        });

        const res = await request(app).get('/api/subscriptions/regions');

        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/subscriptions/warning-types', () => {
      it('사용 가능한 특보 종류 목록을 반환한다', async () => {
        mockWebInterface.getAvailableWarningTypes = jest.fn().mockReturnValue([
          { code: 'W', name: '강풍' },
        ]);

        const res = await request(app).get('/api/subscriptions/warning-types');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
      });

      it('내부 오류 시 500을 반환한다', async () => {
        mockWebInterface.getAvailableWarningTypes = jest.fn().mockImplementation(() => {
          throw new Error('Type error');
        });

        const res = await request(app).get('/api/subscriptions/warning-types');

        expect(res.status).toBe(500);
      });
    });
  });
});
