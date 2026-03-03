'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  getNotificationStats,
  getNotificationHealth,
  resetCircuitBreaker,
  type NotificationStatsResponse,
  type NotificationHealthResponse,
  type NotificationPlatformStats,
} from '@/lib/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

const CB_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  CLOSED: { bg: 'bg-green-100', text: 'text-green-800', label: '정상' },
  HALF_OPEN: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '반개방' },
  OPEN: { bg: 'bg-red-100', text: 'text-red-800', label: '차단' },
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function MonitoringContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<NotificationStatsResponse | null>(null);
  const [health, setHealth] = useState<NotificationHealthResponse | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        getNotificationStats(),
        getNotificationHealth(),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (healthRes.success && healthRes.data) {
        setHealth(healthRes.data);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleResetCB = async (platform: string) => {
    setResetting(platform);
    try {
      const res = await resetCircuitBreaker(platform);
      if (res.success) {
        await fetchData();
      }
    } finally {
      setResetting(null);
    }
  };

  // 시간대별 차트 데이터 (UTC → KST 변환)
  const buildHourlyChartData = () => {
    if (!stats?.platforms?.length) return null;

    const hourlyTotals = new Array(24).fill(0);
    const hourlySuccess = new Array(24).fill(0);

    for (const platform of stats.platforms) {
      for (const bucket of platform.hourlyStats) {
        const kstHour = (bucket.hour + 9) % 24;
        hourlyTotals[kstHour] += bucket.sent;
        hourlySuccess[kstHour] += bucket.success;
      }
    }

    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}시`);

    return {
      labels,
      datasets: [
        {
          label: '전송',
          data: hourlyTotals,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
        },
        {
          label: '성공',
          data: hourlySuccess,
          backgroundColor: 'rgba(34, 197, 94, 0.5)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 1,
        },
      ],
    };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">모니터링 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  const healthyCount = health
    ? Object.values(health).filter(h => h.connected).length
    : 0;

  const chartData = buildHourlyChartData();

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* 헤더 */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-sm text-blue-600 hover:underline mb-1 block">
              &larr; 홈으로
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              알림 모니터링
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              자동 새로고침 (30초)
            </label>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              새로고침
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 요약 카드 (3열) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500">전체 전송 수</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {stats?.summary?.totalSent?.toLocaleString() ?? 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              성공 {stats?.summary?.totalSuccess?.toLocaleString() ?? 0} / 실패 {stats?.summary?.totalFailure?.toLocaleString() ?? 0}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500">전체 성공률</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {formatRate(stats?.summary?.overallSuccessRate ?? 0)}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-sm text-gray-500">정상 플랫폼</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {healthyCount} / {stats?.summary?.totalPlatforms ?? 0}
            </p>
          </div>
        </div>

        {/* 플랫폼별 상태 카드 */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">플랫폼별 상태</h2>
        {stats?.platforms?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {stats.platforms.map((platform: NotificationPlatformStats) => {
              const cb = CB_COLORS[platform.circuitBreakerState] ?? CB_COLORS.CLOSED;
              const isConnected = health?.[platform.platform]?.connected ?? false;

              return (
                <div
                  key={platform.platform}
                  className="bg-white rounded-lg border border-gray-200 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 capitalize">
                      {platform.platform}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cb.bg} ${cb.text}`}>
                      {cb.label}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">성공률</span>
                      <span className="font-medium">{formatRate(platform.successRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">전송 수</span>
                      <span className="font-medium">
                        {platform.totalSent.toLocaleString()}
                        <span className="text-gray-400 ml-1">
                          ({platform.successCount} / {platform.failureCount})
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">평균 응답시간</span>
                      <span className="font-medium">{formatMs(platform.averageResponseTimeMs)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">연결 상태</span>
                      <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                        {isConnected ? '연결됨' : '연결 끊김'}
                      </span>
                    </div>
                  </div>

                  {platform.circuitBreakerState === 'OPEN' && (
                    <button
                      onClick={() => handleResetCB(platform.platform)}
                      disabled={resetting === platform.platform}
                      className="mt-3 w-full text-sm px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      {resetting === platform.platform ? '리셋 중...' : 'Circuit Breaker 리셋'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 mb-8">
            등록된 알림 플랫폼이 없습니다
          </div>
        )}

        {/* 시간대별 차트 */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">시간대별 전송 현황 (KST)</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-8">
          {chartData ? (
            <Bar
              data={chartData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'top' },
                  title: { display: false },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                  },
                },
              }}
            />
          ) : (
            <p className="text-center text-gray-500 py-12">
              전송 데이터가 없습니다
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
