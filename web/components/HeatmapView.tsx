'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { Chart } from 'react-chartjs-2';
import { getAlertHistory, type AlertHistory } from '@/lib/api';
import { WARNING_TYPE_NAMES } from '@/types/alert';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorAlert from '@/components/common/ErrorAlert';
import Card from '@/components/common/Card';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  MatrixController,
  MatrixElement
);

interface HeatmapViewProps {
  period?: '6m' | '1y' | '2y';
}

interface HeatmapDataPoint {
  x: string;
  y: string;
  v: number;
}

export default function HeatmapView({ period = '1y' }: HeatmapViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regionTimeData, setRegionTimeData] = useState<HeatmapDataPoint[]>([]);
  const [monthRegionData, setMonthRegionData] = useState<HeatmapDataPoint[]>([]);
  const [warningTypeRegionData, setWarningTypeRegionData] = useState<HeatmapDataPoint[]>([]);

  const [timeLabels, setTimeLabels] = useState<string[]>([]);
  const [monthLabels, setMonthLabels] = useState<string[]>([]);
  const [regionLabels, setRegionLabels] = useState<string[]>([]);
  const [warningTypeLabels, setWarningTypeLabels] = useState<string[]>([]);

  useEffect(() => {
    loadHeatmapData();
  }, [period]);

  const loadHeatmapData = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();

      // 기간 설정
      switch (period) {
        case '6m':
          startDate.setMonth(startDate.getMonth() - 5);
          break;
        case '1y':
          startDate.setMonth(startDate.getMonth() - 11);
          break;
        case '2y':
          startDate.setMonth(startDate.getMonth() - 23);
          break;
      }

      // alert_histories에서 NEW 타입만 조회
      const response = await getAlertHistory({
        startDate,
        endDate,
        changeType: 'NEW',
      });

      if (!response.success || !response.data) {
        setError('히트맵 데이터를 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      const histories: AlertHistory[] = response.data;

      // === 1. 지역별 × 시간대별 히트맵 ===
      const regionTimeMap = new Map<string, Map<string, number>>();
      const regionsSet = new Set<string>();
      const timeBands = ['00-06', '06-12', '12-18', '18-24'];

      histories.forEach(history => {
        const date = new Date(history.timestamp);
        const hour = date.getHours();
        const timeBand = hour < 6 ? '00-06' : hour < 12 ? '06-12' : hour < 18 ? '12-18' : '18-24';
        const regionName = history.upperRegion || history.regionName;

        regionsSet.add(regionName);

        if (!regionTimeMap.has(regionName)) {
          regionTimeMap.set(regionName, new Map());
        }
        const timeMap = regionTimeMap.get(regionName)!;
        timeMap.set(timeBand, (timeMap.get(timeBand) || 0) + 1);
      });

      const sortedRegions = Array.from(regionsSet).sort();
      const regionTimeHeatmap: HeatmapDataPoint[] = [];

      sortedRegions.forEach(region => {
        const timeMap = regionTimeMap.get(region) || new Map();
        timeBands.forEach(timeBand => {
          regionTimeHeatmap.push({
            x: timeBand,
            y: region,
            v: timeMap.get(timeBand) || 0,
          });
        });
      });

      setRegionTimeData(regionTimeHeatmap);
      setRegionLabels(sortedRegions);
      setTimeLabels(timeBands);

      // === 2. 날짜별 × 지역별 히트맵 ===
      const monthRegionMap = new Map<string, Map<string, number>>();
      const monthsSet = new Set<string>();

      // 기간 내 모든 월 생성
      const allMonths: string[] = [];
      const current = new Date(startDate);
      current.setDate(1);
      const end = new Date(endDate);
      end.setDate(1);

      while (current <= end) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        allMonths.push(monthKey);
        monthsSet.add(monthKey);
        current.setMonth(current.getMonth() + 1);
      }

      histories.forEach(history => {
        const date = new Date(history.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const regionName = history.upperRegion || history.regionName;

        if (!monthRegionMap.has(monthKey)) {
          monthRegionMap.set(monthKey, new Map());
        }
        const regionMap = monthRegionMap.get(monthKey)!;
        regionMap.set(regionName, (regionMap.get(regionName) || 0) + 1);
      });

      const monthRegionHeatmap: HeatmapDataPoint[] = [];

      allMonths.forEach(month => {
        const regionMap = monthRegionMap.get(month) || new Map();
        sortedRegions.forEach(region => {
          monthRegionHeatmap.push({
            x: month,
            y: region,
            v: regionMap.get(region) || 0,
          });
        });
      });

      setMonthRegionData(monthRegionHeatmap);
      setMonthLabels(allMonths);

      // === 3. 특보 종류별 × 지역별 히트맵 ===
      const warningTypeRegionMap = new Map<string, Map<string, number>>();
      const warningTypesSet = new Set<string>();

      histories.forEach(history => {
        const warningType = history.warningType;
        const regionName = history.upperRegion || history.regionName;

        warningTypesSet.add(warningType);

        if (!warningTypeRegionMap.has(warningType)) {
          warningTypeRegionMap.set(warningType, new Map());
        }
        const regionMap = warningTypeRegionMap.get(warningType)!;
        regionMap.set(regionName, (regionMap.get(regionName) || 0) + 1);
      });

      const sortedWarningTypes = Array.from(warningTypesSet).sort();
      const warningTypeRegionHeatmap: HeatmapDataPoint[] = [];

      sortedWarningTypes.forEach(warningType => {
        const regionMap = warningTypeRegionMap.get(warningType) || new Map();
        sortedRegions.forEach(region => {
          warningTypeRegionHeatmap.push({
            x: region,
            y: WARNING_TYPE_NAMES[warningType] || warningType,
            v: regionMap.get(region) || 0,
          });
        });
      });

      setWarningTypeRegionData(warningTypeRegionHeatmap);
      setWarningTypeLabels(sortedWarningTypes.map(t => WARNING_TYPE_NAMES[t] || t));

      setLoading(false);
    } catch (err) {
      console.error('Error loading heatmap data:', err);
      setError('히트맵 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 히트맵 색상 함수
  const getHeatmapColor = (value: number, max: number) => {
    if (value === 0) return 'rgba(229, 231, 235, 0.3)'; // 회색
    const ratio = value / max;
    if (ratio < 0.25) return 'rgba(34, 197, 94, 0.6)';   // 초록
    if (ratio < 0.5) return 'rgba(245, 158, 11, 0.6)';   // 노랑
    if (ratio < 0.75) return 'rgba(249, 115, 22, 0.8)';  // 주황
    return 'rgba(239, 68, 68, 0.9)';                      // 빨강
  };

  // === 1. 지역별 × 시간대별 히트맵 차트 ===
  const maxRegionTime = Math.max(...regionTimeData.map(d => d.v), 1);
  const regionTimeChartData = {
    datasets: [{
      label: '특보 발생 건수',
      data: regionTimeData,
      backgroundColor: (ctx: any) => {
        const value = ctx.dataset.data[ctx.dataIndex]?.v || 0;
        return getHeatmapColor(value, maxRegionTime);
      },
      borderColor: 'rgba(255, 255, 255, 0.5)',
      borderWidth: 1,
      width: ({ chart }: any) => (chart.chartArea || {}).width / Math.max(timeLabels.length, 1) - 1,
      height: ({ chart }: any) => (chart.chartArea || {}).height / Math.max(regionLabels.length, 1) - 1,
    }],
  };

  // === 2. 날짜별 × 지역별 히트맵 차트 ===
  const maxMonthRegion = Math.max(...monthRegionData.map(d => d.v), 1);
  const monthRegionChartData = {
    datasets: [{
      label: '특보 발생 건수',
      data: monthRegionData,
      backgroundColor: (ctx: any) => {
        const value = ctx.dataset.data[ctx.dataIndex]?.v || 0;
        return getHeatmapColor(value, maxMonthRegion);
      },
      borderColor: 'rgba(255, 255, 255, 0.5)',
      borderWidth: 1,
      width: ({ chart }: any) => (chart.chartArea || {}).width / Math.max(monthLabels.length, 1) - 1,
      height: ({ chart }: any) => (chart.chartArea || {}).height / Math.max(regionLabels.length, 1) - 1,
    }],
  };

  // === 3. 특보 종류별 × 지역별 히트맵 차트 ===
  const maxWarningTypeRegion = Math.max(...warningTypeRegionData.map(d => d.v), 1);
  const warningTypeRegionChartData = {
    datasets: [{
      label: '특보 발생 건수',
      data: warningTypeRegionData,
      backgroundColor: (ctx: any) => {
        const value = ctx.dataset.data[ctx.dataIndex]?.v || 0;
        return getHeatmapColor(value, maxWarningTypeRegion);
      },
      borderColor: 'rgba(255, 255, 255, 0.5)',
      borderWidth: 1,
      width: ({ chart }: any) => (chart.chartArea || {}).width / Math.max(regionLabels.length, 1) - 1,
      height: ({ chart }: any) => (chart.chartArea || {}).height / Math.max(warningTypeLabels.length, 1) - 1,
    }],
  };

  const heatmapOptions = (xLabels: string[], yLabels: string[], title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: title,
      },
      tooltip: {
        callbacks: {
          title: () => '',
          label: (context: any) => {
            const dataPoint = context.raw;
            return `${dataPoint.y} × ${dataPoint.x}: ${dataPoint.v}건`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'category' as const,
        labels: xLabels,
        offset: true,
        ticks: {
          autoSkip: false,
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          display: false,
        },
      },
      y: {
        type: 'category' as const,
        labels: yLabels,
        offset: true,
        ticks: {
          autoSkip: false,
        },
        grid: {
          display: false,
        },
      },
    },
  });

  if (loading) {
    return <LoadingSpinner message="히트맵 데이터 로딩 중..." />;
  }

  if (error) {
    return <ErrorAlert message={error} />;
  }

  return (
    <div className="space-y-6">
      {/* 지역별 × 시간대별 히트맵 */}
      <Card title="🕐 지역별 × 시간대별 특보 발생 히트맵">
        <div className="h-[400px]">
          <Chart
            type="matrix"
            data={regionTimeChartData}
            options={heatmapOptions(timeLabels, regionLabels, '시간대별 지역 특보 발생 분포')}
          />
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(229, 231, 235, 0.3)' }}></div>
            없음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}></div>
            낮음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.6)' }}></div>
            보통
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.8)' }}></div>
            높음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)' }}></div>
            매우 높음
          </span>
        </div>
      </Card>

      {/* 날짜별 × 지역별 히트맵 */}
      <Card title="📅 월별 × 지역별 특보 발생 히트맵">
        <div className="h-[400px] overflow-x-auto">
          <div style={{ minWidth: `${Math.max(800, monthLabels.length * 50)}px`, height: '400px' }}>
            <Chart
              type="matrix"
              data={monthRegionChartData}
              options={heatmapOptions(
                monthLabels.map(m => {
                  const [year, month] = m.split('-');
                  return `${year.slice(2)}년 ${month}월`;
                }),
                regionLabels,
                '월별 지역 특보 발생 분포'
              )}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(229, 231, 235, 0.3)' }}></div>
            없음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}></div>
            낮음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.6)' }}></div>
            보통
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.8)' }}></div>
            높음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)' }}></div>
            매우 높음
          </span>
        </div>
      </Card>

      {/* 특보 종류별 × 지역별 히트맵 */}
      <Card title="⚠️ 특보 종류별 × 지역별 발생 히트맵">
        <div className="h-[350px] overflow-x-auto">
          <div style={{ minWidth: `${Math.max(800, regionLabels.length * 60)}px`, height: '350px' }}>
            <Chart
              type="matrix"
              data={warningTypeRegionChartData}
              options={heatmapOptions(regionLabels, warningTypeLabels, '특보 종류별 지역 발생 분포')}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(229, 231, 235, 0.3)' }}></div>
            없음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}></div>
            낮음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.6)' }}></div>
            보통
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.8)' }}></div>
            높음
          </span>
          <span className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)' }}></div>
            매우 높음
          </span>
        </div>
      </Card>
    </div>
  );
}
