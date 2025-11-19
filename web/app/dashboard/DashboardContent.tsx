'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getCurrentAlerts, getAvailableRegions, getAvailableWarningTypes } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WeatherAlert } from '@/types/alert';
import type { Region, WarningType } from '@/types/subscription';
import {
  WARNING_TYPE_NAMES,
  WARNING_LEVEL_NAMES,
  WARNING_TYPE_EMOJI,
  WARNING_LEVEL_COLORS
} from '@/types/alert';

// MapView는 클라이언트 사이드에서만 로드 (Leaflet SSR 이슈 방지)
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-gray-600">지도 로딩 중...</p>
      </div>
    </div>
  ),
});

// ChartView도 클라이언트 사이드에서만 로드
const ChartView = dynamic(() => import('@/components/ChartView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-gray-600">차트 로딩 중...</p>
      </div>
    </div>
  ),
});

// AdvancedChartView도 클라이언트 사이드에서만 로드
const AdvancedChartView = dynamic(() => import('@/components/AdvancedChartView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-gray-600">고급 차트 로딩 중...</p>
      </div>
    </div>
  ),
});

// HeatmapView도 클라이언트 사이드에서만 로드
const HeatmapView = dynamic(() => import('@/components/HeatmapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-gray-600">히트맵 로딩 중...</p>
      </div>
    </div>
  ),
});

// WeatherForecastCard도 클라이언트 사이드에서만 로드
const WeatherForecastCard = dynamic(() => import('@/components/WeatherForecastCard'), {
  ssr: false,
});

// NotificationManager도 클라이언트 사이드에서만 로드
const NotificationManager = dynamic(() => import('@/components/NotificationManager'), {
  ssr: false,
});

