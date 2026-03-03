import { logger } from '../../utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, resetAt: Date) {
    super(
      `Circuit breaker [${name}] is OPEN. Requests are blocked until ${resetAt.toISOString()}`
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly name: string;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  name: 'default',
};

export class CircuitBreaker {
  private readonly options: CircuitBreakerOptions;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private totalFailures: number = 0;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };

    if (merged.failureThreshold < 1) {
      throw new Error(`failureThreshold must be >= 1, got ${merged.failureThreshold}`);
    }
    if (merged.resetTimeoutMs < 0) {
      throw new Error(`resetTimeoutMs must be >= 0, got ${merged.resetTimeoutMs}`);
    }

    this.options = merged;
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError(
        this.options.name,
        new Date(this.lastFailureTime + this.options.resetTimeoutMs)
      );
    }

    this.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getStats(): {
    readonly state: CircuitState;
    readonly failureCount: number;
    readonly successCount: number;
    readonly totalCalls: number;
    readonly totalFailures: number;
    readonly name: string;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      name: this.options.name,
    };
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.lastFailureTime = 0;
    logger.info(`Circuit breaker [${this.options.name}] 수동 리셋`);
  }

  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.failureCount = 0;
      this.transitionTo(CircuitState.CLOSED);
      logger.info(`Circuit breaker [${this.options.name}] HALF_OPEN → CLOSED (성공)`);
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      logger.warn(`Circuit breaker [${this.options.name}] HALF_OPEN → OPEN (실패)`);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
      logger.warn(
        `Circuit breaker [${this.options.name}] CLOSED → OPEN (${this.failureCount}회 연속 실패)`
      );
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
    }
  }
}
