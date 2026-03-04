import { useState } from 'react';

type StatsTab = 'basic' | 'advanced' | 'heatmap';

interface UseDashboardSettingsReturn {
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  showMap: boolean;
  setShowMap: (v: boolean) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  statsTab: StatsTab;
  setStatsTab: (v: StatsTab) => void;
  statsPeriod: '7d' | '30d';
  setStatsPeriod: (v: '7d' | '30d') => void;
  advancedPeriod: '6m' | '1y' | '2y';
  setAdvancedPeriod: (v: '6m' | '1y' | '2y') => void;
  heatmapPeriod: '6m' | '1y' | '2y';
  setHeatmapPeriod: (v: '6m' | '1y' | '2y') => void;
  notificationEnabled: boolean;
  setNotificationEnabled: (v: boolean) => void;
  realtimeEnabled: boolean;
  setRealtimeEnabled: (v: boolean) => void;
}

export function useDashboardSettings(): UseDashboardSettingsReturn {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [statsTab, setStatsTab] = useState<StatsTab>('basic');
  const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d'>('7d');
  const [advancedPeriod, setAdvancedPeriod] = useState<'6m' | '1y' | '2y'>('1y');
  const [heatmapPeriod, setHeatmapPeriod] = useState<'6m' | '1y' | '2y'>('1y');
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  return {
    autoRefresh, setAutoRefresh,
    showMap, setShowMap,
    showStats, setShowStats,
    statsTab, setStatsTab,
    statsPeriod, setStatsPeriod,
    advancedPeriod, setAdvancedPeriod,
    heatmapPeriod, setHeatmapPeriod,
    notificationEnabled, setNotificationEnabled,
    realtimeEnabled, setRealtimeEnabled,
  };
}
