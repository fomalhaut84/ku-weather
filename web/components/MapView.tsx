'use client';

/**
 * 지도 컴포넌트 - Nivo Choropleth 기반
 *
 * Feature Flag로 Leaflet/Nivo 전환 가능
 * 환경변수: NEXT_PUBLIC_USE_NIVO_MAP (true/false)
 */

import { lazy, Suspense } from 'react';
import type { WeatherAlert } from '@/types/alert';

// Dynamic import로 번들 크기 최적화
const MapViewNivo = lazy(() => import('./map/MapView.nivo'));
const MapViewLeaflet = lazy(() => import('./MapView.leaflet'));

interface MapViewProps {
  alerts: WeatherAlert[];
  onRegionClick?: (upperRegion: string) => void;
}

// Feature Flag 확인
const USE_NIVO_MAP = process.env.NEXT_PUBLIC_USE_NIVO_MAP === 'true';

console.log('[MapView] Feature Flag - USE_NIVO_MAP:', USE_NIVO_MAP, 'env:', process.env.NEXT_PUBLIC_USE_NIVO_MAP);

export default function MapView(props: MapViewProps) {
  const MapComponent = USE_NIVO_MAP ? MapViewNivo : MapViewLeaflet;
  console.log('[MapView] 선택된 컴포넌트:', USE_NIVO_MAP ? 'Nivo' : 'Leaflet');

  return (
    <Suspense
      fallback={
        <div className="w-full h-[480px] bg-slate-100 rounded-xl animate-pulse flex items-center justify-center">
          <div className="text-slate-500 text-sm">지도 로딩 중...</div>
        </div>
      }
    >
      <MapComponent {...props} />
    </Suspense>
  );
}
