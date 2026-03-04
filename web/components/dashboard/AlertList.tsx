'use client';

import {
  WARNING_TYPE_NAMES,
  WARNING_LEVEL_NAMES,
  WARNING_TYPE_EMOJI,
  WARNING_LEVEL_COLORS,
} from '@/types/alert';
import type { WeatherAlert } from '@/types/alert';

interface AlertListProps {
  alerts: WeatherAlert[];
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

export default function AlertList({ alerts }: AlertListProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">현재 발효 중인 특보 ({alerts.length}개)</h2>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-6xl mb-4">🌤️</div>
          <p className="text-xl text-gray-600 mb-2">발효 중인 특보가 없습니다</p>
          <p className="text-sm text-gray-500">현재 선택한 필터에 해당하는 특보가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border-2 rounded-lg p-6 ${WARNING_LEVEL_COLORS[alert.warningLevel] || 'bg-gray-100 border-gray-300'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{WARNING_TYPE_EMOJI[alert.warningType] || '⚠️'}</span>
                    <div>
                      <h3 className="text-xl font-bold">{alert.regionName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-semibold">
                          {WARNING_TYPE_NAMES[alert.warningType] || alert.warningType}
                        </span>
                        <span className="px-2 py-1 rounded text-sm font-bold">
                          {WARNING_LEVEL_NAMES[alert.warningLevel] || alert.warningLevel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">발표 시각:</span>
                      <span>{formatDateTime(alert.announcedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">발효 시각:</span>
                      <span>{formatDateTime(alert.effectiveAt)}</span>
                    </div>
                    {alert.endTime && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">종료 시각:</span>
                        <span>{formatDateTime(alert.endTime)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
