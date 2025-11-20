# react-simple-maps를 이용한 기상특보 지도 시각화 구현 방안

Next.js 15 대시보드에서 Leaflet CircleMarker 기반 시각화를 D3 Choropleth 맵으로 전환하기 위한 실무 지침이다. 문서는 라이브러리 개요부터 마이그레이션 전략, 코드 예시까지 포함한다.

---

## 1. react-simple-maps 개요

- **라이브러리 설명**  
  `react-simple-maps`는 D3-Geo, TopoJSON을 래핑한 React 전용 지도 컴포넌트 세트다. SVG 기반 렌더링을 사용하며 `<ComposableMap>`, `<Geographies>`, `<Geography>`, `<ZoomableGroup>`과 같은 선언적 API를 제공한다.
- **D3.js와의 관계**  
  내부적으로 `d3-geo`로 투영 및 경계 path를 계산하고, `d3-zoom`/`d3-scale` 기능 일부를 노출한다. 따라서 Choropleth 색상 스케일, 투영 설정, 줌/팬 로직은 D3 생태계의 유틸을 그대로 활용할 수 있다.
- **React/Next.js 통합 방식**  
  SVG만 사용하므로 브라우저 전용 API 의존성이 적다. Next.js 15에서는 `dynamic(() => import('./MapView'), { ssr: false })`로 클라이언트 전용 컴포넌트를 지연 로드하면 된다. GeoJSON은 `import` 또는 `fetch`로 불러와도 되고, React Server Component에서 데이터를 가공해 Client Component에 props로 넘길 수도 있다.

## 2. 장점과 단점

- **Leaflet 대비 개선점**
  - 점 마커 대신 다각형(17개 시도 경계)을 채우므로, 행정구역별 특보를 바로 확인할 수 있다.
  - SVG 기반이라 Tailwind/Emotion 등 기존 스타일 시스템을 그대로 적용 가능하며, 반응형 레이아웃에서 크기를 쉽게 제어할 수 있다.
  - TopoJSON을 사용하면 데이터 용량이 CircleMarker 좌표 목록보다 작아지는 경우가 많다(약 200KB 수준).
- **기술적 제약사항**
  - Tile 기반 배경 지도는 기본 제공되지 않는다. 필요 시 `<Geographies>` 위에 커스텀 배경을 그리거나 `react-simple-maps` 대신 Mapbox 등 사용을 고려해야 한다.
  - 3D 지형이나 고정밀 줌(>1:50,000)은 지원하지 않는다.
- **성능 고려사항**
  - SVG path 수가 17개 수준이라 매우 가볍다. 다만, 특보 데이터 업데이트 주기가 짧다면 `useMemo`로 색상 계산을 캐싱하고 최소한의 rerender만 발생하도록 해야 한다.
  - Tooltip을 위한 DOM 포털을 사용할 경우, 포인터 이동 이벤트 디바운스(예: `requestAnimationFrame`)를 적용하면 프레임 드랍을 방지할 수 있다.
- **유지보수성**
  - React 컴포넌트 트리와 동일한 패턴으로 테스트/스토리북 추가가 가능하다.
  - D3-based 색상 스케일을 별도 유틸로 분리하면 경보 정책 변경 시에도 단일 모듈만 수정하면 된다.

## 3. 구현 스펙

- **필요한 패키지 및 권장 버전**

  | 패키지 | 버전 | 목적 |
  | --- | --- | --- |
  | `react-simple-maps` | `^3.0.0` | Choropleth 컴포넌트 |
  | `d3-scale`, `d3-geo` | `^4.0.2`, `^3.1.0` | 색상 스케일, 투영 |
  | `topojson-client` | `^3.1.0` | GeoJSON ↔ TopoJSON 변환(사전 변환 시 선택) |
  | `@types/topojson-client` | `^3.1.3` | 타입 지원 |

