import { CircuitState } from './CircuitBreaker';

export interface HourlyBucket {
  readonly hour: number;
  sent: number;
  success: number;
}

export interface PlatformStats {
  readonly platform: string;
  totalSent: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageResponseTimeMs: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  circuitBreakerState: CircuitState;
  hourlyStats: HourlyBucket[];
}

export interface RecordEntry {
  readonly platform: string;
  readonly success: boolean;
  readonly responseTimeMs: number;
  readonly timestamp?: Date;
}

export class NotificationStats {
  private readonly platforms: Map<string, PlatformStatsAccumulator> = new Map();

  recordResult(entry: RecordEntry): void {
    const platform = entry.platform?.trim();
    if (!platform || platform.length === 0) return;

    const responseTimeMs = Number.isFinite(entry.responseTimeMs) && entry.responseTimeMs >= 0
      ? entry.responseTimeMs
      : 0;

    const ts = entry.timestamp instanceof Date && Number.isFinite(entry.timestamp.getTime())
      ? entry.timestamp
      : new Date();

    const acc = this.ensurePlatform(platform);

    acc.totalSent++;
    acc.totalResponseTimeMs += responseTimeMs;

    const hour = ts.getUTCHours();
    const bucket = acc.hourlyBuckets.get(hour) ?? { hour, sent: 0, success: 0 };
    bucket.sent++;

    if (entry.success) {
      acc.successCount++;
      acc.lastSuccessAt = ts;
      bucket.success++;
    } else {
      acc.failureCount++;
      acc.lastFailureAt = ts;
    }

    acc.hourlyBuckets.set(hour, bucket);
  }

  getStats(platform: string, circuitBreakerState?: CircuitState): PlatformStats | undefined {
    const normalized = platform?.trim();
    if (!normalized) return undefined;
    const acc = this.platforms.get(normalized);
    if (!acc) return undefined;
    return this.toSnapshot(normalized, acc, circuitBreakerState ?? CircuitState.CLOSED);
  }

  getAllStats(circuitBreakerStates?: Map<string, CircuitState>): PlatformStats[] {
    const results: PlatformStats[] = [];
    for (const [platform, acc] of this.platforms) {
      const cbState = circuitBreakerStates?.get(platform) ?? CircuitState.CLOSED;
      results.push(this.toSnapshot(platform, acc, cbState));
    }
    return results.sort((a, b) => a.platform.localeCompare(b.platform));
  }

  resetPlatform(platform: string): boolean {
    const normalized = platform?.trim();
    if (!normalized) return false;
    return this.platforms.delete(normalized);
  }

  resetAll(): void {
    this.platforms.clear();
  }

  private ensurePlatform(platform: string): PlatformStatsAccumulator {
    let acc = this.platforms.get(platform);
    if (!acc) {
      acc = {
        totalSent: 0,
        successCount: 0,
        failureCount: 0,
        totalResponseTimeMs: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        hourlyBuckets: new Map(),
      };
      this.platforms.set(platform, acc);
    }
    return acc;
  }

  private toSnapshot(
    platform: string,
    acc: PlatformStatsAccumulator,
    circuitBreakerState: CircuitState
  ): PlatformStats {
    const hourlyStats: HourlyBucket[] = [];
    for (let h = 0; h < 24; h++) {
      const bucket = acc.hourlyBuckets.get(h);
      hourlyStats.push(bucket ? { ...bucket } : { hour: h, sent: 0, success: 0 });
    }

    return {
      platform,
      totalSent: acc.totalSent,
      successCount: acc.successCount,
      failureCount: acc.failureCount,
      successRate: acc.totalSent > 0 ? acc.successCount / acc.totalSent : 0,
      averageResponseTimeMs: acc.totalSent > 0 ? acc.totalResponseTimeMs / acc.totalSent : 0,
      lastSuccessAt: acc.lastSuccessAt ? new Date(acc.lastSuccessAt.getTime()) : null,
      lastFailureAt: acc.lastFailureAt ? new Date(acc.lastFailureAt.getTime()) : null,
      circuitBreakerState,
      hourlyStats,
    };
  }
}

interface PlatformStatsAccumulator {
  totalSent: number;
  successCount: number;
  failureCount: number;
  totalResponseTimeMs: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  hourlyBuckets: Map<number, HourlyBucket>;
}
