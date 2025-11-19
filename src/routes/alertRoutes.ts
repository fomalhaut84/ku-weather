import { Router, Request, Response } from 'express';
import { databaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/alerts/current
 * 데이터베이스에서 현재 발효 중인 특보 조회
 *
 * Query Parameters:
 * - regionId: 지역코드 (선택)
 * - warningType: 특보종류 (선택, W|R|C|D|O|N|V|T|S|Y|H|F)
 * - warningLevel: 특보수준 (선택, 1|2|3)
 * - upperRegion: 상위지역 (선택, 예: 서울특별시, 경기도)
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const { regionId, warningType, warningLevel, upperRegion } = req.query;

    // 배열 파라미터 거부
    if (Array.isArray(regionId) || Array.isArray(warningType) ||
        Array.isArray(warningLevel) || Array.isArray(upperRegion)) {
      return res.status(400).json({
        success: false,
        error: 'Array query parameters are not supported. Please provide single values only.'
      });
    }

    // 쿼리 파라미터 검증
    if (warningType && typeof warningType === 'string' && !/^[WRCDONFVTSYHF]$/.test(warningType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid warningType. Must be one of: W|R|C|D|O|N|V|T|S|Y|H|F'
      });
    }

    if (warningLevel && typeof warningLevel === 'string' && !/^[123]$/.test(warningLevel)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid warningLevel. Must be one of: 1(예비)|2(주의보)|3(경보)'
      });
    }

    const filters: any = {};
    if (regionId) filters.regionId = regionId as string;
    if (warningType) filters.warningType = warningType as string;
    if (warningLevel) filters.warningLevel = warningLevel as string;
    if (upperRegion) {
      // DB와 프론트엔드 간 지역명 차이 정규화
      let normalizedRegion = upperRegion as string;
      if (normalizedRegion === '강원특별자치도') normalizedRegion = '강원도';
      if (normalizedRegion === '전북특별자치도') normalizedRegion = '전라북도';
      filters.upperRegion = normalizedRegion;
    }

    const alerts = await databaseService.getCurrentAlerts(filters);

    res.json({
      success: true,
      count: alerts.length,
      filters,
      data: alerts
    });
  } catch (error) {
    logger.error('Error fetching current alerts from database:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/alerts/history
 * 데이터베이스에서 특보 변동 이력 조회
 *
 * Query Parameters:
 * - startDate: 시작 날짜 (필수, ISO 8601 형식)
 * - endDate: 종료 날짜 (필수, ISO 8601 형식)
 * - regionId: 지역코드 (선택)
 * - warningType: 특보종류 (선택)
 * - changeType: 변동 유형 (선택, NEW|RESOLVED|LEVEL_UP|LEVEL_DOWN|TIME_EXTENDED|MODIFIED)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, regionId, warningType, changeType } = req.query;

    // 배열 파라미터 거부
    if (Array.isArray(startDate) || Array.isArray(endDate) ||
        Array.isArray(regionId) || Array.isArray(warningType) ||
        Array.isArray(changeType)) {
      return res.status(400).json({
        success: false,
        error: 'Array query parameters are not supported. Please provide single values only.'
      });
    }

    // 필수 파라미터 검증
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: startDate and endDate'
      });
    }

    // 날짜 형식 검증
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startDate must be before endDate'
      });
    }

    // changeType 검증
    const validChangeTypes = ['NEW', 'RESOLVED', 'LEVEL_UP', 'LEVEL_DOWN', 'TIME_EXTENDED', 'MODIFIED'];
    if (changeType && typeof changeType === 'string' && !validChangeTypes.includes(changeType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid changeType. Must be one of: ${validChangeTypes.join('|')}`
      });
    }

    const filters: any = {
      startDate: start,
      endDate: end
    };
    if (regionId) filters.regionId = regionId as string;
    if (warningType) filters.warningType = warningType as string;
    if (changeType) filters.changeType = changeType as string;

    const histories = await databaseService.getAlertHistory(filters);

    res.json({
      success: true,
      count: histories.length,
      filters: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        regionId: regionId || null,
        warningType: warningType || null,
        changeType: changeType || null
      },
      data: histories
    });
  } catch (error) {
    logger.error('Error fetching alert history from database:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/alerts/statistics
 * 데이터베이스에서 특보 발생 빈도 통계 조회
 *
 * Query Parameters:
 * - startDate: 시작 날짜 (필수, ISO 8601 형식)
 * - endDate: 종료 날짜 (필수, ISO 8601 형식)
 * - groupBy: 그룹핑 기준 (필수, region|warningType|level)
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    // 배열 파라미터 거부
    if (Array.isArray(startDate) || Array.isArray(endDate) || Array.isArray(groupBy)) {
      return res.status(400).json({
        success: false,
        error: 'Array query parameters are not supported. Please provide single values only.'
      });
    }

    // 필수 파라미터 검증
    if (!startDate || !endDate || !groupBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: startDate, endDate, and groupBy'
      });
    }

    // 날짜 형식 검증
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startDate must be before endDate'
      });
    }

    // groupBy 검증
    const validGroupBy = ['region', 'warningType', 'level'];
    if (!validGroupBy.includes(groupBy as string)) {
      return res.status(400).json({
        success: false,
        error: `Invalid groupBy. Must be one of: ${validGroupBy.join('|')}`
      });
    }

    const statistics = await databaseService.getAlertStatistics({
      startDate: start,
      endDate: end,
      groupBy: groupBy as 'region' | 'warningType' | 'level'
    });

    res.json({
      success: true,
      count: statistics.length,
      filters: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        groupBy
      },
      data: statistics
    });
  } catch (error) {
    logger.error('Error fetching alert statistics from database:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
