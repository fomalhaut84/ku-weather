'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { WeatherAlert } from '@/types/alert';

// 한국 주요 지역 좌표 (DB upperRegion 기준)
// DB 지역명과 일치하도록 수정 (Nivo와 동일)
const REGION_COORDINATES: Record<string, [number, number]> = {
  '서울특별시': [37.5665, 126.9780],
  '부산광역시': [35.1796, 129.0756],
  '대구광역시': [35.8714, 128.6014],
  '인천광역시': [37.4563, 126.7052],
  '광주광역시': [35.1595, 126.8526],
  '대전광역시': [36.3504, 127.3845],
  '울산광역시': [35.5384, 129.3114],
  '세종특별자치시': [36.4800, 127.2890],
  '경기도': [37.4138, 127.5183],
  '강원도': [37.8228, 128.1555],
  '충청북도': [36.8, 127.7],
  '충청남도': [36.5184, 126.8],
  '전라북도': [35.7175, 127.153],
  '전라남도': [34.8679, 126.991],
  '경상북도': [36.4919, 128.888],
  '경상남도': [35.4606, 128.2132],
  '제주도': [33.4890, 126.4983], // DB 지역명과 일치
};

// 특보 수준에 따른 색상
const ALERT_COLORS: Record<number, string> = {
  0: '#22c55e', // 정상 - 녹색
  1: '#eab308', // 예비특보 - 노란색
  2: '#f97316', // 주의보 - 주황색
  3: '#ef4444', // 경보 - 빨간색
};

interface MapViewProps {
  alerts: WeatherAlert[];
  onRegionClick?: (upperRegion: string) => void;
}

export default function MapView({ alerts, onRegionClick }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // 지도 초기화
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Leaflet 지도 생성
    const map = L.map(mapContainerRef.current, {
      center: [36.5, 127.5], // 한국 중심
      zoom: 7,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // OpenStreetMap 타일 레이어 추가
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // 모든 지역에 기본 마커 추가
    Object.entries(REGION_COORDINATES).forEach(([upperRegion, coords]) => {
      const marker = L.circleMarker(coords, {
        radius: 15,
        fillColor: ALERT_COLORS[0],
        fillOpacity: 0.7,
        color: '#fff',
        weight: 2,
      }).addTo(map);

      // 지역명 레이블 추가
      marker.bindTooltip(upperRegion, {
        permanent: false,
        direction: 'top',
      });

      marker.on('click', () => {
        onRegionClick?.(upperRegion);
      });

      markersRef.current.set(upperRegion, marker);
    });

    // 정리 함수
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, [onRegionClick]);

  // 특보 데이터 업데이트
  useEffect(() => {
    if (!mapRef.current) return;

    // 모든 마커를 기본 상태로 초기화
    markersRef.current.forEach((marker, upperRegion) => {
      marker.setStyle({
        fillColor: ALERT_COLORS[0],
        radius: 15,
      });

      // 기본 툴팁 (지역명만)
      marker.bindTooltip(upperRegion, {
        permanent: false,
        direction: 'top',
      });
    });

    if (alerts.length === 0) return;

    // 각 지역별 최고 특보 수준 계산
    const regionAlertLevels = new Map<string, number>();
    const regionAlerts = new Map<string, WeatherAlert[]>();

    alerts.forEach((alert) => {
      if (!alert.upperRegion) return;

      const currentLevel = regionAlertLevels.get(alert.upperRegion) || 0;
      const alertLevel = getAlertLevel(alert.warningLevel);

      if (alertLevel > currentLevel) {
        regionAlertLevels.set(alert.upperRegion, alertLevel);
      }

      // 지역별 특보 목록 저장
      if (!regionAlerts.has(alert.upperRegion)) {
        regionAlerts.set(alert.upperRegion, []);
      }
      regionAlerts.get(alert.upperRegion)!.push(alert);
    });

    // 마커 색상 및 툴팁 업데이트
    markersRef.current.forEach((marker, upperRegion) => {
      const level = regionAlertLevels.get(upperRegion) || 0;
      const color = ALERT_COLORS[level];

      marker.setStyle({
        fillColor: color,
        radius: level > 0 ? 20 : 15, // 특보 발생 시 마커 크기 증가
      });

      // 툴팁 업데이트 (XSS 방지를 위해 DOM 노드 생성)
      const alerts = regionAlerts.get(upperRegion);
      if (alerts && alerts.length > 0) {
        const container = document.createElement('div');

        const title = document.createElement('strong');
        title.textContent = upperRegion;
        container.appendChild(title);

        alerts.forEach(a => {
          container.appendChild(document.createElement('br'));
          const alertText = document.createTextNode(
            `${getWarningTypeName(a.warningType)} ${getWarningLevelName(a.warningLevel)}`
          );
          container.appendChild(alertText);
        });

        marker.bindTooltip(container, {
          permanent: false,
          direction: 'top',
        });
      }
    });
  }, [alerts]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" />

      {/* 범례 */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000]">
        <h3 className="font-semibold mb-2 text-sm">특보 수준</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: ALERT_COLORS[3] }}></div>
            <span>경보</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: ALERT_COLORS[2] }}></div>
            <span>주의보</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: ALERT_COLORS[1] }}></div>
            <span>예비특보</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: ALERT_COLORS[0] }}></div>
            <span>정상</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 특보 수준 숫자로 변환
function getAlertLevel(warningLevel: string): number {
  const level = parseInt(warningLevel, 10);
  return isNaN(level) ? 0 : level;
}

// 특보 종류 이름
function getWarningTypeName(warningType: string): string {
  const names: Record<string, string> = {
    'W': '강풍',
    'R': '호우',
    'C': '한파',
    'D': '건조',
    'O': '해일',
    'N': '지진해일',
    'V': '풍랑',
    'T': '태풍',
    'S': '대설',
    'Y': '황사',
    'H': '폭염',
    'F': '안개',
  };
  return names[warningType] || warningType;
}

// 특보 수준 이름
function getWarningLevelName(warningLevel: string): string {
  const names: Record<string, string> = {
    '1': '예비특보',
    '2': '주의보',
    '3': '경보',
  };
  return names[warningLevel] || warningLevel;
}
