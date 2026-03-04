'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { getAlertStatistics, type AlertStatistics } from '@/lib/api';
import { WARNING_TYPE_NAMES, WARNING_LEVEL_NAMES } from '@/types/alert';
import { chartPalette } from '@/styles/tokens';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorAlert from '@/components/common/ErrorAlert';
import Card from '@/components/common/Card';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface ChartViewProps {
  period?: '7d' | '30d';
}

export default function ChartView({ period = '7d' }: ChartViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [byWarningType, setByWarningType] = useState<AlertStatistics[]>([]);
  const [byLevel, setByLevel] = useState<AlertStatistics[]>([]);
  const [byRegion, setByRegion] = useState<AlertStatistics[]>([]);

  useEffect(() => {
    loadStatistics();
  }, [period]);

  const loadStatistics = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (period === '7d' ? 7 : 30));

      // 세 가지 통계를 병렬로 로드
      const [typeRes, levelRes, regionRes] = await Promise.all([
        getAlertStatistics({ startDate, endDate, groupBy: 'warningType' }),
        getAlertStatistics({ startDate, endDate, groupBy: 'level' }),
        getAlertStatistics({ startDate, endDate, groupBy: 'region' }),
      ]);

      if (!typeRes.success || !levelRes.success || !regionRes.success) {
        setError('통계 데이터를 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      setByWarningType(typeRes.data || []);
      setByLevel(levelRes.data || []);
      setByRegion(regionRes.data || []);
      setLoading(false);
    } catch (err) {
      setError('통계 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 특보 종류별 차트 데이터
  const warningTypeChartData = {
    labels: byWarningType.map(stat => WARNING_TYPE_NAMES[stat.group] || stat.group),
    datasets: [
      {
        label: '발생 건수',
        data: byWarningType.map(stat => stat.count),
        backgroundColor: chartPalette.backgrounds,
        borderColor: chartPalette.borders,
        borderWidth: 1,
      },
    ],
  };

  // 특보 수준별 차트 데이터
  const warningLevelChartData = {
    labels: byLevel.map(stat => WARNING_LEVEL_NAMES[stat.group] || stat.group),
    datasets: [
      {
        label: '발생 건수',
        data: byLevel.map(stat => stat.count),
        backgroundColor: [
          'rgba(234, 179, 8, 0.8)',   // 예비특보 - 노란색
          'rgba(249, 115, 22, 0.8)',  // 주의보 - 주황색
          'rgba(239, 68, 68, 0.8)',   // 경보 - 빨간색
        ],
        borderColor: [
          'rgba(234, 179, 8, 1)',
          'rgba(249, 115, 22, 1)',
          'rgba(239, 68, 68, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // 지역별 차트 데이터 (상위 10개)
  const topRegions = byRegion.slice(0, 10);
  const regionChartData = {
    labels: topRegions.map(stat => stat.group),
    datasets: [
      {
        label: '발생 건수',
        data: topRegions.map(stat => stat.count),
        backgroundColor: 'rgba(99, 102, 241, 0.8)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
      },
    ],
  };

  if (loading) {
    return <LoadingSpinner message="통계 로딩 중..." />;
  }

  if (error) {
    return <ErrorAlert message={error} />;
  }

  return (
    <div className="space-y-6">
      {/* 특보 종류별 통계 */}
      <Card title="📊 특보 종류별 발생 현황">
        <div className="h-[300px]">
          <Bar
            data={warningTypeChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                title: {
                  display: true,
                  text: `최근 ${period === '7d' ? '7일' : '30일'}간 특보 종류별 발생 건수`,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1,
                  },
                },
              },
            }}
          />
        </div>
      </Card>

      {/* 특보 수준별 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="⚠️ 특보 수준별 분포">
          <div className="h-[250px]">
            <Pie
              data={warningLevelChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
              }}
            />
          </div>
        </Card>

        {/* 통계 요약 */}
        <Card title="📈 통계 요약">
          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <p className="text-sm text-gray-600">총 발생 건수</p>
              <p className="text-2xl font-bold">
                {byWarningType.reduce((sum, stat) => sum + stat.count, 0)}건
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <p className="text-sm text-gray-600">가장 많은 특보 종류</p>
              <p className="text-lg font-semibold">
                {byWarningType.length > 0
                  ? WARNING_TYPE_NAMES[byWarningType[0].group] || byWarningType[0].group
                  : 'N/A'}
              </p>
            </div>
            <div className="border-l-4 border-orange-500 pl-4">
              <p className="text-sm text-gray-600">가장 많은 지역</p>
              <p className="text-lg font-semibold">
                {byRegion.length > 0 ? byRegion[0].group : 'N/A'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 지역별 통계 */}
      <Card title="📍 지역별 발생 현황 (Top 10)">
        <div className="h-[300px]">
          <Bar
            data={regionChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: 'y', // 가로 막대 그래프
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1,
                  },
                },
              },
            }}
          />
        </div>
      </Card>
    </div>
  );
}
