import { NotificationStats } from '../../../services/notifications/NotificationStats';
import { CircuitState } from '../../../services/notifications/CircuitBreaker';

describe('NotificationStats', () => {
  let stats: NotificationStats;

  beforeEach(() => {
    stats = new NotificationStats();
  });

  describe('recordResult', () => {
    it('성공 결과를 기록', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });

      const result = stats.getStats('slack');
      expect(result).toBeDefined();
      expect(result!.totalSent).toBe(1);
      expect(result!.successCount).toBe(1);
      expect(result!.failureCount).toBe(0);
    });

    it('실패 결과를 기록', () => {
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 50 });

      const result = stats.getStats('slack');
      expect(result!.totalSent).toBe(1);
      expect(result!.successCount).toBe(0);
      expect(result!.failureCount).toBe(1);
    });

    it('여러 플랫폼 결과를 독립적으로 기록', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'telegram', success: false, responseTimeMs: 200 });

      const slack = stats.getStats('slack');
      const telegram = stats.getStats('telegram');
      expect(slack!.successCount).toBe(1);
      expect(telegram!.failureCount).toBe(1);
    });
  });

  describe('성공률 계산', () => {
    it('모든 성공 시 성공률 1.0', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 150 });

      expect(stats.getStats('slack')!.successRate).toBe(1.0);
    });

    it('모든 실패 시 성공률 0', () => {
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 150 });

      expect(stats.getStats('slack')!.successRate).toBe(0);
    });

    it('혼합 결과 시 정확한 비율', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 100 });

      expect(stats.getStats('slack')!.successRate).toBeCloseTo(2 / 3);
    });

    it('데이터 없는 플랫폼은 undefined', () => {
      expect(stats.getStats('unknown')).toBeUndefined();
    });
  });

  describe('평균 응답시간', () => {
    it('단일 결과의 평균 응답시간', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 200 });

      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(200);
    });

    it('다중 결과의 평균 응답시간', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 300 });

      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(200);
    });

    it('성공/실패 모두 응답시간에 포함', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 500 });

      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(300);
    });
  });

  describe('마지막 성공/실패 시각', () => {
    it('성공 시 lastSuccessAt 업데이트', () => {
      const ts = new Date('2026-01-15T10:00:00Z');
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts });

      expect(stats.getStats('slack')!.lastSuccessAt).toEqual(ts);
      expect(stats.getStats('slack')!.lastFailureAt).toBeNull();
    });

    it('실패 시 lastFailureAt 업데이트', () => {
      const ts = new Date('2026-01-15T10:00:00Z');
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 100, timestamp: ts });

      expect(stats.getStats('slack')!.lastFailureAt).toEqual(ts);
      expect(stats.getStats('slack')!.lastSuccessAt).toBeNull();
    });

    it('여러 기록 시 마지막 시각 유지', () => {
      const ts1 = new Date('2026-01-15T10:00:00Z');
      const ts2 = new Date('2026-01-15T11:00:00Z');
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts1 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts2 });

      expect(stats.getStats('slack')!.lastSuccessAt).toEqual(ts2);
    });
  });

  describe('시간대별 통계', () => {
    it('24시간 전체 슬롯 반환', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });

      const hourly = stats.getStats('slack')!.hourlyStats;
      expect(hourly).toHaveLength(24);
      expect(hourly[0].hour).toBe(0);
      expect(hourly[23].hour).toBe(23);
    });

    it('특정 시간대에 기록', () => {
      const ts10 = new Date('2026-01-15T10:30:00Z');
      const ts14 = new Date('2026-01-15T14:00:00Z');
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts10 });
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 200, timestamp: ts14 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts10 });

      const hourly = stats.getStats('slack')!.hourlyStats;
      // hour 10: UTC 기준
      expect(hourly[10].sent).toBe(2);
      expect(hourly[10].success).toBe(2);
      // hour 14: UTC 기준
      expect(hourly[14].sent).toBe(1);
      expect(hourly[14].success).toBe(0);
    });

    it('데이터 없는 시간대는 0', () => {
      stats.recordResult({
        platform: 'slack',
        success: true,
        responseTimeMs: 100,
        timestamp: new Date('2026-01-15T05:00:00Z'),
      });

      const hourly = stats.getStats('slack')!.hourlyStats;
      expect(hourly[0].sent).toBe(0);
      expect(hourly[0].success).toBe(0);
      expect(hourly[5].sent).toBe(1);
    });
  });

  describe('CircuitBreaker 상태 포함', () => {
    it('기본 상태는 CLOSED', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      expect(stats.getStats('slack')!.circuitBreakerState).toBe(CircuitState.CLOSED);
    });

    it('외부에서 전달한 CircuitBreaker 상태 반영', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });

      const result = stats.getStats('slack', CircuitState.OPEN);
      expect(result!.circuitBreakerState).toBe(CircuitState.OPEN);
    });
  });

  describe('getAllStats', () => {
    it('모든 플랫폼 통계 반환', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'telegram', success: false, responseTimeMs: 200 });

      const all = stats.getAllStats();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.platform).sort()).toEqual(['slack', 'telegram']);
    });

    it('CircuitBreaker 상태 맵 반영', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'telegram', success: true, responseTimeMs: 100 });

      const cbStates = new Map<string, CircuitState>([
        ['slack', CircuitState.CLOSED],
        ['telegram', CircuitState.OPEN],
      ]);

      const all = stats.getAllStats(cbStates);
      const slack = all.find(s => s.platform === 'slack');
      const telegram = all.find(s => s.platform === 'telegram');
      expect(slack!.circuitBreakerState).toBe(CircuitState.CLOSED);
      expect(telegram!.circuitBreakerState).toBe(CircuitState.OPEN);
    });

    it('빈 상태에서 빈 배열 반환', () => {
      expect(stats.getAllStats()).toEqual([]);
    });
  });

  describe('리셋', () => {
    it('특정 플랫폼 리셋', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'telegram', success: true, responseTimeMs: 100 });

      expect(stats.resetPlatform('slack')).toBe(true);
      expect(stats.getStats('slack')).toBeUndefined();
      expect(stats.getStats('telegram')).toBeDefined();
    });

    it('존재하지 않는 플랫폼 리셋 시 false', () => {
      expect(stats.resetPlatform('nonexistent')).toBe(false);
    });

    it('전체 리셋', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'telegram', success: true, responseTimeMs: 100 });

      stats.resetAll();
      expect(stats.getAllStats()).toEqual([]);
    });
  });

  describe('스냅샷 불변성', () => {
    it('반환된 통계 객체 수정이 원본에 영향을 주지 않음', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });

      const snapshot1 = stats.getStats('slack')!;
      snapshot1.totalSent = 999;

      const snapshot2 = stats.getStats('slack')!;
      expect(snapshot2.totalSent).toBe(1);
    });

    it('반환된 lastSuccessAt 수정이 내부 상태에 영향을 주지 않음', () => {
      const ts = new Date('2026-01-15T10:00:00Z');
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100, timestamp: ts });

      const snapshot1 = stats.getStats('slack')!;
      snapshot1.lastSuccessAt!.setFullYear(2000);

      const snapshot2 = stats.getStats('slack')!;
      expect(snapshot2.lastSuccessAt!.getFullYear()).toBe(2026);
    });

    it('반환된 lastFailureAt 수정이 내부 상태에 영향을 주지 않음', () => {
      const ts = new Date('2026-01-15T10:00:00Z');
      stats.recordResult({ platform: 'slack', success: false, responseTimeMs: 100, timestamp: ts });

      const snapshot1 = stats.getStats('slack')!;
      snapshot1.lastFailureAt!.setFullYear(2000);

      const snapshot2 = stats.getStats('slack')!;
      expect(snapshot2.lastFailureAt!.getFullYear()).toBe(2026);
    });
  });

  describe('입력 검증', () => {
    it('빈 플랫폼명은 무시', () => {
      stats.recordResult({ platform: '', success: true, responseTimeMs: 100 });
      expect(stats.getAllStats()).toEqual([]);
    });

    it('공백만 있는 플랫폼명은 무시', () => {
      stats.recordResult({ platform: '  ', success: true, responseTimeMs: 100 });
      expect(stats.getAllStats()).toEqual([]);
    });

    it('음수 응답시간은 0으로 정규화', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: -100 });
      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(0);
    });

    it('NaN 응답시간은 0으로 정규화', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: NaN });
      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(0);
    });

    it('Infinity 응답시간은 0으로 정규화', () => {
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: Infinity });
      expect(stats.getStats('slack')!.averageResponseTimeMs).toBe(0);
    });
  });

  describe('getAllStats 정렬', () => {
    it('플랫폼명 기준 알파벳순 정렬', () => {
      stats.recordResult({ platform: 'telegram', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'discord', success: true, responseTimeMs: 100 });
      stats.recordResult({ platform: 'slack', success: true, responseTimeMs: 100 });

      const all = stats.getAllStats();
      expect(all.map(s => s.platform)).toEqual(['discord', 'slack', 'telegram']);
    });
  });
});
