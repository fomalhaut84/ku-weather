import { useEffect, useState, useCallback } from 'react';
import { getCurrentAlerts } from '@/lib/api';
import type { WeatherAlert } from '@/types/alert';
import type { Region } from '@/types/subscription';

interface UseDashboardAlertsOptions {
  selectedRegion: string;
  selectedWarningType: string;
  selectedWarningLevel: string;
  availableRegions: Region[];
  autoRefresh: boolean;
}

interface UseDashboardAlertsReturn {
  alerts: WeatherAlert[];
  setAlerts: React.Dispatch<React.SetStateAction<WeatherAlert[]>>;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  loadAlerts: () => Promise<void>;
}

export function useDashboardAlerts({
  selectedRegion,
  selectedWarningType,
  selectedWarningLevel,
  availableRegions,
  autoRefresh,
}: UseDashboardAlertsOptions): UseDashboardAlertsReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: Record<string, string> = {};
      if (selectedRegion) {
        const selectedRegionObj = availableRegions.find((r) => r.code === selectedRegion);
        if (selectedRegionObj) {
          filters.upperRegion = selectedRegionObj.name;
        }
      }
      if (selectedWarningType) filters.warningType = selectedWarningType;
      if (selectedWarningLevel) filters.warningLevel = selectedWarningLevel;

      const response = await getCurrentAlerts(filters);

      if (!response.success) {
        setError(response.error || '특보 데이터를 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      setAlerts(response.data || []);
      setLastUpdated(new Date());
      setLoading(false);
    } catch {
      setError('특보 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  }, [selectedRegion, selectedWarningType, selectedWarningLevel, availableRegions]);

  // 필터 변경 시 특보 데이터 다시 로드
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // 자동 새로고침 (5분 간격)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadAlerts]);

  return { alerts, setAlerts, loading, error, lastUpdated, loadAlerts };
}
