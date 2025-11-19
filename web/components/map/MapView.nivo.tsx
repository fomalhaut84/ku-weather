'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Choropleth } from '@nivo/geo';
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
  const [zoom, setZoom] = useState(4000);
  const [showMarineAlerts, setShowMarineAlerts] = useState(true);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [isLoadingGeoJson, setIsLoadingGeoJson] = useState(true);

  // 특보 데이터 전처리
  const regionDataMap = useChoroplethData(alerts);
  const marineStats = useMarineAlertStats(alerts);

  // GeoJSON 데이터를 비동기로 로드 (번들 크기 최적화)
  useEffect(() => {
    let isMounted = true;

    async function loadGeoJson() {
      try {
        const response = await fetch('/data/skorea-provinces-geo.json');
        if (!response.ok) throw new Error(`GeoJSON 로드 실패: ${response.status}`);

        const data = await response.json();
        if (!isMounted) return;

        // 각 feature에 명시적인 id 추가 (Nivo가 key로 사용)
        const featuresWithId = data.features.map((feature: any) => ({
          ...feature,
          id: feature.properties?.code || feature.properties?.name,
        }));

        setGeoJsonData({ ...data, features: featuresWithId });
        setIsLoadingGeoJson(false);
      } catch (error) {
        console.error('[MapView.nivo] GeoJSON 로드 실패:', error);
        setIsLoadingGeoJson(false);
      }
    }

    loadGeoJson();

    return () => {
      isMounted = false;
    };
  }, []);

  // Choropleth 데이터 생성
  const choroplethData = useMemo(() => {
    const data = geoJsonData.features.map((feature) => {
      const geoJsonName = feature.properties?.name || '';
      const upperRegion = REGION_NAME_MAP[geoJsonName] || geoJsonName;
      const regionData = regionDataMap.get(upperRegion);

      return {
        id: feature.id || feature.properties?.code || geoJsonName, // feature.id와 일치
        label: geoJsonName,
        value: regionData?.maxWarningLevel || 0,
        data: regionData,
      };
    });
    return data;
  }, [geoJsonData, regionDataMap]);

  // 로딩 중일 때
  if (isLoadingGeoJson) {
    return (
      <div className="relative w-full h-[480px] bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-slate-600">지도 데이터 로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col">
      {/* 지도 영역 */}
      <div className="relative w-full h-[600px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
        {/* 줌 컨트롤 */}
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            onClick={() => setZoom((z) => Math.min(z + 500, 6000))}
            aria-label="확대"
          >
            +
          </button>
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            onClick={() => setZoom((z) => Math.max(z - 500, 2000))}
            aria-label="축소"
          >
            −
          </button>
          <button
            className="bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-colors"
            onClick={() => setZoom(4000)}
            aria-label="초기화"
          >
            초기화
          </button>
        </div>

        {/* 지도 내 해상 특보 패널 */}
        {marineStats.totalCount > 0 && (
          <div className="absolute left-4 bottom-4 z-10 max-w-xs">
            {showMarineAlerts ? (
              <div className="bg-white/95 backdrop-blur-sm border border-blue-300 rounded-lg p-3 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌊</span>
                    <h3 className="font-semibold text-blue-900 text-sm">
                      해상 특보 {marineStats.totalCount}건
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowMarineAlerts(false)}
                    className="text-blue-600 hover:text-blue-800 text-lg leading-none"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {marineStats.alerts.slice(0, 6).map((alert: WeatherAlert) => (
                    <div
                      key={alert.id}
                      className="text-xs bg-blue-50 rounded px-2 py-1.5 border border-blue-200"
                    >
                      <div className="font-semibold text-blue-900">
                        {alert.regionName || alert.upperRegion || '해상'}
                      </div>
                      <div className="text-blue-700">
                        {WARNING_TYPE_NAMES[alert.warningType]} {WARNING_LEVEL_NAMES[alert.warningLevel]}
                      </div>
                    </div>
                  ))}
                  {marineStats.totalCount > 6 && (
                    <div className="text-xs text-blue-700 text-center pt-1">
                      외 {marineStats.totalCount - 6}건
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowMarineAlerts(true)}
                className="bg-white/95 backdrop-blur-sm hover:bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-blue-900 font-medium text-sm shadow-lg transition-colors flex items-center gap-2"
              >
                <span>🌊</span>
                <span>해상 특보 {marineStats.totalCount}건</span>
              </button>
            )}
          </div>
        )}

        {/* Choropleth 지도 */}
        {geoJsonData.features.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-500">GeoJSON 데이터가 없습니다</div>
          </div>
        ) : (
          <Choropleth
            width={1100}
            height={560}
            data={choroplethData}
            features={geoJsonData.features}
            match="id"
            value="value"
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            colors={[
              LAND_ALERT_COLORS[0],
              LAND_ALERT_COLORS[1],
              LAND_ALERT_COLORS[2],
              LAND_ALERT_COLORS[3],
            ]}
            domain={[0, 3]}
            unknownColor="#f1f5f9"
            label="properties.name"
            valueFormat=".0f"
            projectionType="mercator"
            projectionScale={zoom}
            projectionTranslation={[0.5, 0.48]}
            projectionRotation={[-127.5, -36.5, 0]}
            enableGraticule={false}
            graticuleLineColor="#e0e0e0"
            borderWidth={1.5}
            borderColor="#cbd5e1"
          onClick={(feature) => {
            const geoJsonName = feature.label || '';
            const upperRegion = REGION_NAME_MAP[geoJsonName] || geoJsonName;
            onRegionClick?.(upperRegion);
          }}
          tooltip={({ feature }) => {
            const regionData = feature.data?.data;
            if (!regionData) return null;

            // 육상 특보를 특보 종류별로 그루핑
            const landAlertGroups = regionData.landAlerts.reduce((acc: any, alert: WeatherAlert) => {
              const key = `${alert.warningType}-${alert.warningLevel}`;
              if (!acc[key]) {
                acc[key] = {
                  type: alert.warningType,
                  level: alert.warningLevel,
                  regions: [],
                };
              }
              acc[key].regions.push(alert.regionName || alert.upperRegion);
              return acc;
            }, {});

            // 해상 특보를 특보 종류별로 그루핑
            const marineAlertGroups = regionData.marineAlerts.reduce((acc: any, alert: WeatherAlert) => {
              const key = `${alert.warningType}-${alert.warningLevel}`;
              if (!acc[key]) {
                acc[key] = {
                  type: alert.warningType,
                  level: alert.warningLevel,
                  regions: [],
                };
              }
              acc[key].regions.push(alert.regionName || alert.upperRegion || '해상');
              return acc;
            }, {});

            return (
              <div className="bg-slate-900/95 backdrop-blur-sm text-white rounded-lg p-3 shadow-xl max-w-sm">
                <div className="font-bold text-base mb-2 border-b border-slate-700 pb-2">{feature.label}</div>
                {Object.keys(landAlertGroups).length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {Object.values(landAlertGroups).map((group: any, idx: number) => (
                      <div key={idx}>
                        <div className="flex items-center gap-2 font-semibold text-yellow-400">
                          <span>●</span>
                          <span>
                            {WARNING_TYPE_NAMES[group.type] || group.type}{' '}
                            {WARNING_LEVEL_NAMES[group.level]} ({group.regions.length})
                          </span>
                        </div>
                        <div className="ml-5 text-xs text-slate-300 mt-1">
                          {group.regions.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">육상 특보 없음</div>
                )}
                {Object.keys(marineAlertGroups).length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-700">
                    <div className="text-xs text-blue-300 font-bold mb-2">
                      🌊 해상 특보 {regionData.marineAlerts.length}건
                    </div>
                    <div className="space-y-2 text-sm">
                      {Object.values(marineAlertGroups).map((group: any, idx: number) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2 font-semibold text-blue-400">
                            <span>●</span>
                            <span>
                              {WARNING_TYPE_NAMES[group.type]} {WARNING_LEVEL_NAMES[group.level]} ({group.regions.length})
                            </span>
                          </div>
                          <div className="ml-5 text-xs text-slate-300 mt-1">
                            {group.regions.slice(0, 5).join(', ')}
                            {group.regions.length > 5 && ` 외 ${group.regions.length - 5}곳`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }}
          theme={{
            ...nivoTheme,
            labels: {
              text: {
                ...nivoTheme.labels?.text,
                fill: '#1e293b',
                fontWeight: 700,
                fontSize: 12,
                textShadow: '0 0 3px #ffffff, 0 0 3px #ffffff, 0 0 3px #ffffff',
              },
            },
          }}
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
        )}
      </div>
    </div>
  );
}

export default memo(MapViewNivo);
