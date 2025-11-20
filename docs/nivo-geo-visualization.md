# Nivo (@nivo/geo)를 이용한 기상특보 지도 시각화 구현 방안

Next.js 15 웹 대시보드에서 Leaflet CircleMarker 점 시각화를 Nivo 기반 Choropleth로 전환하기 위한 실무 지침이다. 지도 엔진 선택 이유, 구현 스펙, 단계별 마이그레이션과 코드 예시를 포함한다.

---

## 1. Nivo (@nivo/geo) 개요

- **라이브러리 설명**  
  Nivo는 D3.js 위에 구축된 React 전용 데이터 시각화 모듈 세트다. `@nivo/geo` 패키지는 GeoJSON을 이용한 Choropleth, BubbleMap, Sankey-like 지도 위젯을 제공하며, SVG와 Canvas 렌더러를 선택할 수 있다.
- **D3.js와의 관계**  
  내부적으로 `d3-geo`, `d3-scale`, `d3-shape` 등을 사용해 투영·path 계산과 색상 스케일을 처리한다. 사용자는 D3 API를 직접 호출하지 않고도 `projectionType`, `valueFormat`, `colors` 등의 prop으로 동작을 제어하지만, 필요 시 `custom layers`로 D3 유틸을 직접 쓸 수도 있다.
- **React/Next.js 통합 방식**  
  모든 Nivo 컴포넌트는 DOM에 의존하므로 Client Component에서만 렌더링해야 한다. Next.js 15에서는 `app/(dashboard)/map/MapView.tsx`에 `'use client';`를 선언하거나 `dynamic(() => import('./MapView'), { ssr: false })`로 로드한다. 데이터는 Server Component에서 가공해 props로 넘기는 방식(Streaming/RSC)과 궁합이 좋다.
- **Nivo 생태계**  
  `@nivo/core`, `@nivo/axes`, `@nivo/colors` 등 공통 유틸을 공유하므로, 향후 Area/Line/Bar/Heatmap 등 다른 차트와 동일한 theme, legend, tooltip 패턴을 재사용할 수 있다. 단일 theme/defs 설정을 `ThemeProvider`처럼 묶는 것이 가능하므로 Chart.js보다 스타일 일관성을 확보하기 쉽다.

## 2. 장점과 단점

- **Leaflet 대비 개선점**
  - GeoJSON 경계를 직접 채우므로 CircleMarker 대비 시도 단위 특보를 직관적으로 표현할 수 있다.
  - 외부 타일 서버 의존이 없어 Next.js Static Export/ISR에서도 동일하게 동작한다.
  - 같은 Nivo 테마를 다른 차트(누적 강수량, 풍속 차트 등)에도 공유해 브랜드 일관성을 유지한다.
- **react-simple-maps 대비 차별점**
  - Tooltip, Legend, ColorScale, Motion을 내장해 복잡도를 낮춘다. 반면 custom layer로 sparkline 등을 추가할 수 있어 표현력이 높다.
  - Canvas 렌더러(`ResponsiveChoroplethCanvas`)를 제공하므로 17개 시도보다 많은 feature가 추가돼도 성능을 유지한다.
  - 단점: react-simple-maps보다 기본 번들 크기(~80KB gzip)와 의존성 수가 많아 초기 로딩 비용이 증가한다.
- **Chart.js와의 통합/교체 가능성**
  - Chart.js는 2D 캔버스 기반이라 지도와 일관된 테마/툴팁을 맞추기 어렵다. 대시보드 전체를 Nivo로 통일하면 컬러 토큰과 텍스트 규칙을 공유할 수 있다.
  - 완전 교체 대신 Chart.js 통계를 Server Component에서 계산하고, 결과를 props로 내려 Nivo 차트로 렌더링하는 하이브리드 전략을 사용할 수 있다.
- **기술적 제약사항**
  - SSR 불가: DOM/Window 의존성이 있어 반드시 클라이언트 전용으로 분리해야 한다.
  - GeoJSON 로딩 시 `import`를 사용하면 JS 번들이 커질 수 있으므로 `fetch('/korea-provinces.json')` 또는 `Top level await + dynamic import`로 lazy-load를 권장한다.
