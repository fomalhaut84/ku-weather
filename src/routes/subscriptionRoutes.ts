/**
 * 구독 관리 API 라우터
 *
 * 웹 대시보드를 위한 구독 관리 REST API 엔드포인트
 */

import express, { Request, Response, Router } from 'express';
import { WebSubscriptionInterface } from '../services/subscriptions/WebSubscriptionInterface';
import { SubscriptionManager } from '../services/notifications/SubscriptionManager';
import { TokenService } from '../services/TokenService';
import { logger } from '../utils/logger';

const router: Router = express.Router();

// WebSubscriptionInterface 인스턴스 (싱글톤)
let webSubscriptionInterface: WebSubscriptionInterface | null = null;

/**
 * WebSubscriptionInterface 초기화
 */
export function initializeSubscriptionRoutes(
  subscriptionManager: SubscriptionManager,
  tokenService: TokenService
): void {
  webSubscriptionInterface = new WebSubscriptionInterface(subscriptionManager, tokenService);
  logger.info('구독 관리 API 라우터 초기화 완료');
}

/**
 * WebSubscriptionInterface 인스턴스 확인 미들웨어
 */
function requireWebInterface(req: Request, res: Response, next: Function) {
  if (!webSubscriptionInterface) {
    logger.error('WebSubscriptionInterface가 초기화되지 않았습니다');
    return res.status(500).json({
      success: false,
      error: 'Service not initialized'
    });
  }
  next();
}

/**
 * POST /api/subscriptions/auth
 * 토큰으로 사용자 인증
 */
router.post('/auth', requireWebInterface, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    // 토큰 검증
    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid token'
      });
    }

    const subscription = await webSubscriptionInterface!.authenticateWithToken(token);

    if (!subscription) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // 민감한 정보 제외하고 반환
    const safeSubscription = {
      ...subscription,
      id: undefined // ID는 클라이언트에 노출하지 않음
    };

    res.json({
      success: true,
      data: safeSubscription
    });

  } catch (error) {
    logger.error('구독 인증 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/me
 * 내 구독 정보 조회
 */
router.get('/me', requireWebInterface, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // 토큰 검증
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Missing authorization token'
      });
    }

    // 토큰으로 구독 정보 조회
    const subscription = await webSubscriptionInterface!.authenticateWithToken(token);

    if (!subscription) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // 확장 구독 정보 조회 (지역명, 특보명 등 포함)
    const enhancedInfo = await webSubscriptionInterface!.getEnhancedSubscriptionInfo(token);

    if (!enhancedInfo.success) {
      return res.status(404).json(enhancedInfo);
    }

    res.json({
      success: true,
      data: enhancedInfo.data
    });

  } catch (error) {
    logger.error('구독 정보 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * PUT /api/subscriptions/update
 * 구독 설정 수정
 */
router.put('/update', requireWebInterface, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // 토큰 검증
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Missing authorization token'
      });
    }

    const {
      targetRegions,
      warningTypes,
      enabled,
      displayName,
      preferences
    } = req.body;

    // 입력값 검증
    if (targetRegions && !Array.isArray(targetRegions)) {
      return res.status(400).json({
        success: false,
        error: 'targetRegions must be an array'
      });
    }

    if (warningTypes && !Array.isArray(warningTypes)) {
      return res.status(400).json({
        success: false,
        error: 'warningTypes must be an array'
      });
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }

    // 구독 설정 업데이트
    const result = await webSubscriptionInterface!.updateSubscription(token, {
      targetRegions,
      warningTypes,
      enabled,
      displayName,
      preferences
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    logger.error('구독 설정 업데이트 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/subscriptions/delete
 * 구독 삭제
 */
router.delete('/delete', requireWebInterface, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // 토큰 검증
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Missing authorization token'
      });
    }

    // 구독 삭제
    const result = await webSubscriptionInterface!.deleteSubscription(token);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    logger.error('구독 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/stats
 * 구독 통계 조회
 */
router.get('/stats', requireWebInterface, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // 토큰 검증
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Missing authorization token'
      });
    }

    // 구독 통계 조회
    const stats = await webSubscriptionInterface!.getSubscriptionStats(token);

    if (!stats) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('구독 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/regions
 * 사용 가능한 지역 목록 조회
 */
router.get('/regions', requireWebInterface, (req: Request, res: Response) => {
  try {
    const regions = webSubscriptionInterface!.getAvailableRegions();

    res.json({
      success: true,
      data: regions
    });

  } catch (error) {
    logger.error('지역 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/subscriptions/warning-types
 * 사용 가능한 특보 종류 목록 조회
 */
router.get('/warning-types', requireWebInterface, (req: Request, res: Response) => {
  try {
    const warningTypes = webSubscriptionInterface!.getAvailableWarningTypes();

    res.json({
      success: true,
      data: warningTypes
    });

  } catch (error) {
    logger.error('특보 종류 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
