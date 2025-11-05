import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WeatherAlert } from '@/types/alert';

interface UseWebSocketOptions {
  enabled?: boolean;
  url?: string;
  onNewAlert?: (alert: WeatherAlert) => void;
  onAlertRemoved?: (alertId: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

/**
 * WebSocket 연결을 관리하는 Hook
 *
 * 향후 백엔드에서 Socket.io 서버 구현 시 사용
 * 현재는 연결 구조만 준비된 상태
 */
export function useWebSocket({
  enabled = false,
  url,
  onNewAlert,
  onAlertRemoved,
  onConnect,
  onDisconnect,
  onError,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const socketUrl = url || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!enabled) {
      // WebSocket 비활성화 시 연결 종료
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setError(null);
      return;
    }

    // Socket.io 클라이언트 생성
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // 연결 이벤트
    socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      setError(null);
      onConnect?.();
    });

    // 연결 해제 이벤트
    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
      onDisconnect?.();
    });

    // 에러 이벤트
    socket.on('connect_error', (err) => {
      console.error('[WebSocket] Connection error:', err);
      setError(err.message);
      onError?.(err);
    });

    // 새로운 특보 이벤트
    socket.on('alert:new', (alert: WeatherAlert) => {
      console.log('[WebSocket] New alert:', alert);
      onNewAlert?.(alert);
    });

    // 특보 해제 이벤트
    socket.on('alert:removed', (alertId: string) => {
      console.log('[WebSocket] Alert removed:', alertId);
      onAlertRemoved?.(alertId);
    });

    // 특보 업데이트 이벤트
    socket.on('alert:updated', (alert: WeatherAlert) => {
      console.log('[WebSocket] Alert updated:', alert);
      // 업데이트는 새로운 특보로 처리
      onNewAlert?.(alert);
    });

    // Cleanup
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [enabled, socketUrl, onNewAlert, onAlertRemoved, onConnect, onDisconnect, onError]);

  const reconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  };

  return {
    isConnected,
    error,
    reconnect,
  };
}
