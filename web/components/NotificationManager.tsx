'use client';

import { useEffect, useRef, useState } from 'react';
import { getCurrentAlerts } from '@/lib/api';
import { WARNING_TYPE_NAMES, WARNING_LEVEL_NAMES } from '@/types/alert';
import type { WeatherAlert } from '@/types/alert';

interface NotificationManagerProps {
  enabled?: boolean;
  checkInterval?: number; // 밀리초 단위
}

export default function NotificationManager({
  enabled = false,
  checkInterval = 60000, // 기본 1분
}: NotificationManagerProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const lastAlertsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // 브라우저 알림 지원 확인
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  // 알림 권한 요청
  const requestPermission = async () => {
    if (!isSupported) {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        // 테스트 알림
        new Notification('기상특보 알림 활성화', {
          body: '새로운 특보 발생 시 알림을 받게 됩니다.',
          icon: '/favicon.ico',
        });
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    }
  };

  // 새로운 특보 확인
  const checkForNewAlerts = async () => {
    try {
      const response = await getCurrentAlerts();
      if (!response.success || !response.data) return;

      const currentAlerts = response.data;
      const currentAlertIds = new Set(currentAlerts.map(a => a.id));

      // 새로운 특보 감지 (이전에 없었던 ID)
      const newAlerts = currentAlerts.filter(
        alert => !lastAlertsRef.current.has(alert.id)
      );

      // 새로운 특보가 있으면 알림 표시 (초기 로드가 아닌 경우에만)
      if (newAlerts.length > 0 && !isInitialLoadRef.current) {
        showNotifications(newAlerts);
      }

      // 현재 특보 ID 저장
      lastAlertsRef.current = currentAlertIds;

      // 첫 체크 완료 후 초기 로드 플래그 해제
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      console.error('Failed to check for new alerts:', error);
    }
  };

  // 알림 표시
  const showNotifications = (alerts: WeatherAlert[]) => {
    if (permission !== 'granted') return;

    alerts.forEach((alert) => {
      const title = `${WARNING_TYPE_NAMES[alert.warningType] || alert.warningType} ${WARNING_LEVEL_NAMES[alert.warningLevel] || alert.warningLevel}`;
      const body = `${alert.regionName}에 특보가 발표되었습니다.`;

      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: alert.id, // 중복 방지
        requireInteraction: false,
      });

      // 알림 클릭 시 대시보드로 이동
      notification.onclick = () => {
        window.focus();
        window.location.href = `/dashboard?region=${encodeURIComponent(alert.upperRegion || '')}`;
        notification.close();
      };

      // 10초 후 자동 닫기
      setTimeout(() => notification.close(), 10000);
    });
  };

  // 폴링 시작/중지
  useEffect(() => {
    if (!enabled || permission !== 'granted') {
      // 폴링 중지
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 알림 활성화 시 초기 로드 플래그 리셋
    isInitialLoadRef.current = true;

    // 초기 체크
    checkForNewAlerts();

    // 주기적 체크
    intervalRef.current = setInterval(checkForNewAlerts, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, permission, checkInterval]);

  // UI가 필요한 경우에만 렌더링
  if (!isSupported) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {permission === 'default' && enabled && (
        <button
          onClick={requestPermission}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          🔔 브라우저 알림 활성화
        </button>
      )}

      {permission === 'denied' && enabled && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg shadow-lg text-sm max-w-xs">
          <p className="font-semibold mb-1">알림 권한이 거부되었습니다</p>
          <p className="text-xs">
            브라우저 설정에서 알림 권한을 허용해주세요.
          </p>
        </div>
      )}
    </div>
  );
}
