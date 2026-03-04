'use client';

interface DashboardHeaderProps {
  lastUpdated: Date | null;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
  notificationEnabled: boolean;
  onNotificationChange: (v: boolean) => void;
  realtimeEnabled: boolean;
  onRealtimeChange: (v: boolean) => void;
  isConnected: boolean;
  wsError: string | null;
  onRefresh: () => void;
}

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function DashboardHeader({
  lastUpdated,
  autoRefresh,
  onAutoRefreshChange,
  notificationEnabled,
  onNotificationChange,
  realtimeEnabled,
  onRealtimeChange,
  isConnected,
  wsError,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-slate-800">📊 기상특보 현황</h1>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 새로고침
        </button>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500">
          마지막 업데이트: {formatDateTime(lastUpdated.toISOString())} ({getRelativeTime(lastUpdated)})
        </p>
      )}

      <div className="mt-4 space-y-2">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => onAutoRefreshChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="ml-2 text-sm">자동 새로고침 (5분 간격)</span>
        </label>

        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={notificationEnabled}
            onChange={(e) => onNotificationChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="ml-2 text-sm">🔔 브라우저 알림 (새로운 특보 발생 시)</span>
        </label>

        <div className="flex items-center gap-2">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={realtimeEnabled}
              onChange={(e) => onRealtimeChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm">⚡ 실시간 업데이트 (WebSocket)</span>
          </label>
          {realtimeEnabled && (
            <span className={`text-xs px-2 py-0.5 rounded ${isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {isConnected ? '연결됨' : '연결 중...'}
            </span>
          )}
        </div>

        {wsError && realtimeEnabled && (
          <p className="text-xs text-red-600 ml-6">
            * WebSocket 서버에 연결할 수 없습니다. 폴링 모드로 동작합니다.
          </p>
        )}
      </div>
    </div>
  );
}