export default function DashboardContent() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [availableWarningTypes, setAvailableWarningTypes] = useState<WarningType[]>([]);

  // 필터 상태
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedWarningType, setSelectedWarningType] = useState<string>('');
  const [selectedWarningLevel, setSelectedWarningLevel] = useState<string>('');

  // 자동 새로고침
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 지도 표시 상태
  const [showMap, setShowMap] = useState(true);

  // 통계 표시 상태
  const [showStats, setShowStats] = useState(false);
  const [statsTab, setStatsTab] = useState<'basic' | 'advanced' | 'heatmap'>('basic');
  const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d'>('7d');
  const [advancedPeriod, setAdvancedPeriod] = useState<'6m' | '1y' | '2y'>('1y');
  const [heatmapPeriod, setHeatmapPeriod] = useState<'6m' | '1y' | '2y'>('1y');

  // 브라우저 알림 상태
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  // WebSocket 실시간 업데이트
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const { isConnected, error: wsError } = useWebSocket({
    enabled: realtimeEnabled,
    onNewAlert: useCallback((alert: WeatherAlert) => {
      // 새로운 특보를 추가하거나 기존 특보를 업데이트
      setAlerts(prev => {
        const existingIndex = prev.findIndex(a => a.id === alert.id);

        if (existingIndex !== -1) {
          // 기존 특보가 있으면 업데이트
          const updated = [...prev];
          updated[existingIndex] = alert;
          return updated;
        }

        // 새로운 특보면 맨 앞에 추가
        return [alert, ...prev];
      });

      // 브라우저 알림도 표시
      if (notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
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
    }, [notificationEnabled]),
    onAlertRemoved: useCallback((alertId: string) => {
      // 특보 해제 시 목록에서 제거
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }, []),
  });

  // 특보 데이터 로드
  const loadAlerts = useCallback(async () => {
    try {
      setError(null);

      const filters: any = {};
      if (selectedRegion) {
        // 지역 코드를 지역 이름으로 변환
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
    } catch (err) {
      setError('특보 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  }, [selectedRegion, selectedWarningType, selectedWarningLevel]);

  // 초기 데이터 로드
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [regionsRes, warningTypesRes] = await Promise.all([
          getAvailableRegions(),
          getAvailableWarningTypes(),
        ]);

        if (regionsRes.success) {
          setAvailableRegions(regionsRes.data || []);
        }

        if (warningTypesRes.success) {
          setAvailableWarningTypes(warningTypesRes.data || []);
        }

        // URL 파라미터에서 필터 설정
        const regionParam = searchParams.get('region');
        const typeParam = searchParams.get('type');
        const levelParam = searchParams.get('level');

        if (regionParam) {
          // regionParam이 name일 수도 있고 code일 수도 있으므로 둘 다 확인
          const regionObj = regionsRes.data?.find(
            (r) => r.code === regionParam || r.name === regionParam
          );
          if (regionObj) {
            setSelectedRegion(regionObj.code);
          }
        }
        if (typeParam) setSelectedWarningType(typeParam);
        if (levelParam) setSelectedWarningLevel(levelParam);

      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    }

    loadMetadata();
  }, [searchParams]);

  // 필터 변경 시 특보 데이터 다시 로드
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // 자동 새로고침 (5분 간격)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAlerts();
    }, 5 * 60 * 1000); // 5분

    return () => clearInterval(interval);
  }, [autoRefresh, loadAlerts]);

  // 날짜 포맷팅
  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // 상대 시간 표시
  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  };

  // 지도에서 지역 클릭 핸들러
  const handleRegionClick = useCallback((upperRegion: string) => {
    // upperRegion은 지역 이름이므로 code로 변환
    // REGION_NAME_MAP 매핑을 고려하여 양방향 검색
    const regionObj = availableRegions.find((r) => {
      // 정확한 이름 매칭
      if (r.name === upperRegion) return true;

      // 특별자치도 → 일반명 매칭
      if (upperRegion === '강원도' && r.name === '강원특별자치도') return true;
      if (upperRegion === '전라북도' && r.name === '전북특별자치도') return true;
      if (upperRegion === '제주도' && r.name === '제주특별자치도') return true;

      // 일반명 → 특별자치도 매칭 (반대 방향)
      if (upperRegion === '강원특별자치도' && r.name === '강원도') return true;
      if (upperRegion === '전북특별자치도' && r.name === '전라북도') return true;
      if (upperRegion === '제주특별자치도' && r.name === '제주도') return true;

      return false;
    });

    if (regionObj) {
      setSelectedRegion(regionObj.code);
    }
  }, [availableRegions]);

  // 로딩 중
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">특보 현황 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-slate-800">📊 기상특보 현황</h1>
            <button
              onClick={() => loadAlerts()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🔄 새로고침
            </button>
          </div>

          {lastUpdated && (
            <p className="text-sm text-gray-500">
              마지막 업데이트: {formatDateTime(lastUpdated.toISOString())} ({getRelativeTime(lastUpdated)})
            </p>
          )}

          {/* 자동 새로고침 및 알림 토글 */}
          <div className="mt-4 space-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">자동 새로고침 (5분 간격)</span>
            </label>

            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={(e) => setNotificationEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">🔔 브라우저 알림 (새로운 특보 발생 시)</span>
            </label>

            <div className="flex items-center gap-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={realtimeEnabled}
                  onChange={(e) => setRealtimeEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm">⚡ 실시간 업데이트 (WebSocket)</span>
              </label>
              {realtimeEnabled && (
                <span className={`text-xs px-2 py-0.5 rounded ${isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {isConnected ? '연결됨' : '연결 중...'}
                </span>
              )}
            </div>

            {wsError && realtimeEnabled && (
              <p className="text-xs text-red-600 ml-6">
                * WebSocket 서버에 연결할 수 없습니다. 폴링 모드로 동작합니다.
              </p>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* 필터 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🔍 필터</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 지역 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                지역
              </label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">전체 지역</option>
                {availableRegions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 특보 종류 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                특보 종류
              </label>
              <select
                value={selectedWarningType}
                onChange={(e) => setSelectedWarningType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">전체 특보</option>
                {availableWarningTypes.map((warning) => (
                  <option key={warning.code} value={warning.code}>
                    {WARNING_TYPE_EMOJI[warning.code] || ''} {warning.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 특보 수준 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                특보 수준
              </label>
              <select
                value={selectedWarningLevel}
                onChange={(e) => setSelectedWarningLevel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">전체 수준</option>
                <option value="1">⚠️ 예비특보</option>
                <option value="2">🟠 주의보</option>
                <option value="3">🔴 경보</option>
              </select>
            </div>
          </div>

          {/* 필터 초기화 */}
          {(selectedRegion || selectedWarningType || selectedWarningLevel) && (
            <button
              onClick={() => {
                setSelectedRegion('');
                setSelectedWarningType('');
                setSelectedWarningLevel('');
              }}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              필터 초기화
            </button>
          )}
        </div>

        {/* 지도 섹션 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">🗺️ 전국 특보 현황 지도</h2>
            <button
              onClick={() => setShowMap(!showMap)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showMap ? '지도 숨기기' : '지도 보기'}
            </button>
          </div>

          {showMap && (
            <div className="w-full h-[600px] rounded-lg overflow-hidden border border-gray-200">
              <MapView
                alerts={alerts}
                onRegionClick={handleRegionClick}
              />
            </div>
          )}

          {!showMap && (
            <p className="text-sm text-gray-500 text-center py-8">
              지도를 보려면 &apos;지도 보기&apos;를 클릭하세요
            </p>
          )}
        </div>

        {/* 날씨 예보 카드 */}
        {selectedRegion && (
          <div className="mb-6">
            <WeatherForecastCard regionId={selectedRegion} />
          </div>
        )}

        {/* 특보 목록 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">
              현재 발효 중인 특보 ({alerts.length}개)
            </h2>
          </div>

          {alerts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">🌤️</div>
              <p className="text-xl text-gray-600 mb-2">발효 중인 특보가 없습니다</p>
              <p className="text-sm text-gray-500">
                현재 선택한 필터에 해당하는 특보가 없습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border-2 rounded-lg p-6 ${WARNING_LEVEL_COLORS[alert.warningLevel] || 'bg-gray-100 border-gray-300'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* 특보 헤더 */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">
                          {WARNING_TYPE_EMOJI[alert.warningType] || '⚠️'}
                        </span>
                        <div>
                          <h3 className="text-xl font-bold">
                            {alert.regionName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-semibold">
                              {WARNING_TYPE_NAMES[alert.warningType] || alert.warningType}
                            </span>
                            <span className="px-2 py-1 rounded text-sm font-bold">
                              {WARNING_LEVEL_NAMES[alert.warningLevel] || alert.warningLevel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 특보 상세 정보 */}
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">발표 시각:</span>
                          <span>{formatDateTime(alert.announcedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">발효 시각:</span>
                          <span>{formatDateTime(alert.effectiveAt)}</span>
                        </div>
                        {alert.endTime && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">종료 시각:</span>
                            <span>{formatDateTime(alert.endTime)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 통계 섹션 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">📊 특보 발생 통계</h2>
            <button
              onClick={() => setShowStats(!showStats)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showStats ? '통계 숨기기' : '통계 보기'}
            </button>
          </div>

          {showStats ? (
            <>
              {/* 탭 네비게이션 */}
              <div className="flex gap-4 mb-4 border-b">
                <button
                  onClick={() => setStatsTab('basic')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    statsTab === 'basic'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  기본 통계
                </button>
                <button
                  onClick={() => setStatsTab('advanced')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    statsTab === 'advanced'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  고급 통계 (월별/계절별/연도별)
                </button>
                <button
                  onClick={() => setStatsTab('heatmap')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    statsTab === 'heatmap'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  히트맵 (지역/시간/특보별)
                </button>
              </div>

              {/* 기간 선택 버튼 */}
              {statsTab === 'basic' ? (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setStatsPeriod('7d')}
                    className={`px-3 py-1 rounded text-sm ${
                      statsPeriod === '7d'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 7일
                  </button>
                  <button
                    onClick={() => setStatsPeriod('30d')}
                    className={`px-3 py-1 rounded text-sm ${
                      statsPeriod === '30d'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 30일
                  </button>
                </div>
              ) : statsTab === 'advanced' ? (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setAdvancedPeriod('6m')}
                    className={`px-3 py-1 rounded text-sm ${
                      advancedPeriod === '6m'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 6개월
                  </button>
                  <button
                    onClick={() => setAdvancedPeriod('1y')}
                    className={`px-3 py-1 rounded text-sm ${
                      advancedPeriod === '1y'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 1년
                  </button>
                  <button
                    onClick={() => setAdvancedPeriod('2y')}
                    className={`px-3 py-1 rounded text-sm ${
                      advancedPeriod === '2y'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 2년
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setHeatmapPeriod('6m')}
                    className={`px-3 py-1 rounded text-sm ${
                      heatmapPeriod === '6m'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 6개월
                  </button>
                  <button
                    onClick={() => setHeatmapPeriod('1y')}
                    className={`px-3 py-1 rounded text-sm ${
                      heatmapPeriod === '1y'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 1년
                  </button>
                  <button
                    onClick={() => setHeatmapPeriod('2y')}
                    className={`px-3 py-1 rounded text-sm ${
                      heatmapPeriod === '2y'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
                    }`}
                  >
                    최근 2년
                  </button>
                </div>
              )}

              {/* 차트 렌더링 */}
              {statsTab === 'basic' ? (
                <ChartView period={statsPeriod} />
              ) : statsTab === 'advanced' ? (
                <AdvancedChartView period={advancedPeriod} />
              ) : (
                <HeatmapView period={heatmapPeriod} />
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              통계를 보려면 &apos;통계 보기&apos;를 클릭하세요
            </p>
          )}
        </div>

        {/* 하단 링크 */}
        <div className="text-center">
          <Link
            href="/"
            className="text-blue-600 hover:underline"
          >
            홈으로
          </Link>
        </div>
      </div>

      {/* 브라우저 알림 관리자 */}
      <NotificationManager
        enabled={notificationEnabled}
        checkInterval={60000} // 1분마다 체크
      />
    </main>
  );
}
