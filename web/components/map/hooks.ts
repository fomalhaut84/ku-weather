/**
 * 지도 시각화 관련 Hooks
 */

import { useMemo } from 'react';
import type { WeatherAlert } from '@/types/alert';
import { MARINE_WARNING_TYPES, REGION_NAME_MAP } from './constants';

export interface RegionAlertData {
  upperRegion: string;
  geoJsonName: string;
  maxWarningLevel: 0 | 1 | 2 | 3;
  landAlerts: WeatherAlert[];
  marineAlerts: WeatherAlert[];
  allAlerts: WeatherAlert[];
}

/**
 * 특보 데이터를 육상/해상으로 분류하고 지역별로 그룹화
 */
export function useChoroplethData(alerts: WeatherAlert[]): Map<string, RegionAlertData> {
  return useMemo(() => {
    const regionDataMap = new Map<string, RegionAlertData>();

    // 모든 지역 초기화
    Object.entries(REGION_NAME_MAP).forEach(([geoJsonName, upperRegion]) => {
      regionDataMap.set(upperRegion, {
        upperRegion,
        geoJsonName,
        maxWarningLevel: 0,
        landAlerts: [],
        marineAlerts: [],
        allAlerts: [],
      });
    });

    // 특보 데이터 분류 및 그룹화
    alerts.forEach((alert) => {
      if (!alert.upperRegion) return;

      // REGION_NAME_MAP의 값이 DB 지역명과 일치하므로 직접 조회
      const regionData = regionDataMap.get(alert.upperRegion);
      if (!regionData) return;

      // 육상/해상 구분
      const isMarine = MARINE_WARNING_TYPES.includes(alert.warningType);

      if (isMarine) {
        regionData.marineAlerts.push(alert);
      } else {
        regionData.landAlerts.push(alert);
      }

      regionData.allAlerts.push(alert);

      // 최고 경보 수준 업데이트 (육상 특보만 고려)
      if (!isMarine) {
        const level = Number.parseInt(alert.warningLevel, 10);
        if (!isNaN(level) && level > regionData.maxWarningLevel) {
          regionData.maxWarningLevel = level as 0 | 1 | 2 | 3;
        }
      }
    });

    return regionDataMap;
  }, [alerts]);
}

/**
 * 해상 특보 통계
 */
export function useMarineAlertStats(alerts: WeatherAlert[]) {
  return useMemo(() => {
    const marineAlerts = alerts.filter((alert) =>
      MARINE_WARNING_TYPES.includes(alert.warningType)
    );

    const totalCount = marineAlerts.length;
    const byRegion = marineAlerts.reduce((acc, alert) => {
      const region = alert.upperRegion || '기타';
      acc[region] = (acc[region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCount,
      byRegion,
      alerts: marineAlerts,
    };
  }, [alerts]);
}