- **한국 지도 GeoJSON 데이터 소스**
  - [southkorea-maps/kostat-geojson](https://github.com/southkorea-maps/kostat-geojson): `kostat/2015/json/skorea-provinces-2018-geo.json` 파일은 `name`(영문)과 `name_local`(한글) 속성을 제공한다.
  - 통계청(TS) 행정구역 경계 OpenAPI를 사용해 최신 GeoJSON을 주기적으로 갱신할 수도 있다. 빌드 타임에 TopoJSON으로 압축해 `web/data/korea-provinces-topo.json`으로 저장하는 것을 권장한다.

- **프로젝트 구조 변경사항 (제안)**
  ```
  web/
    components/
      MapView.tsx          # react-simple-maps 기반으로 교체
      map/
        constants.ts       # 지역 코드/색상 매핑
        useChoropleth.ts   # 데이터 전처리 훅
    data/
      korea-provinces-topo.json
  ```
  기존 Leaflet 컴포넌트는 `MapView.leaflet.tsx`로 보존하거나 `git tag`로 기록한다.

- **TypeScript 타입 정의**
  ```ts
  export type ProvinceFeature = {
    type: 'Feature';
    properties: {
      code: string;              // 예: 11, 26
      name: string;              // 영문
      name_local: string;        // 한글 (upperRegion과 매핑)
    };
  };

  export interface RegionAlertStat {
    upperRegion: string;
    maxWarningLevel: number;
    warningTypes: string[];
    latestUpdatedAt: string;
  }
  ```
  GeoJSON 속성명이 다르면 `properties.CTP_KOR_NM` 등을 명시한다.

## 4. 핵심 기능 구현

- **Choropleth (17개 시도 색상 구분)**  
  `scaleThreshold<number, string>`를 이용해 `[0,1,2,3]` 수준에 따라 색상을 반환하고 `<Geography>`의 `style={{ default: { fill } }}`에 전달한다.
- **지역 클릭 이벤트 처리**  
  `<Geography onClick={(geo) => onRegionClick?.(geo.properties.name_local)} />`로 기존 `onRegionClick` 핸들러를 재활용한다.
- **툴팁/레이블 표시**  
  - 간단한 툴팁: `onMouseEnter`에서 상태를 업데이트하고, 절대 위치 Tooltip 컴포넌트를 렌더링한다.
  - 복수 경보 표시: `regionAlerts[upperRegion]` 배열을 HTML 리스트로 구성해 제공한다.
- **줌/팬 기능**  
  `<ZoomableGroup zoom={zoom} onMoveEnd={setPosition} minZoom={0.8} maxZoom={8}>` 사용. Leaflet과 달리 타일 재요청이 없으므로 애니메이션 비용이 낮다.
- **반응형 디자인**  
  `viewBox`가 있는 SVG라 Flex/Grid 영역에 맞춰 자동으로 조정된다. 컨테이너를 `aspect-[4/3]` 또는 `h-[40vh]` 등으로 지정하면 된다.

## 5. 코드 예시 (TypeScript)

```tsx
// web/components/MapView.tsx
'use client';

import { memo, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleThreshold } from 'd3-scale';
import type { Feature } from 'geojson';
import koreaTopo from '@/data/korea-provinces-topo.json';
import type { WeatherAlert } from '@/types/alert';

type ProvinceFeature = Feature & {
  properties: {
    code: string;
    name_local: string;  // 예: '서울특별시'
    name: string;
  };
};

const ALERT_SCALE = scaleThreshold<number, string>()
  .domain([0, 1, 2, 3])
  .range(['#22c55e', '#eab308', '#f97316', '#ef4444']);

const REGION_NAME_MAP: Record<string, string> = {
  '서울특별시': '서울특별시',
  '인천광역시': '인천광역시',
  '경기도': '경기도',
  '강원특별자치도': '강원도', // GeoJSON 명칭과 upperRegion 통합
  // …17개 시도 매핑
};

interface MapViewProps {
  alerts: WeatherAlert[];
  onRegionClick?: (upperRegion: string) => void;
}

function groupAlertLevel(alerts: WeatherAlert[]) {
  const levelByRegion = new Map<string, number>();
  const tooltipByRegion = new Map<string, string[]>();

  alerts.forEach((alert) => {
    if (!alert.upperRegion) return;
    const level = Number.parseInt(alert.warningLevel, 10) || 0;
    const prev = levelByRegion.get(alert.upperRegion) ?? 0;
    if (level > prev) levelByRegion.set(alert.upperRegion, level);
    const key = alert.upperRegion;
    const entries = tooltipByRegion.get(key) ?? [];
    entries.push(`${alert.warningType} ${alert.warningLevel}`);
    tooltipByRegion.set(key, entries);
  });

  return { levelByRegion, tooltipByRegion };
}

function MapView({ alerts, onRegionClick }: MapViewProps) {
  const { levelByRegion, tooltipByRegion } = useMemo(() => groupAlertLevel(alerts), [alerts]);
  const [hoverInfo, setHoverInfo] = useState<{ region: string; x: number; y: number } | null>(null);

  return (
    <div className="relative w-full h-full">
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 5500, center: [127.5, 36.3] }}>
        <ZoomableGroup center={[127.5, 36.3]} minZoom={0.9} maxZoom={10}>
          <Geographies geography={koreaTopo}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const feature = geo as ProvinceFeature;
                const regionName = REGION_NAME_MAP[feature.properties.name_local] ?? feature.properties.name_local;
                const alertLevel = levelByRegion.get(regionName) ?? 0;
                const fill = ALERT_SCALE(alertLevel) || '#22c55e';

                return (
                  <Geography
                    key={feature.properties.code}
                    geography={feature}
                    onClick={() => onRegionClick?.(regionName)}
                    onMouseEnter={(evt) => {
                      setHoverInfo({
                        region: regionName,
                        x: evt.clientX,
                        y: evt.clientY,
                      });
                    }}
                    onMouseLeave={() => setHoverInfo(null)}
                    style={{
                      default: { fill, stroke: '#fff', strokeWidth: 0.6, outline: 'none' },
                      hover: { fill, stroke: '#0f172a', strokeWidth: 1, cursor: 'pointer' },
                      pressed: { fill, stroke: '#0f172a', strokeWidth: 1 },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
        >
          <p className="font-semibold">{hoverInfo.region}</p>
          {(tooltipByRegion.get(hoverInfo.region) ?? ['특보 없음']).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <Legend />
    </div>
  );
}

const Legend = memo(() => (
  <div className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs shadow-md">
    <h3 className="mb-2 font-semibold">특보 수준</h3>
    <ul className="space-y-1">
      {[{ label: '경보', level: 3 }, { label: '주의보', level: 2 }, { label: '예비특보', level: 1 }, { label: '정상', level: 0 }].map(
        ({ label, level }) => (
          <li key={label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ALERT_SCALE(level) }} />
            {label}
          </li>
        ),
      )}
    </ul>
  </div>
));

export default memo(MapView);
```

- `korea-provinces-topo.json`은 `name_local` 속성(예: `서울특별시`)을 제공한다고 가정했다.
- `REGION_NAME_MAP`에서 `upperRegion` 필드와 GeoJSON 속성명을 1:1로 연결해야 한다. 예: `강원특별자치도` ↔ `강원도`.
- `groupAlertLevel` 유틸은 기존 Leaflet 마커 로직을 재사용한다.

## 6. 마이그레이션 가이드

1. **GeoJSON/TopoJSON 준비**  
   - Git LFS 없이도 커밋 가능한 용량(<5MB)을 유지한다. 필요 시 `npx mapshaper`로 단순화(`-simplify 10% keep-shapes`) 후 `-o format=topojson`.
2. **패키지 설치**  
   ```bash
   npm install react-simple-maps d3-scale d3-geo topojson-client
   npm install -D @types/topojson-client
   ```
3. **새 컴포넌트 작성**  
   - `web/components/MapView.tsx`을 위 코드로 교체하고, 기존 Leaflet 버전은 `MapView.leaflet.tsx`로 백업한다.
   - `web/app/dashboard/DashboardContent.tsx` 등에서 import 경로 유지.
4. **데이터 연결**  
   - `WeatherAlert` 데이터를 props로 내려주던 로직은 동일하지만, `upperRegion`이 없는 경우 fallback 처리를 추가한다.
5. **호환성 유지 방안**
   - 최초 릴리스 전까지 Feature Flag(`process.env.NEXT_PUBLIC_USE_SIMPLE_MAPS`)로 Leaflet/Choropleth 토글을 제공.
   - e2e 테스트와 Storybook에 두 버전을 모두 남겨 회귀를 감지.
6. **테스트 전략**
   - **단위 테스트**: `groupAlertLevel` 함수에 대한 케이스(다중 경보, 누락 데이터)를 `vitest/jest`로 검증.
   - **비주얼 테스트**: Storybook+Chromatic 또는 Playwright screenshot test로 주요 뷰포트(데스크톱, 태블릿) 캡처.
   - **접근성 테스트**: `axe-playwright`로 Contrast, aria-label 등을 검증.

## 7. 예상 구현 난이도 및 시간

- **개발 복잡도**: 3/5 – GeoJSON 매핑과 tooltip/zoom 구현이 필요하지만 기능 수는 제한적이다.
- **예상 구현 시간**: 
  - 데이터 파이프라인/TopoJSON 준비: 0.5일  
  - MapView 컴포넌트 개발 및 스타일링: 1일  
  - QA/테스트/플래그 배포: 0.5일  
  총 2일 내외.
- **주요 리스크**
  - GeoJSON 속성명과 `upperRegion` 문자열 불일치 → 지도 색상이 누락될 수 있음. 마이그레이션 초기에 매핑 테이블을 검증하고 Jest 스냅샷으로 보호한다.
  - SSR/빌드 시 GeoJSON import 크기로 인해 Next.js 번들이 커질 수 있다 → Dynamic import와 `gzip` 체크 필요.
  - Tooltip 위치 계산 시 모바일 터치 대응이 누락될 수 있음 → `onPointerEnter` 기반으로 통합.

---

위 스펙을 따르면 기존 Leaflet CircleMarker 구현을 유지하면서도 D3 기반 Choropleth 맵을 점진적으로 도입할 수 있다.
