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
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',  // 파란색
          'rgba(16, 185, 129, 0.8)',  // 초록색
          'rgba(245, 158, 11, 0.8)',  // 노란색
          'rgba(239, 68, 68, 0.8)',   // 빨간색
          'rgba(168, 85, 247, 0.8)',  // 보라색
          'rgba(236, 72, 153, 0.8)',  // 분홍색
          'rgba(14, 165, 233, 0.8)',  // 하늘색
          'rgba(34, 197, 94, 0.8)',   // 연두색
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(236, 72, 153, 1)',
          'rgba(14, 165, 233, 1)',
          'rgba(34, 197, 94, 1)',
        ],
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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">통계 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 특보 종류별 통계 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">📊 특보 종류별 발생 현황</h3>
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
      </div>

      {/* 특보 수준별 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">⚠️ 특보 수준별 분포</h3>
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
        </div>

        {/* 통계 요약 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">📈 통계 요약</h3>
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
        </div>
      </div>

      {/* 지역별 통계 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">📍 지역별 발생 현황 (Top 10)</h3>
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
      </div>
    </div>
  );
}
