'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const ChartView = dynamic(() => import('@/components/ChartView'), {
  ssr: false,
  loading: () => <LoadingSpinner message="차트 로딩 중..." />,
});

const AdvancedChartView = dynamic(() => import('@/components/AdvancedChartView'), {
  ssr: false,
  loading: () => <LoadingSpinner message="고급 차트 로딩 중..." />,
});

const HeatmapView = dynamic(() => import('@/components/HeatmapView'), {
  ssr: false,
  loading: () => <LoadingSpinner message="히트맵 로딩 중..." />,
});

type StatsTab = 'basic' | 'advanced' | 'heatmap';

interface StatsSectionProps {
  showStats: boolean;
  onToggle: () => void;
  statsTab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  statsPeriod: '7d' | '30d';
  onStatsPeriodChange: (v: '7d' | '30d') => void;
  advancedPeriod: '6m' | '1y' | '2y';
  onAdvancedPeriodChange: (v: '6m' | '1y' | '2y') => void;
  heatmapPeriod: '6m' | '1y' | '2y';
  onHeatmapPeriodChange: (v: '6m' | '1y' | '2y') => void;
}

const TABS: { key: StatsTab; label: string }[] = [
  { key: 'basic', label: '기본 통계' },
  { key: 'advanced', label: '고급 통계 (월별/계절별/연도별)' },
  { key: 'heatmap', label: '히트맵 (지역/시간/특보별)' },
];

function PeriodButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 mb-4">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 min-h-[44px] rounded text-sm ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-slate-800 hover:bg-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function StatsSection({
  showStats,
  onToggle,
  statsTab,
  onTabChange,
  statsPeriod,
  onStatsPeriodChange,
  advancedPeriod,
  onAdvancedPeriodChange,
  heatmapPeriod,
  onHeatmapPeriodChange,
}: StatsSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">📊 특보 발생 통계</h2>
        <button onClick={onToggle} aria-expanded={showStats} className="text-sm text-blue-600 hover:underline">
          {showStats ? '통계 숨기기' : '통계 보기'}
        </button>
      </div>

      {showStats ? (
        <>
          {/* 탭 네비게이션 */}
          <div role="tablist" aria-label="통계 유형 선택" className="flex flex-wrap gap-2 sm:gap-4 mb-4 border-b">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={statsTab === tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors text-sm sm:text-base ${
                  statsTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 기간 선택 */}
          {statsTab === 'basic' && (
            <PeriodButtons
              options={[
                { value: '7d' as const, label: '최근 7일' },
                { value: '30d' as const, label: '최근 30일' },
              ]}
              value={statsPeriod}
              onChange={onStatsPeriodChange}
            />
          )}
          {statsTab === 'advanced' && (
            <PeriodButtons
              options={[
                { value: '6m' as const, label: '최근 6개월' },
                { value: '1y' as const, label: '최근 1년' },
                { value: '2y' as const, label: '최근 2년' },
              ]}
              value={advancedPeriod}
              onChange={onAdvancedPeriodChange}
            />
          )}
          {statsTab === 'heatmap' && (
            <PeriodButtons
              options={[
                { value: '6m' as const, label: '최근 6개월' },
                { value: '1y' as const, label: '최근 1년' },
                { value: '2y' as const, label: '최근 2년' },
              ]}
              value={heatmapPeriod}
              onChange={onHeatmapPeriodChange}
            />
          )}

          {/* 차트 렌더링 */}
          {statsTab === 'basic' && <ChartView period={statsPeriod} />}
          {statsTab === 'advanced' && <AdvancedChartView period={advancedPeriod} />}
          {statsTab === 'heatmap' && <HeatmapView period={heatmapPeriod} />}
        </>
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">
          통계를 보려면 &apos;통계 보기&apos;를 클릭하세요
        </p>
      )}
    </div>
  );
}
