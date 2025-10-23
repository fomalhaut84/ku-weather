import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { MultiplatformNotificationService } from './services/notifications/MultiplatformNotificationService';
import { WeatherService } from './services/weatherService';

export interface ServerConfig {
  port: number;
  environment: string;
  corsOrigin?: string;
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

    // Telegram Webhook 엔드포인트 (Phase C에서 구현 예정)
    this.app.post('/telegram/webhook', async (req: Request, res: Response) => {
      try {
        logger.info('Telegram webhook received:', req.body);

        // TODO: Phase C에서 구현
        // - Telegram Bot API 메시지 처리
        // - 명령어 파싱 및 응답

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
