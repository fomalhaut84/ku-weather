import { CircuitBreaker, CircuitState } from '../../../services/notifications/CircuitBreaker';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('초기 상태', () => {
    it('생성 직후 CLOSED 상태', () => {
      const cb = new CircuitBreaker({ name: 'test' });
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('초기 통계 값은 모두 0', () => {
      const cb = new CircuitBreaker({ name: 'test' });
      const stats = cb.getStats();
      expect(stats).toEqual({
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        totalCalls: 0,
        totalFailures: 0,
        name: 'test',
      });
    });

    it('기본 옵션이 적용됨', () => {
      const cb = new CircuitBreaker();
      expect(cb.getStats().name).toBe('default');
    });
  });

  describe('CLOSED 상태 동작', () => {
    it('성공 호출 시 CLOSED 유지', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('실패 횟수가 임계값 미만이면 CLOSED 유지', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getStats().failureCount).toBe(2);
    });

    it('성공 호출 후 실패 카운터 리셋', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

      // 2번 실패
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getStats().failureCount).toBe(2);

      // 1번 성공 → 실패 카운터 리셋
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getStats().failureCount).toBe(0);

      // 다시 2번 실패해도 아직 CLOSED
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED → OPEN 전이', () => {
    it('연속 실패가 임계값에 도달하면 OPEN 전환', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('기본 임계값(5회)로 동작', async () => {
      const cb = new CircuitBreaker({ name: 'test' });

      for (let i = 0; i < 4; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.CLOSED);

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('OPEN 상태 동작', () => {
    it('OPEN 상태에서 호출 시 CircuitBreakerOpenError 발생', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });

      // OPEN으로 전환
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // OPEN 상태에서 호출 거부
      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        /Circuit breaker \[test\] is OPEN/
      );
    });

    it('OPEN 상태에서 실제 함수가 실행되지 않음', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const fn = jest.fn().mockResolvedValue('ok');
      await expect(cb.execute(fn)).rejects.toThrow(/Circuit breaker/);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('OPEN → HALF_OPEN 전이', () => {
    it('resetTimeout 경과 후 HALF_OPEN으로 전환', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 100,
      });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // 타임아웃 대기
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('resetTimeout 미경과 시 OPEN 유지', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 10_000,
      });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('HALF_OPEN 상태 동작', () => {
    it('HALF_OPEN에서 성공하면 CLOSED로 전환', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('HALF_OPEN에서 실패하면 다시 OPEN으로 전환', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

      await expect(cb.execute(() => Promise.reject(new Error('still broken')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('통계 추적', () => {
    it('성공/실패 카운터가 정확하게 추적됨', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 10 });

      await cb.execute(() => Promise.resolve('ok'));
      await cb.execute(() => Promise.resolve('ok'));
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const stats = cb.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });

    it('OPEN 상태에서 차단된 호출도 totalCalls에 포함', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getStats().totalCalls).toBe(1);

      // OPEN 상태에서 차단 → totalCalls 증가하지 않음 (함수 실행 전 차단)
      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(/Circuit breaker/);
      expect(cb.getStats().totalCalls).toBe(1);
    });
  });

  describe('수동 리셋', () => {
    it('reset()으로 CLOSED 상태로 복원', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);

      cb.reset();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getStats().failureCount).toBe(0);
    });

    it('리셋 후 정상적으로 호출 가능', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      cb.reset();

      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
    });
  });

  describe('커스텀 옵션', () => {
    it('failureThreshold 커스터마이징', async () => {
      const cb = new CircuitBreaker({ name: 'custom', failureThreshold: 2 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.CLOSED);

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('name 커스터마이징', () => {
      const cb = new CircuitBreaker({ name: 'telegram' });
      expect(cb.getStats().name).toBe('telegram');
    });
  });
});
