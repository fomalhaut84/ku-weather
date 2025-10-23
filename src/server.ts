import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { MultiplatformNotificationService } from './services/notifications/MultiplatformNotificationService';
import { WeatherService } from './services/weatherService';

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
          alerts: '/api/alerts'
        }
      });
    });

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
        if (!providedSecret || providedSecret !== configuredSecret) {
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

        // Telegram 서비스 찾기
        const telegramService = (this.notificationService as any).services?.find(
          (s: any) => s.platformName === 'telegram'
        );

        if (!telegramService || !telegramService.processWebhookUpdate) {
          logger.error('Telegram service not found or does not support webhooks');
          return res.status(500).json({ ok: false, error: 'Telegram service not available' });
        }

        // 업데이트 처리 (비동기, 응답은 즉시 반환)
        telegramService.processWebhookUpdate(update)
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

    // 웹 대시보드 API: 현재 특보 현황 (Phase D에서 구현 예정)
    this.app.get('/api/alerts', async (req: Request, res: Response) => {
      try {
        // TODO: Phase D에서 구현
        // - AlertCache에서 현재 특보 목록 조회
        // - 지역별/종류별 필터링

        res.json({
          alerts: [],
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
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
