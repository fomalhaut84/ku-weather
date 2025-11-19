'use client';

import { memo, useMemo, useState } from 'react';
import { ResponsiveChoropleth } from '@nivo/geo';
import type { FeatureCollection } from 'geojson';
import type { WeatherAlert } from '@/types/alert';
import { WARNING_TYPE_NAMES, WARNING_LEVEL_NAMES } from '@/types/alert';
import { nivoTheme } from '@/lib/nivo-theme';
import { useChoroplethData, useMarineAlertStats } from './hooks';
import { LAND_ALERT_COLORS, REGION_NAME_MAP } from './constants';

interface MapViewProps {
  alerts: WeatherAlert[];
  onRegionClick?: (upperRegion: string) => void;
}

function MapViewNivo({ alerts, onRegionClick }: MapViewProps) {
  const [zoom, setZoom] = useState(2200);
  const [showMarineAlerts, setShowMarineAlerts] = useState(true);

  // 특보 데이터 전처리
  const regionDataMap = useChoroplethData(alerts);
  const marineStats = useMarineAlertStats(alerts);

  // GeoJSON 데이터 로드 (static import)
  const geoJsonData = useMemo<FeatureCollection>(() => {
    try {
      return require('@/public/data/skorea-provinces-geo.json');
    } catch (error) {
      console.error('GeoJSON 로드 실패:', error);
      return { type: 'FeatureCollection', features: [] };
    }
  }, []);

  // Choropleth 데이터 생성
  const choroplethData = useMemo(() => {
    return geoJsonData.features.map((feature) => {
      const geoJsonName = feature.properties?.name || '';
      const upperRegion = REGION_NAME_MAP[geoJsonName] || geoJsonName;
      const regionData = regionDataMap.get(upperRegion);

      return {
        id: geoJsonName,
        label: geoJsonName,
        value: regionData?.maxWarningLevel || 0,
        data: regionData,
      };
    });
  }, [geoJsonData, regionDataMap]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* 지도 영역 */}
      <div className="relative flex-1 min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 줌 컨트롤 */}
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            onClick={() => setZoom((z) => Math.min(z + 300, 3500))}
            aria-label="확대"
          >
            +
          </button>
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            onClick={() => setZoom((z) => Math.max(z - 300, 1500))}
            aria-label="축소"
          >
            −
          </button>
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-colors"
            onClick={() => setZoom(2200)}
            aria-label="초기화"
          >
            초기화
          </button>
        </div>

        {/* Choropleth 지도 */}
        <ResponsiveChoropleth
          data={choroplethData}
          features={geoJsonData.features}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          colors={(datum) => LAND_ALERT_COLORS[Number(datum.value) || 0]}
          domain={[0, 3]}
          unknownColor="#f1f5f9"
          label="properties.name"
          valueFormat={(value) => `경보 단계: ${value}`}
          projectionType="mercator"
          projectionScale={zoom}
          projectionTranslation={[0.58, 0.9]}
          projectionRotation={[0, 0, 0]}
          enableGraticule={false}
          borderWidth={1.2}
          borderColor="#ffffff"
          onClick={(feature) => {
            const geoJsonName = feature.label || '';
            const upperRegion = REGION_NAME_MAP[geoJsonName] || geoJsonName;
            onRegionClick?.(upperRegion);
          }}
          tooltip={({ feature }) => {
            const regionData = feature.data?.data;
            if (!regionData) return null;

            return (
              <div className="bg-slate-900 text-white rounded-lg p-3 shadow-xl max-w-xs">
                <div className="font-semibold text-base mb-2">{feature.label}</div>
                {regionData.landAlerts.length > 0 ? (
                  <div className="space-y-1 text-sm">
                    {regionData.landAlerts.map((alert: WeatherAlert, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-yellow-400">●</span>
                        <span>
                          {WARNING_TYPE_NAMES[alert.warningType] || alert.warningType}{' '}
                          {WARNING_LEVEL_NAMES[alert.warningLevel]}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-300">특보 없음</div>
                )}
                {regionData.marineAlerts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <div className="text-xs text-blue-300 font-semibold mb-1">
                      해상 특보 {regionData.marineAlerts.length}건
                    </div>
                    <div className="space-y-1 text-sm">
                      {regionData.marineAlerts.slice(0, 3).map((alert: WeatherAlert, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-blue-400">🌊</span>
                          <span className="text-xs">
                            {WARNING_TYPE_NAMES[alert.warningType]} {WARNING_LEVEL_NAMES[alert.warningLevel]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }}
          theme={nivoTheme}
          legends={[
            {
              anchor: 'bottom-left',
              direction: 'column',
              translateX: 20,
              translateY: -30,
              itemWidth: 100,
              itemHeight: 22,
              itemsSpacing: 4,
              symbolSize: 18,
              symbolShape: 'circle',
              data: [
                { id: '경보', label: '경보', color: LAND_ALERT_COLORS[3] },
                { id: '주의보', label: '주의보', color: LAND_ALERT_COLORS[2] },
                { id: '예비특보', label: '예비특보', color: LAND_ALERT_COLORS[1] },
                { id: '정상', label: '정상', color: LAND_ALERT_COLORS[0] },
              ],
            },
          ]}
        />
      </div>

      {/* 해상 특보 요약 */}
      {marineStats.totalCount > 0 && showMarineAlerts && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 relative">
          <button
            onClick={() => setShowMarineAlerts(false)}
            className="absolute top-2 right-2 text-blue-600 hover:text-blue-800 text-xl"
            aria-label="닫기"
          >
            ×
          </button>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🌊</span>
            <h3 className="font-semibold text-blue-900">
              해상 특보 {marineStats.totalCount}건
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {marineStats.alerts.slice(0, 8).map((alert: WeatherAlert, idx: number) => (
              <div
                key={idx}
                className="bg-white rounded-lg p-3 border border-blue-200 text-sm"
              >
                <div className="font-semibold text-blue-900 mb-1">
                  {alert.upperRegion || '기타'}
                </div>
                <div className="text-blue-700">
                  {WARNING_TYPE_NAMES[alert.warningType]} {WARNING_LEVEL_NAMES[alert.warningLevel]}
                </div>
                <div className="text-xs text-blue-600 mt-1">{alert.regionName}</div>
              </div>
            ))}
          </div>
          {marineStats.totalCount > 8 && (
            <div className="mt-3 text-center text-sm text-blue-700">
              외 {marineStats.totalCount - 8}건
            </div>
          )}
        </div>
      )}

      {/* 해상 특보 숨김 시 표시 버튼 */}
      {marineStats.totalCount > 0 && !showMarineAlerts && (
        <button
          onClick={() => setShowMarineAlerts(true)}
          className="mt-4 w-full bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl p-3 text-blue-900 font-medium transition-colors"
        >
          🌊 해상 특보 {marineStats.totalCount}건 보기
        </button>
      )}
    </div>
  );
}

export default memo(MapViewNivo);