- **성능 고려사항**
  - 17개 feature라면 SVG 렌더러도 충분히 빠르지만, 특보 업데이트 주기가 높을 경우 `useMemo`로 색상 매핑을 캐싱한다.
  - Tooltip 이동 시 `onMouseMove`에서 state를 직접 갱신하지 않고 Nivo의 내장 tooltip을 사용하면 리렌더 횟수를 줄인다.
  - Canvas 버전은 마우스 이벤트 hit-map 비용이 낮으므로 향후 읍면동 단위 확대 시 고려한다.
- **유지보수성**
  - 모든 스타일과 상호작용을 prop으로 정의하므로 디자이너 요구사항을 변경하기 쉽다.
  - Storybook/Chromatic을 통해 snapshot 테스트를 진행할 수 있고, 동일한 data schema를 다른 Nivo 차트에서도 재사용할 수 있어 코드 재사용도가 높다.

## 3. 구현 스펙

- **필요한 패키지 및 권장 버전**

  | 패키지 | 버전 | 비고 |
  | --- | --- | --- |
  | `@nivo/geo` | `^0.85.0` | Choropleth, BubbleMap 제공 |
  | `@nivo/core` | `^0.85.0` | Theme, motion, tooltip 공통 모듈 |
  | `d3-scale`, `d3-format` | `^4.0.2`, `^4.0.2` | 값 포맷과 색상 스케일 확장(옵션) |
  | `topojson-client` (선택) | `^3.1.0` | 빌드 타임 TopoJSON 변환 |
  | `@types/geojson` | `^7946.0.14` | GeoJSON 타입 보강 |

