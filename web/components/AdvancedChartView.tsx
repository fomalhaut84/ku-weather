'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { getAlertHistory, type AlertHistory } from '@/lib/api';
import { WARNING_TYPE_NAMES } from '@/types/alert';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AdvancedChartViewProps {
  period?: '6m' | '1y' | '2y';
}

interface MonthlyData {
  month: string;
  count: number;
}

interface SeasonalData {
  season: string;
  count: number;
}

interface YearlyData {
  year: string;
  count: number;
}

export default function AdvancedChartView({ period = '1y' }: AdvancedChartViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [seasonalData, setSeasonalData] = useState<SeasonalData[]>([]);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [byWarningTypeMonthly, setByWarningTypeMonthly] = useState<Record<string, MonthlyData[]>>({});

  useEffect(() => {
    loadAdvancedStatistics();
  }, [period]);

  const loadAdvancedStatistics = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();

      // 기간 설정 (현재 달 포함 N개월)
      switch (period) {
        case '6m':
          startDate.setMonth(startDate.getMonth() - 5); // 6개월 = 현재 + 5개월 전
          break;
        case '1y':
          startDate.setMonth(startDate.getMonth() - 11); // 12개월 = 현재 + 11개월 전
          break;
        case '2y':
          startDate.setMonth(startDate.getMonth() - 23); // 24개월 = 현재 + 23개월 전
          break;
      }

      // alert_histories에서 NEW 타입만 조회 (신규 발표만 카운트)
      const response = await getAlertHistory({
        startDate,
        endDate,
        changeType: 'NEW',
      });

      if (!response.success || !response.data) {
        setError('통계 데이터를 불러올 수 없습니다.');
        setLoading(false);
        return;
      }

      const histories: AlertHistory[] = response.data;

      // 기간 내 모든 월 생성 (0으로 초기화)
      const allMonths: string[] = [];
      const current = new Date(startDate);
      current.setDate(1); // 매월 1일로 설정
      const end = new Date(endDate);
      end.setDate(1);

      while (current <= end) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        allMonths.push(monthKey);
        current.setMonth(current.getMonth() + 1);
      }

      // 월별 집계 (모든 월을 0으로 초기화)
      const monthlyMap = new Map<string, number>();
      allMonths.forEach(month => monthlyMap.set(month, 0));

      const seasonalMap = new Map<string, number>();
      const yearlyMap = new Map<string, number>();
      const warningTypeMonthlyMap = new Map<string, Map<string, number>>();

      histories.forEach(history => {
        const date = new Date(history.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const yearKey = String(date.getFullYear());
        const seasonKey = getSeason(date.getMonth());

        // 월별 카운트
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);

        // 계절별 카운트
        seasonalMap.set(seasonKey, (seasonalMap.get(seasonKey) || 0) + 1);

        // 연도별 카운트
        yearlyMap.set(yearKey, (yearlyMap.get(yearKey) || 0) + 1);

        // 특보 종류별 월별 카운트
        const warningType = history.warningType;
        if (!warningTypeMonthlyMap.has(warningType)) {
          warningTypeMonthlyMap.set(warningType, new Map<string, number>());
          // 모든 월을 0으로 초기화
          allMonths.forEach(month => warningTypeMonthlyMap.get(warningType)!.set(month, 0));
        }
        const typeMonthlyMap = warningTypeMonthlyMap.get(warningType)!;
        typeMonthlyMap.set(monthKey, (typeMonthlyMap.get(monthKey) || 0) + 1);
      });

      // 월별 데이터 (모든 월 포함, 정렬됨)
      const monthly = allMonths.map(month => ({
        month,
        count: monthlyMap.get(month) || 0,
      }));

      setMonthlyData(monthly);

      // 계절별 데이터 (봄, 여름, 가을, 겨울 순서)
      const seasonOrder = ['봄', '여름', '가을', '겨울'];
      const seasonal = seasonOrder.map(season => ({
        season,
        count: seasonalMap.get(season) || 0,
      }));

      setSeasonalData(seasonal);

      // 연도별 데이터 정렬
      const yearly = Array.from(yearlyMap.entries())
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year.localeCompare(b.year));

      setYearlyData(yearly);

      // 특보 종류별 월별 데이터
      const warningTypeMonthly: Record<string, MonthlyData[]> = {};
      warningTypeMonthlyMap.forEach((monthlyMap, warningType) => {
        warningTypeMonthly[warningType] = Array.from(monthlyMap.entries())
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month));
      });

      setByWarningTypeMonthly(warningTypeMonthly);
      setLoading(false);
    } catch (err) {
      console.error('Error loading advanced statistics:', err);
      setError('통계 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 계절 계산 (3-5월: 봄, 6-8월: 여름, 9-11월: 가을, 12-2월: 겨울)
  const getSeason = (month: number): string => {
    if (month >= 2 && month <= 4) return '봄';
    if (month >= 5 && month <= 7) return '여름';
    if (month >= 8 && month <= 10) return '가을';
    return '겨울';
  };

  // 월별 추이 차트 데이터
  const monthlyChartData = {
    labels: monthlyData.map(d => {
      const [year, month] = d.month.split('-');
      return `${year}년 ${month}월`;
    }),
    datasets: [
      {
        label: '특보 발생 건수',
        data: monthlyData.map(d => d.count),
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  // 계절별 비교 차트 데이터
  const seasonalChartData = {
    labels: seasonalData.map(d => d.season),
    datasets: [
      {
        label: '특보 발생 건수',
        data: seasonalData.map(d => d.count),
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',  // 봄 - 초록색
          'rgba(239, 68, 68, 0.8)',   // 여름 - 빨간색
          'rgba(245, 158, 11, 0.8)',  // 가을 - 노란색
          'rgba(59, 130, 246, 0.8)',  // 겨울 - 파란색
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(245, 158, 11, 1)',
          'rgba(59, 130, 246, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // 연도별 비교 차트 데이터 (Stacked Area)
  const yearlyChartData = {
    labels: yearlyData.map(d => `${d.year}년`),
    datasets: [
      {
        label: '특보 발생 건수',
        data: yearlyData.map(d => d.count),
        borderColor: 'rgba(168, 85, 247, 1)',
        backgroundColor: 'rgba(168, 85, 247, 0.3)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  // 특보 종류별 월별 추이 (Multi-line Chart)
  const warningTypeColors = [
    'rgba(239, 68, 68, 1)',    // 빨간색
    'rgba(245, 158, 11, 1)',   // 주황색
    'rgba(59, 130, 246, 1)',   // 파란색
    'rgba(16, 185, 129, 1)',   // 초록색
    'rgba(168, 85, 247, 1)',   // 보라색
    'rgba(236, 72, 153, 1)',   // 분홍색
    'rgba(14, 165, 233, 1)',   // 하늘색
    'rgba(34, 197, 94, 1)',    // 연두색
  ];

  const allMonths = Array.from(new Set(monthlyData.map(d => d.month))).sort();
  const warningTypeMultiLineData = {
    labels: allMonths.map(month => {
      const [year, m] = month.split('-');
      return `${year}년 ${m}월`;
    }),
    datasets: Object.entries(byWarningTypeMonthly).map(([warningType, data], index) => {
      const dataMap = new Map(data.map(d => [d.month, d.count]));
      return {
        label: WARNING_TYPE_NAMES[warningType] || warningType,
        data: allMonths.map(month => dataMap.get(month) || 0),
        borderColor: warningTypeColors[index % warningTypeColors.length],
        backgroundColor: warningTypeColors[index % warningTypeColors.length].replace('1)', '0.1)'),
        fill: false,
        tension: 0.4,
      };
    }),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">고급 통계 로딩 중...</p>
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
      {/* 월별 특보 발생 추이 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">📅 월별 특보 발생 추이</h3>
        <div className="h-[350px]">
          <Line
            data={monthlyChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                title: {
                  display: true,
                  text: `최근 ${period === '6m' ? '6개월' : period === '1y' ? '1년' : '2년'}간 월별 특보 발생 추이`,
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

      {/* 계절별 비교 & 연도별 비교 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 계절별 비교 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">🍂 계절별 특보 발생 비교</h3>
          <div className="h-[300px]">
            <Bar
              data={seasonalChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
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

        {/* 연도별 비교 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">📈 연도별 특보 발생 비교</h3>
          <div className="h-[300px]">
            <Line
              data={yearlyChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
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
      </div>

      {/* 특보 종류별 월별 추이 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">🌦️ 특보 종류별 월별 발생 추이</h3>
        <div className="h-[400px]">
          <Line
            data={warningTypeMultiLineData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: {
                    boxWidth: 12,
                    padding: 10,
                  },
                },
                title: {
                  display: true,
                  text: '특보 종류별 월별 추이 (Multi-line)',
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

      {/* 통계 요약 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">📊 기간별 통계 요약</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-l-4 border-blue-500 pl-4">
            <p className="text-sm text-gray-600">총 특보 발생 건수</p>
            <p className="text-2xl font-bold">
              {monthlyData.reduce((sum, d) => sum + d.count, 0)}건
            </p>
          </div>
          <div className="border-l-4 border-green-500 pl-4">
            <p className="text-sm text-gray-600">월 평균 발생 건수</p>
            <p className="text-2xl font-bold">
              {monthlyData.length > 0
                ? Math.round(monthlyData.reduce((sum, d) => sum + d.count, 0) / monthlyData.length)
                : 0}건
            </p>
          </div>
          <div className="border-l-4 border-orange-500 pl-4">
            <p className="text-sm text-gray-600">가장 많은 계절</p>
            <p className="text-lg font-semibold">
              {seasonalData.length > 0
                ? seasonalData.reduce((max, d) => (d.count > max.count ? d : max)).season
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
