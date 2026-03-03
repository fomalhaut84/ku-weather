/**
 * 알림 모니터링 API 라우터
 *
 * 알림 플랫폼 상태, 통계, Circuit Breaker 관리 엔드포인트
 */

import express, { Request, Response, Router } from 'express';
import { MultiplatformNotificationService } from '../services/notifications/MultiplatformNotificationService';
import { logger } from '../utils/logger';

const router: Router = express.Router();

let notificationService: MultiplatformNotificationService | null = null;

/**
 * NotificationService 초기화
 */
export function initializeNotificationRoutes(
  service: MultiplatformNotificationService
): void {
  notificationService = service;
  logger.info('알림 모니터링 API 라우터 초기화 완료');
}

/**
 * NotificationService 인스턴스 확인 미들웨어
 */
function requireService(req: Request, res: Response, next: Function) {
  if (!notificationService) {
    logger.error('NotificationService가 초기화되지 않았습니다');
    return res.status(500).json({
      success: false,
      error: 'Service not initialized'
    });
  }
  next();
}

/**
 * GET /api/notifications/stats
 * 전체 또는 특정 플랫폼 알림 통계
 */
router.get('/stats', requireService, (req: Request, res: Response) => {
  try {
    const platformFilter = req.query.platform as string | undefined;

    if (platformFilter) {
      const stats = notificationService!.getDetailedPlatformStats(platformFilter);
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: `Platform '${platformFilter}' not found`
        });
      }
      return res.json({
        success: true,
        data: stats
      });
    }

    const platforms = notificationService!.getDetailedStatistics();
    const totalSent = platforms.reduce((sum, p) => sum + p.totalSent, 0);
    const totalSuccess = platforms.reduce((sum, p) => sum + p.successCount, 0);

    res.json({
      success: true,
      data: {
        platforms,
        summary: {
          totalPlatforms: platforms.length,
          totalSent,
          totalSuccess,
          totalFailure: totalSent - totalSuccess,
          overallSuccessRate: totalSent > 0 ? totalSuccess / totalSent : 0
        }
      }
    });
  } catch (error) {
    logger.error('알림 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/notifications/health
 * 플랫폼 연결 상태 및 Circuit Breaker 상태
 */
router.get('/health', requireService, async (req: Request, res: Response) => {
  try {
    const healthStatus = await notificationService!.healthCheck();
    const platformNames = notificationService!.getPlatformNames();

    const data: { [name: string]: { connected: boolean; circuitBreakerState: string } } = {};

    for (const name of platformNames) {
      data[name] = {
        connected: healthStatus[name] ?? false,
        circuitBreakerState: notificationService!.getCircuitBreakerState(name) ?? 'UNKNOWN'
      };
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('알림 헬스체크 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/notifications/circuit-breaker/:platform/reset
 * Circuit Breaker 수동 리셋
 */
router.post('/circuit-breaker/:platform/reset', requireService, (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as string;
    const result = notificationService!.resetCircuitBreaker(platform);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `Platform '${platform}' not found`
      });
    }

    res.json({
      success: true,
      data: {
        platform,
        message: `Circuit breaker for '${platform}' has been reset`
      }
    });
  } catch (error) {
    logger.error('Circuit breaker 리셋 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
