'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import type { WeatherAlert } from '@/types/alert';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <LoadingSpinner message="지도 로딩 중..." />,
});

interface MapSectionProps {
  alerts: WeatherAlert[];
  showMap: boolean;
  onToggle: () => void;
  onRegionClick: (upperRegion: string) => void;
}

export default function MapSection({ alerts, showMap, onToggle, onRegionClick }: MapSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">🗺️ 전국 특보 현황 지도</h2>
        <button
          onClick={onToggle}
          aria-expanded={showMap}
          className="text-sm text-blue-600 hover:underline"
        >
          {showMap ? '지도 숨기기' : '지도 보기'}
        </button>
      </div>

      {showMap ? (
        <div
          role="region"
          aria-label="전국 특보 현황 지도"
          className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px] rounded-lg overflow-hidden border border-gray-200"
        >
          <MapView alerts={alerts} onRegionClick={onRegionClick} />
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">
          지도를 보려면 &apos;지도 보기&apos;를 클릭하세요
        </p>
      )}
    </div>
  );
}