- **한국 GeoJSON 데이터 소스**
  - [southkorea-maps/kostat-geojson](https://github.com/southkorea-maps/kostat-geojson) – `skorea-provinces-2018-geo.json` (경계 + 한글명 `name_local` 포함).
  - 국토지리정보원 공간정보 오픈플랫폼 – 최신 행정구역 경계를 제공하며, `CTP_KOR_NM` 필드가 `upperRegion`과 매핑된다.
  - 데이터 용량을 줄이기 위해 `npx mapshaper provinces.geojson -simplify 5% keep-shapes -o format=topojson`으로 단순화 후 `web/public/data/korea-provinces.json`에 저장한다.

- **프로젝트 구조 제안**
  ```
  web/
    components/
      map/
        MapView.tsx          # Nivo 기반 Choropleth
        hooks.ts             # 데이터 전처리 훅(useChoroplethData)
        constants.ts         # REGION_NAME_MAP, COLOR_STOPS
    data/
      korea-provinces.json   # GeoJSON 또는 TopoJSON
  ```

- **TypeScript 타입 정의**
  ```ts
  export interface RegionAlert {
    upperRegion: string;              // e.g. "서울특별시"
    maxWarningLevel: 0 | 1 | 2 | 3;   // 단계별 색상
    warnings: string[];
    issuedAt: string;
  }

  export interface ProvinceFeature extends GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon> {
    properties: {
      code: string;
      name: string;
      name_local: string;             // GeoJSON 제공 필드
    };
  }
  ```

- **Chart.js와의 공존/통합 방안**
  - 대시보드 초기에는 Chart.js 통계 패널을 유지하되, 동일한 `RegionAlert[]` 모델을 공유한다.
  - 상태 관리(예: Zustand, React Query) 층에서 데이터를 가져온 뒤 Chart.js와 MapView에 각각 prop으로 전달하면 중복 fetch를 제거할 수 있다.
  - 향후 Chart.js를 Nivo Bar/Line으로 교체할 경우에도 `Theme`와 `colors`만 공유하면 UI 일관성이 유지된다.

## 4. 핵심 기능 구현

- **Choropleth(17개 시도 색상 구분)**  
  `ResponsiveChoropleth`의 `features` prop에 GeoJSON FeatureCollection을 전달하고, `data` 배열을 `id`(feature properties와 동일) + `value` 형식으로 제공한다. `colors={{ scheme: 'reds' }}` 대신 커스텀 `colors` 배열과 `domain={[0, 3]}`를 지정해 특보 단계별 색을 고정한다.
- **지역 클릭 이벤트**  
  `onClick` 핸들러를 지정하면 GeoJSON feature 정보를 받을 수 있다. `onClick={(feature) => onRegionClick?.(feature.data.label)}` 식으로 기존 Leaflet 핸들러를 재사용한다.
- **툴팁/레이블**  
  `tooltip` prop으로 React component를 넘기면 Nivo tooltip 포털에서 렌더링된다. `label` prop으로 지도 내부 레이블을 렌더할 수 있으며, 17개 feature라면 `enableGraticule={false}`로 간결하게 유지한다.
- **줌/팬 기능**  
  Choropleth 자체는 줌/팬 컨트롤을 제공하지 않지만 `projectionScale`과 `projectionTranslation` state를 조정해 구현할 수 있다. 버튼/휠 이벤트로 이 state를 변경하면 Leaflet 수준의 zoom/pan UX를 제공할 수 있다.
- **반응형 디자인**  
  `ResponsiveChoropleth`는 부모 컨테이너 크기에 맞춰 SVG를 스케일링한다. Next.js에서는 Tailwind `aspect-video`, `h-[400px]` 등을 사용해 콘테이너 크기를 제어한다.
- **Nivo 테마 커스터마이징**  
  `const theme: Theme = { background: 'transparent', tooltip: {...}, labels: {...} }`처럼 정의하고 `MapView` prop에 전달한다. 전체 앱에서 공통 theme를 사용하려면 `createNivoTheme(tokens)` 유틸을 작성해 차트 전반에 공유한다.

## 5. 코드 예시

```tsx
// web/components/map/MapView.tsx
'use client';

import { memo, useMemo, useState } from 'react';
import { ResponsiveChoropleth, ChoroplethDatum, DefaultChoroplethProps } from '@nivo/geo';
import type { FeatureCollection } from 'geojson';
import koreaProvinces from '@/data/korea-provinces.json' assert { type: 'json' };
import type { RegionAlert } from '@/types/alerts';

type MapViewProps = {
  alerts: RegionAlert[];
  onRegionSelect?: (region: string) => void;
};

const LEVEL_COLOR_STOPS: Record<number, string> = {
  0: '#cbd5f5',
  1: '#7dd3fc',
  2: '#fbbf24',
  3: '#ef4444',
};

const REGION_NAME_MAP: Record<string, string> = {
  서울특별시: '서울특별시',
  부산광역시: '부산광역시',
  대구광역시: '대구광역시',
  인천광역시: '인천광역시',
  광주광역시: '광주광역시',
  대전광역시: '대전광역시',
  울산광역시: '울산광역시',
  세종특별자치시: '세종특별자치시',
  경기도: '경기도',
  강원특별자치도: '강원특별자치도',
  충청북도: '충청북도',
  충청남도: '충청남도',
  전북특별자치도: '전북특별자치도',
  전라남도: '전라남도',
  경상북도: '경상북도',
  경상남도: '경상남도',
  제주특별자치도: '제주특별자치도',
};

const nivoTheme: DefaultChoroplethProps<ChoroplethDatum>['theme'] = {
  background: 'transparent',
  tooltip: {
    container: {
      background: '#0f172a',
      color: '#f8fafc',
      borderRadius: 6,
      padding: 12,
      boxShadow: '0 8px 20px rgba(15,23,42,0.35)',
    },
  },
  labels: {
    text: {
      fill: '#0f172a',
      fontSize: 12,
      fontWeight: 600,
    },
  },
};

function MapView({ alerts, onRegionSelect }: MapViewProps) {
  const [zoom, setZoom] = useState(2200);
  const [translation, setTranslation] = useState<[number, number]>([0.58, 0.9]);

  const levelByRegion = useMemo(() => {
    const map = new Map<string, RegionAlert>();
    alerts.forEach((alert) => {
      map.set(REGION_NAME_MAP[alert.upperRegion] ?? alert.upperRegion, alert);
    });
    return map;
  }, [alerts]);

  const choroplethData = useMemo<ChoroplethDatum[]>(() => {
    return (koreaProvinces as FeatureCollection).features.map((feature) => {
      const regionName = (feature.properties as any)?.name_local;
      const alert = levelByRegion.get(regionName);
      return {
        id: regionName,
        label: regionName,
        value: alert?.maxWarningLevel ?? 0,
        data: alert,
      };
    });
  }, [levelByRegion]);

  return (
    <div className="relative h-[480px] w-full rounded-xl border border-slate-200 bg-white p-4 shadow">
      <div className="absolute right-4 top-4 z-10 flex gap-2 text-xs">
        <button className="rounded-full border px-3 py-1" onClick={() => setZoom((z) => Math.min(z + 200, 3200))}>
          +
        </button>
        <button className="rounded-full border px-3 py-1" onClick={() => setZoom((z) => Math.max(z - 200, 1200))}>
          -
        </button>
      </div>
      <ResponsiveChoropleth
        data={choroplethData}
        features={(koreaProvinces as FeatureCollection).features}
        valueFormat={(value) => `${value ?? 0}단계`}
        colors={(datum) => LEVEL_COLOR_STOPS[Number(datum.value)] ?? LEVEL_COLOR_STOPS[0]}
        domain={[0, 3]}
        unknownColor="#e2e8f0"
        label="properties.name_local"
        projectionType="mercator"
        projectionScale={zoom}
        projectionTranslation={translation}
        enableGraticule={false}
        borderWidth={0.7}
        borderColor="#ffffff"
        onClick={(datum) => onRegionSelect?.(datum.label ?? '')}
        tooltip={({ feature }) => {
          const alert = feature.data?.data as RegionAlert | undefined;
          return (
            <div>
              <p className="font-semibold">{feature.label}</p>
              <p>특보 수준: {alert?.maxWarningLevel ?? 0}</p>
              <p>{alert?.warnings?.join(', ') || '특보 없음'}</p>
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
            itemHeight: 18,
            itemsSpacing: 4,
            symbolSize: 16,
            data: [
              { label: '경보', color: LEVEL_COLOR_STOPS[3] },
              { label: '주의보', color: LEVEL_COLOR_STOPS[2] },
              { label: '예비특보', color: LEVEL_COLOR_STOPS[1] },
              { label: '정상', color: LEVEL_COLOR_STOPS[0] },
            ],
          },
        ]}
      />
    </div>
  );
}

export default memo(MapView);
```

- **특보 수준별 색상 매핑**  
  `LEVEL_COLOR_STOPS` 사전을 통해 단계 → HEX 매핑을 고정하고, `colors={(datum) => ...}` 형태로 전달하면 Nivo의 기본 색상 스케일을 우회할 수 있다. `@nivo/colors`의 `ordinalColors`를 사용할 수도 있다.
- **GeoJSON 데이터 로딩**  
  위 예시는 Next.js 15의 `appDir` JSON import(`assert { type: 'json' }`)을 사용한다. Runtime fetch가 필요하면 `useSWR` 또는 `React.use` 기반 async 데이터 훅을 만들고 로딩 상태에서 Skeleton을 표시한다.
- **지역명 매핑**  
  `REGION_NAME_MAP`은 `upperRegion`과 GeoJSON `properties.name_local`을 연결한다. 데이터 포맷이 다른 경우 `hooks.ts`에서 정규화(`normalizeRegionName(alert.upperRegion)`) 후 map에 키로 사용한다.
- **Nivo 테마 설정**  
  `nivoTheme` 객체를 정의해 Tooltip, Label, Legends, Axis 색을 Tailwind 컬러에 맞춰 커스터마이징했다. 이 객체를 `@/lib/nivo-theme.ts`로 분리해 바 차트, 라인 차트에도 재사용할 수 있다.

## 6. 마이그레이션 가이드

1. **GeoJSON 준비 및 검증**  
   - 기존 Leaflet CircleMarker에서 사용하던 `upperRegion` 값 목록을 추출해 GeoJSON `name_local`과 비교한다. Jest 스냅샷으로 누락된 지역이 없는지 확인한다.
   - 필요 시 `scripts/prepare-geojson.ts`를 만들어 mapshaper CLI를 호출해 단순화 후 `public/data`에 저장한다.
2. **패키지 설치**  
   ```bash
   cd web
   npm install @nivo/geo @nivo/core d3-scale d3-format
   npm install -D @types/geojson
   ```
3. **MapView 교체 단계**
   - `MapView.leaflet.tsx`를 보관하고, 새로운 `MapView.nivo.tsx`를 작성한다.
   - `app/dashboard/page.tsx` 등에서 Feature Flag(`process.env.NEXT_PUBLIC_MAP_ENGINE`)로 렌더링 컴포넌트를 스위칭한다.
4. **Chart.js → Nivo 로드맵 (선택)**
   - 1차: 지도만 Nivo로 교체하되 Chart.js 통계 카드는 유지.
   - 2차: 가장 단순한 차트(막대/라인)부터 Nivo 차트로 대체, 공통 Theme와 Legend 컴포넌트를 추출.
   - 3차: Chart.js 제거, 데이터 훅을 공유해 중복 계산 제거.
5. **호환성 유지 방안**
   - Leaflet 버전을 Storybook/Chromatic 시나리오로 남겨 회귀 여부를 확인한다.
   - API 응답 형식이 변할 경우를 대비해 `MapView` props를 `RegionAlert[]`에서 `MapData` 객체로 추상화한다.
6. **테스트 전략**
   - **단위 테스트**: `normalizeRegionName`, `buildChoroplethData` 함수에 대한 입력/출력 테스트.
   - **시각 테스트**: Playwright screenshot 또는 Chromatic diff로 주요 뷰포트(모바일/데스크톱) 캐싱.
   - **접근성 테스트**: `@axe-core/react` 또는 `jest-axe`로 대비/ARIA 검사.
   - **성능 테스트**: Lighthouse CI에서 초기 JS 번들 크기와 TTI 비교(Leaflet vs Nivo).

## 7. 예상 구현 난이도 및 시간

- **개발 복잡도**: 3.5/5 – GeoJSON 데이터 정규화, zoom/pan state 구현, 테마 통합 등 고려할 요소가 많음.
- **예상 구현 시간**
  - GeoJSON 준비 및 매핑 검증: 0.5일
  - MapView 컴포넌트 + 툴팁/줌/반응형: 1일
  - QA, 피드백 반영, Feature Flag 릴리스: 0.5일  
  총 2일 내외. Chart.js → Nivo 로드맵 실행 시 차트 개수당 0.5~1일 추가.
- **주요 리스크**
  - GeoJSON 필드명과 `upperRegion` 불일치 → 색상 누락. Jest 테스트와 Storybook docs에서 조기 검증 필요.
  - Next.js 빌드 시 JSON import가 커져 초기 JS 번들이 증가 → dynamic import + ISR 캐싱 필요.
  - Tooltip/Zoom 상태 관리가 과도해지면 렌더링이 잦아 성능 저하 → `useMemo`, `useCallback`으로 최적화.
- **react-simple-maps 대비 복잡도**
  - Nivo는 내장 legend/theme 덕분에 UI 개발 속도가 빠른 대신 초기 진입 비용(번들 크기, prop 학습)이 조금 더 높다.
  - 커스텀 레이어나 애니메이션이 필요한 경우 Nivo에서 제공하는 API가 더 강력하므로 장기 유지보수성은 Nivo가 우위이다. react-simple-maps는 경량/단순성 면에서 유리하다.

---

위 가이드를 따르면 기존 Leaflet에서 Nivo Choropleth로 무리 없이 전환하고, Chart.js 기반 통계를 점진적으로 Nivo 생태계로 통합할 수 있다.
