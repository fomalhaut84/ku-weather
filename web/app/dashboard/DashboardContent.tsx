'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDashboardAlerts } from '@/hooks/useDashboardAlerts';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { WARNING_TYPE_NAMES, WARNING_LEVEL_NAMES } from '@/types/alert';
import type { WeatherAlert } from '@/types/alert';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorAlert from '@/components/common/ErrorAlert';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import AlertFilters from '@/components/dashboard/AlertFilters';
import MapSection from '@/components/dashboard/MapSection';
import AlertList from '@/components/dashboard/AlertList';
import StatsSection from '@/components/dashboard/StatsSection';

const WeatherForecastCard = dynamic(() => import('@/components/WeatherForecastCard'), {
  ssr: false,
});

const NotificationManager = dynamic(() => import('@/components/NotificationManager'), {
  ssr: false,
});

export default function DashboardContent() {
  const filters = useDashboardFilters();
  const settings = useDashboardSettings();

  const { alerts, setAlerts, loading, error, lastUpdated, loadAlerts } = useDashboardAlerts({
    selectedRegion: filters.selectedRegion,
    selectedWarningType: filters.selectedWarningType,
    selectedWarningLevel: filters.selectedWarningLevel,
    availableRegions: filters.availableRegions,
    autoRefresh: settings.autoRefresh,
  });

  // WebSocket 실시간 업데이트
  const { isConnected, error: wsError } = useWebSocket({
    enabled: settings.realtimeEnabled,
    onNewAlert: useCallback((alert: WeatherAlert) => {
      setAlerts(prev => {
        const existingIndex = prev.findIndex(a => a.id === alert.id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = alert;
          return updated;
        }
        return [alert, ...prev];
      });

      if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        const title = `${WARNING_TYPE_NAMES[alert.warningType] || alert.warningType} ${WARNING_LEVEL_NAMES[alert.warningLevel] || alert.warningLevel}`;
        const body = `${alert.regionName}에 특보가 발표되었습니다.`;

        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: alert.id,
        });

        notification.onclick = () => {
          window.focus();
          window.location.href = `/dashboard?region=${encodeURIComponent(alert.upperRegion || '')}`;
          notification.close();
        };

        setTimeout(() => notification.close(), 10000);
      }
    }, [settings.notificationEnabled, setAlerts]),
    onAlertRemoved: useCallback((alertId: string) => {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }, [setAlerts]),
  });

  // 지도에서 지역 클릭 핸들러
  const { availableRegions, setSelectedRegion } = filters;
  const handleRegionClick = useCallback((upperRegion: string) => {
    const regionObj = availableRegions.find((r) => {
      if (r.name === upperRegion) return true;
      if (upperRegion === '강원도' && r.name === '강원특별자치도') return true;
      if (upperRegion === '전라북도' && r.name === '전북특별자치도') return true;
      if (upperRegion === '제주도' && r.name === '제주특별자치도') return true;
      if (upperRegion === '강원특별자치도' && r.name === '강원도') return true;
      if (upperRegion === '전북특별자치도' && r.name === '전라북도') return true;
      if (upperRegion === '제주특별자치도' && r.name === '제주도') return true;
      return false;
    });

    if (regionObj) {
      setSelectedRegion(regionObj.code);
    }
  }, [availableRegions, setSelectedRegion]);

  if (loading) {
    return <LoadingSpinner fullScreen message="특보 현황 로딩 중..." />;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <DashboardHeader
          lastUpdated={lastUpdated}
          autoRefresh={settings.autoRefresh}
          onAutoRefreshChange={settings.setAutoRefresh}
          notificationEnabled={settings.notificationEnabled}
          onNotificationChange={settings.setNotificationEnabled}
          realtimeEnabled={settings.realtimeEnabled}
          onRealtimeChange={settings.setRealtimeEnabled}
          isConnected={isConnected}
          wsError={wsError}
          onRefresh={loadAlerts}
        />

        {error && <ErrorAlert message={error} className="mb-6" />}

        <AlertFilters
          selectedRegion={filters.selectedRegion}
          onRegionChange={filters.setSelectedRegion}
          selectedWarningType={filters.selectedWarningType}
          onWarningTypeChange={filters.setSelectedWarningType}
          selectedWarningLevel={filters.selectedWarningLevel}
          onWarningLevelChange={filters.setSelectedWarningLevel}
          availableRegions={filters.availableRegions}
          availableWarningTypes={filters.availableWarningTypes}
          hasActiveFilters={filters.hasActiveFilters}
          onReset={filters.resetFilters}
        />

        <MapSection
          alerts={alerts}
          showMap={settings.showMap}
          onToggle={() => settings.setShowMap(!settings.showMap)}
          onRegionClick={handleRegionClick}
        />

        {filters.selectedRegion && (
          <div className="mb-6">
            <WeatherForecastCard regionId={filters.selectedRegion} />
          </div>
        )}

        <AlertList alerts={alerts} />

        <StatsSection
          showStats={settings.showStats}
          onToggle={() => settings.setShowStats(!settings.showStats)}
          statsTab={settings.statsTab}
          onTabChange={settings.setStatsTab}
          statsPeriod={settings.statsPeriod}
          onStatsPeriodChange={settings.setStatsPeriod}
          advancedPeriod={settings.advancedPeriod}
          onAdvancedPeriodChange={settings.setAdvancedPeriod}
          heatmapPeriod={settings.heatmapPeriod}
          onHeatmapPeriodChange={settings.setHeatmapPeriod}
        />
      </div>

      <NotificationManager
        enabled={settings.notificationEnabled}
        checkInterval={60000}
      />
    </main>
  );
}
