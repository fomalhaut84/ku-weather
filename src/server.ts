import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'crypto';
import { logger } from './utils/logger';
import { MultiplatformNotificationService } from './services/notifications/MultiplatformNotificationService';
import { WeatherService } from './services/weatherService';
import { CachedAlert } from './types/weather';
import alertRoutes from './routes/alertRoutes';

export interface ServerConfig {
  port: number;
  environment: string;
  corsOrigin?: string;
  telegramWebhookSecret?: string;
}

/**
 * HTTP 서버 클래스
 * - Express 기반 REST API 서버
 * - Telegram Webhook 수신
 * - 웹 대시보드 API 제공
 */
export class HttpServer {
  private app: Express;
  private config: ServerConfig;
  private notificationService?: MultiplatformNotificationService;
  private weatherService?: WeatherService;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  /**
   * 미들웨어 설정
   */
  private setupMiddleware(): void {
    // JSON 파싱
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS 설정
    this.app.use(cors({
      origin: this.config.corsOrigin || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // 요청 로깅
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * 라우트 설정
   */
  private setupRoutes(): void {
    // Health Check 엔드포인트
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: this.config.environment,
        uptime: process.uptime()
      });
    });

    // API 베이스 경로
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        message: 'ku-weather API Server',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          telegram: '/telegram/webhook',
          alerts: '/api/alerts (cache-based)',
          alertsCurrent: '/api/alerts/current (database)',
          alertsHistory: '/api/alerts/history?startDate={ISO8601}&endDate={ISO8601}',
          alertsStatistics: '/api/alerts/statistics?startDate={ISO8601}&endDate={ISO8601}&groupBy={region|warningType|level}',
          alertsFiltered: '/api/alerts?region={regionId}&type={warningType}',
          subscriptions: '/api/subscriptions/{token}'
        }
      });
    });

    // Database-based alert routes
    this.app.use('/api/alerts', alertRoutes);

    // Telegram Webhook 엔드포인트
    this.app.post('/telegram/webhook', async (req: Request, res: Response) => {
      try {
        // Telegram webhook secret 검증
        const configuredSecret = this.config.telegramWebhookSecret;
        if (!configuredSecret) {
          logger.error('Telegram webhook secret is not configured. Rejecting request.');
          return res.status(500).json({ ok: false, error: 'Webhook not configured' });
        }

        const providedSecret = req.get('x-telegram-bot-api-secret-token');
        if (!providedSecret) {
          logger.warn('Missing Telegram webhook secret token');
          return res.status(403).json({ ok: false, error: 'Invalid webhook token' });
        }

        const providedSecretBuffer = Buffer.from(providedSecret, 'utf8');
        const configuredSecretBuffer = Buffer.from(configuredSecret, 'utf8');

        const secretsMatch =
          providedSecretBuffer.length === configuredSecretBuffer.length &&
          timingSafeEqual(providedSecretBuffer, configuredSecretBuffer);

        if (!secretsMatch) {
          logger.warn('Invalid Telegram webhook secret token received');
          return res.status(403).json({ ok: false, error: 'Invalid webhook token' });
        }

        const update = req.body;

        // Telegram update 검증
        if (!update || typeof update !== 'object') {
          logger.warn('Invalid Telegram webhook update received');
          return res.status(400).json({ ok: false, error: 'Invalid update' });
        }

        logger.debug('Telegram webhook update received:', {
          update_id: update.update_id,
          has_message: !!update.message,
          has_callback_query: !!update.callback_query
        });

        // NotificationService가 주입되어 있는지 확인
        if (!this.notificationService) {
          logger.error('NotificationService not injected');
          return res.status(500).json({ ok: false, error: 'Service not available' });
        }

        // Telegram 서비스 찾기 (타입 안전)
        const telegramService = this.notificationService.getService('telegram');

        if (!telegramService || !('processWebhookUpdate' in telegramService)) {
          logger.error('Telegram service not found or does not support webhooks');
          return res.status(500).json({ ok: false, error: 'Telegram service not available' });
        }

        // 업데이트 처리 (비동기, 응답은 즉시 반환)
        (telegramService as any).processWebhookUpdate(update)
          .catch((error: Error) => {
            logger.error('Error in background webhook processing:', error);
          });

        // Telegram에 즉시 200 OK 응답 (필수)
        res.json({ ok: true });
      } catch (error) {
        logger.error('Error processing Telegram webhook:', error);
        res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    });

    // 웹 대시보드 API: 현재 특보 현황
    this.app.get('/api/alerts', async (req: Request, res: Response) => {
      try {
        // WeatherService가 주입되어 있는지 확인
        if (!this.weatherService) {
          logger.error('WeatherService not injected');
          return res.status(500).json({ error: 'Service not available' });
        }

        // AlertCache에서 현재 활성 특보 목록 조회
        const cachedAlerts = this.weatherService.getCachedAlerts();
        const cacheStatus = this.weatherService.getCacheStatus();

        // 쿼리 파라미터로 필터링 지원
        const regionFilter = req.query.region as string | undefined;
        const warningTypeFilter = req.query.type as string | undefined;

        let filteredAlerts = cachedAlerts;

        // 지역별 필터링
        if (regionFilter) {
          filteredAlerts = filteredAlerts.filter((alert: CachedAlert) =>
            alert.regionId === regionFilter ||
            alert.regionName.includes(regionFilter)
          );
        }

        // 특보 종류별 필터링
        if (warningTypeFilter) {
          filteredAlerts = filteredAlerts.filter((alert: CachedAlert) =>
            alert.warningType === warningTypeFilter.toUpperCase()
          );
        }

        res.json({
          success: true,
          count: filteredAlerts.length,
          alerts: filteredAlerts,
          lastUpdated: cacheStatus.lastUpdated,
          filters: {
            region: regionFilter || null,
            warningType: warningTypeFilter || null
          }
        });
      } catch (error) {
        logger.error('Error fetching alerts:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // 웹 대시보드 API: 사용자 구독 정보 조회
    this.app.get('/api/subscriptions/:token', async (req: Request, res: Response) => {
      try {
        // NotificationService가 주입되어 있는지 확인
        if (!this.notificationService) {
          logger.error('NotificationService not injected');
          return res.status(500).json({
            success: false,
            error: 'Service not available'
          });
        }

        const token = req.params.token;

        // 토큰 형식 검증
        if (!token || token.length < 10) {
          return res.status(400).json({
            success: false,
            error: 'Invalid token format'
          });
        }

        // 토큰에서 플랫폼 추출 (예: TG_timestamp_hash_random -> telegram)
        const platform = this.extractPlatformFromToken(token);
        if (!platform) {
          return res.status(400).json({
            success: false,
            error: 'Invalid token format'
          });
        }

        // 플랫폼별 서비스 조회
        const service = this.notificationService.getService(platform);
        if (!service) {
          return res.status(404).json({
            success: false,
            error: 'Platform service not found'
          });
        }

        // SubscriptionManager에서 모든 구독 정보 조회
        // 실제로는 토큰을 검증하고 해당 사용자의 구독만 반환해야 하지만
        // 현재는 간단하게 통계 정보만 반환
        const subscriptionStats = {
          token: token.substring(0, 10) + '...',
          platform,
          // TODO: 실제 사용자 구독 정보 조회 구현
          message: 'Subscription lookup requires user ID mapping from token'
        };

        res.json({
          success: true,
          subscription: subscriptionStats
        });
      } catch (error) {
        logger.error('Error fetching subscription:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // 404 핸들러
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path
      });
    });
  }

  /**
   * 토큰에서 플랫폼 추출
   * @param token 사용자 인증 토큰
   * @returns 플랫폼 이름 또는 null
   */
  private extractPlatformFromToken(token: string): string | null {
    // 토큰 형식: TG_timestamp_hash_random (Telegram)
    if (token.startsWith('TG_')) {
      return 'telegram';
    }
    // 향후 다른 플랫폼 추가 가능
    // DC_... -> discord
    // EMAIL_... -> email
    return null;
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: this.config.environment === 'development' ? err.message : undefined
      });
    });
  }

  /**
   * 서비스 인스턴스 설정 (외부에서 주입)
   */
  setServices(
    notificationService: MultiplatformNotificationService,
    weatherService: WeatherService
  ): void {
    this.notificationService = notificationService;
    this.weatherService = weatherService;
    logger.info('Services injected into HTTP server');
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        logger.info(`HTTP Server started on port ${this.config.port}`);
        logger.info(`Environment: ${this.config.environment}`);
        logger.info(`Health check: http://localhost:${this.config.port}/health`);
        resolve();
      });
    });
  }

  /**
   * Express app 인스턴스 반환 (테스트용)
   */
  getApp(): Express {
    return this.app;
  }
}
