import { WeatherAlert, AlertChange } from '../../types/weather';
import { logger } from '../../utils/logger';
import { NotificationService, NotificationResult } from './interfaces';
import { SubscriptionManager, UserSubscription, SubscriptionNotificationResult } from './SubscriptionManager';
import { HybridSubscriptionManager } from '../subscriptions/HybridSubscriptionManager';
import { SubscriptionCommand } from '../subscriptions/interfaces';
import { CircuitBreaker, CircuitState } from './CircuitBreaker';

export interface RetryOptions {
  readonly maxRetries: number;
  readonly backoffMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  backoffMs: 1000,
};

/**
 * 다중 플랫폼 알림 관리 서비스
 *
 * 여러 알림 플랫폼에 동시 전송하고 결과를 취합하여 반환
 */
export class MultiplatformNotificationService {
  private services: NotificationService[] = [];
  private subscriptionManager: SubscriptionManager;
  private hybridManager?: HybridSubscriptionManager;
  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(services: NotificationService[] = [], subscriptionManager?: SubscriptionManager) {
    this.services = [...services];
    this.subscriptionManager = subscriptionManager || new SubscriptionManager();

    for (const service of this.services) {
      this.ensureCircuitBreaker(service.platformName);
    }

    logger.info(`MultiplatformNotificationService 초기화: ${this.services.length}개 플랫폼, 구독 시스템 ${subscriptionManager ? '외부' : '내장'}`);
  }

  /**
   * 알림 서비스 추가
   */
  addService(service: NotificationService): void {
    this.services.push(service);
    this.ensureCircuitBreaker(service.platformName);
    logger.info(`알림 서비스 추가: ${service.platformName}`);
  }

  /**
   * 알림 서비스 제거
   */
  removeService(platformName: string): boolean {
    const initialLength = this.services.length;
    this.services = this.services.filter(service => service.platformName !== platformName);
    const removed = this.services.length < initialLength;
    
    if (removed) {
      logger.info(`알림 서비스 제거: ${platformName}`);
    }
    
    return removed;
  }

  /**
   * 등록된 모든 플랫폼 목록 반환
   */
  getPlatformNames(): string[] {
    return this.services.map(service => service.platformName);
  }

  /**
   * 특정 플랫폼의 서비스 반환
   */
  getService(platformName: string): NotificationService | undefined {
    return this.services.find(service => service.platformName === platformName);
  }

  /**
   * 모든 플랫폼에 단일 특보 알림 전송
   */
  async sendAlert(alert: WeatherAlert): Promise<NotificationResult[]> {
    if (this.services.length === 0) {
      logger.warn('등록된 알림 서비스가 없습니다');
      return [];
    }

    logger.info(`모든 플랫폼에 특보 알림 전송: ${alert.REG_NAME} ${this.getWarningTypeName(alert.WRN)}`);

    return this.sendAlertToServices(alert, this.services);
  }

  /**
   * 모든 플랫폼에 특보 변동 알림 전송
   */
  async sendAlertChange(change: AlertChange): Promise<NotificationResult[]> {
    if (this.services.length === 0) {
      logger.warn('등록된 알림 서비스가 없습니다');
      return [];
    }

    const alert = change.current || change.previous!;
    logger.info(`모든 플랫폼에 변동 알림 전송: ${change.type} - ${alert.regionName}`);

    const results = await Promise.allSettled(
      this.services.map(async service => {
        try {
          return await service.sendAlertChange(change);
        } catch (error) {
          logger.error(`${service.platformName} 변동 알림 전송 실패:`, error);
          return {
            platform: service.platformName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            responseTime: 0
          } as NotificationResult;
        }
      })
    );

    return this.processResults(results);
  }

  /**
   * 모든 플랫폼에 다중 특보 변동 알림 전송
   */
  async sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]> {
    if (this.services.length === 0) {
      logger.warn('등록된 알림 서비스가 없습니다');
      return [];
    }

    if (changes.length === 0) {
      return [];
    }

    logger.info(`모든 플랫폼에 다중 변동 알림 전송: ${changes.length}건`);

    const results = await Promise.allSettled(
      this.services.map(async service => {
        try {
          const serviceResults = await service.sendAlertChanges(changes);
          // 각 서비스는 여러 결과를 반환할 수 있음 (배치 모드에 따라)
          return serviceResults;
        } catch (error) {
          logger.error(`${service.platformName} 다중 변동 알림 전송 실패:`, error);
          return [{
            platform: service.platformName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            responseTime: 0
          }] as NotificationResult[];
        }
      })
    );

    // 중첩 배열 평면화
    const flatResults: NotificationResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        flatResults.push(...result.value);
      } else {
        // Promise.allSettled에서 rejected된 경우 (이미 try-catch로 처리되므로 발생하지 않아야 함)
        logger.error('예상치 못한 Promise 거부:', result.reason);
      }
    }

    return flatResults;
  }

  /**
   * 모든 플랫폼 건강 상태 확인
   */
  async healthCheck(): Promise<{ [platform: string]: boolean }> {
    if (this.services.length === 0) {
      return {};
    }

    logger.info('모든 플랫폼 건강 상태 확인 시작');

    const results = await Promise.allSettled(
      this.services.map(async service => {
        try {
          const isHealthy = await service.healthCheck();
          return { platform: service.platformName, healthy: isHealthy };
        } catch (error) {
          logger.error(`${service.platformName} 건강 상태 확인 실패:`, error);
          return { platform: service.platformName, healthy: false };
        }
      })
    );

    const healthStatus: { [platform: string]: boolean } = {};
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        healthStatus[result.value.platform] = result.value.healthy;
      }
    }

    const healthyCount = Object.values(healthStatus).filter(Boolean).length;
    logger.info(`건강 상태 확인 완료: ${healthyCount}/${this.services.length} 플랫폼 정상`);

    return healthStatus;
  }

  /**
   * 재시도 로직이 포함된 알림 전송
   *
   * 실패한 플랫폼만 선별적으로 재시도하며 CircuitBreaker를 통해
   * 지속적으로 실패하는 플랫폼에 대한 요청을 자동으로 차단합니다.
   */
  async sendAlertWithRetry(
    alert: WeatherAlert,
    maxRetries: number = DEFAULT_RETRY_OPTIONS.maxRetries,
    backoffMs: number = DEFAULT_RETRY_OPTIONS.backoffMs
  ): Promise<NotificationResult[]> {
    if (this.services.length === 0) {
      logger.warn('등록된 알림 서비스가 없습니다');
      return [];
    }

    const resultMap = new Map<string, NotificationResult>();
    let pendingServices = [...this.services];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptResults = await this.sendAlertToServices(alert, pendingServices);

      for (const result of attemptResults) {
        resultMap.set(result.platform, result);
      }

      const failedPlatforms = attemptResults
        .filter(r => !r.success)
        .map(r => r.platform);

      if (failedPlatforms.length === 0) {
        logger.info(`특보 알림 전송 성공 (시도 ${attempt}/${maxRetries})`);
        break;
      }

      if (attempt < maxRetries) {
        // 실패한 플랫폼 중 CircuitBreaker가 OPEN이 아닌 것만 재시도 대상
        pendingServices = this.services.filter(s => {
          if (!failedPlatforms.includes(s.platformName)) return false;
          const cb = this.circuitBreakers.get(s.platformName);
          return !cb || cb.getState() !== CircuitState.OPEN;
        });

        if (pendingServices.length === 0) {
          logger.warn('모든 실패 플랫폼의 Circuit breaker가 OPEN 상태입니다. 재시도 중단.');
          break;
        }

        const retryNames = pendingServices.map(s => s.platformName).join(', ');
        logger.warn(`실패 플랫폼 재시도: ${retryNames} (${attempt}/${maxRetries} 시도)`);

        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        const failedNames = failedPlatforms.join(', ');
        logger.error(`특보 알림 전송 최종 실패: ${failedNames} (${maxRetries}회 시도 완료)`);
      }
    }

    return Array.from(resultMap.values());
  }

  /**
   * 플랫폼별 전송 성공률 통계 (CircuitBreaker 기반)
   */
  getStatistics(): { [platform: string]: { total: number; success: number; successRate: number } } {
    const stats: { [platform: string]: { total: number; success: number; successRate: number } } = {};

    for (const [platform, cb] of this.circuitBreakers) {
      const cbStats = cb.getStats();
      const successCount = cbStats.totalCalls - cbStats.totalFailures;
      stats[platform] = {
        total: cbStats.totalCalls,
        success: successCount,
        successRate: cbStats.totalCalls > 0 ? successCount / cbStats.totalCalls : 0,
      };
    }

    return stats;
  }

  /**
   * 특정 플랫폼의 CircuitBreaker 상태 조회
   */
  getCircuitBreakerState(platformName: string): CircuitState | undefined {
    return this.circuitBreakers.get(platformName)?.getState();
  }

  /**
   * 특정 플랫폼의 CircuitBreaker 수동 리셋
   */
  resetCircuitBreaker(platformName: string): boolean {
    const cb = this.circuitBreakers.get(platformName);
    if (!cb) return false;
    cb.reset();
    return true;
  }

  /**
   * CircuitBreaker를 통해 지정된 서비스 목록에 알림 전송
   */
  private async sendAlertToServices(
    alert: WeatherAlert,
    services: NotificationService[]
  ): Promise<NotificationResult[]> {
    const results = await Promise.allSettled(
      services.map(async service => {
        const cb = this.circuitBreakers.get(service.platformName);
        if (!cb) {
          return service.sendAlert(alert);
        }

        try {
          return await cb.execute(() => service.sendAlert(alert));
        } catch (error) {
          if ((error as Error).name === 'CircuitBreakerOpenError') {
            logger.warn(`${service.platformName} Circuit breaker OPEN - 전송 건너뜀`);
          } else {
            logger.error(`${service.platformName} 특보 알림 전송 실패:`, error);
          }
          return {
            platform: service.platformName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            responseTime: 0,
          } as NotificationResult;
        }
      })
    );

    return this.processResults(results);
  }

  private ensureCircuitBreaker(platformName: string): void {
    if (!this.circuitBreakers.has(platformName)) {
      this.circuitBreakers.set(
        platformName,
        new CircuitBreaker({ name: platformName })
      );
    }
  }

  /**
   * Promise.allSettled 결과를 NotificationResult로 변환
   */
  private processResults(results: PromiseSettledResult<NotificationResult>[]): NotificationResult[] {
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // 이미 try-catch로 처리되므로 여기는 도달하지 않아야 함
        logger.error('예상치 못한 Promise 거부:', result.reason);
        return {
          platform: 'unknown',
          success: false,
          error: 'Promise 처리 실패',
          responseTime: 0
        } as NotificationResult;
      }
    });
  }

  // ========== 구독 기반 알림 메서드들 ==========

  /**
   * 구독 매니저 반환
   */
  getSubscriptionManager(): SubscriptionManager {
    return this.subscriptionManager;
  }

  /**
   * 구독 기반 특보 알림 전송 (개별 사용자별)
   */
  async sendAlertToSubscriptions(alert: WeatherAlert): Promise<SubscriptionNotificationResult[]> {
    const relevantSubscriptions = this.subscriptionManager.getRelevantSubscriptions(alert);
    
    if (relevantSubscriptions.length === 0) {
      logger.debug(`특보 알림: 관심있는 구독자 없음 - ${alert.REG_NAME} ${this.getWarningTypeName(alert.WRN)}`);
      return [];
    }

    logger.info(`구독 기반 특보 알림 전송: ${alert.REG_NAME} ${this.getWarningTypeName(alert.WRN)} - ${relevantSubscriptions.length}명 구독자`);

    const results: SubscriptionNotificationResult[] = [];

    // 플랫폼별로 구독자를 그룹화
    const subscriptionsByPlatform = new Map<string, UserSubscription[]>();
    for (const subscription of relevantSubscriptions) {
      if (!subscriptionsByPlatform.has(subscription.platform)) {
        subscriptionsByPlatform.set(subscription.platform, []);
      }
      subscriptionsByPlatform.get(subscription.platform)!.push(subscription);
    }

    // 각 플랫폼별로 구독 기반 전송
    for (const [platform, subscriptions] of subscriptionsByPlatform) {
      const service = this.services.find(s => s.platformName === platform);
      if (!service) {
        logger.warn(`플랫폼 서비스를 찾을 수 없음: ${platform}`);
        for (const sub of subscriptions) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.userId,
            platform: sub.platform,
            success: false,
            error: 'Platform service not found'
          });
        }
        continue;
      }

      try {
        if (service.sendAlertToSubscriptions) {
          // 구독 기반 전송 지원
          const platformResults = await service.sendAlertToSubscriptions(alert, subscriptions);
          results.push(...platformResults);
        } else {
          // 구독 기반 전송 미지원 - 전역 전송으로 폴백
          logger.warn(`${platform}는 구독 기반 전송을 지원하지 않음. 전역 전송으로 폴백`);
          const globalResult = await service.sendAlert(alert);
          
          for (const sub of subscriptions) {
            results.push({
              subscriptionId: sub.id,
              userId: sub.userId,
              platform: sub.platform,
              success: globalResult.success,
              error: globalResult.error
            });
          }
        }
      } catch (error) {
        logger.error(`${platform} 구독 기반 특보 알림 전송 실패:`, error);
        for (const sub of subscriptions) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.userId,
            platform: sub.platform,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`구독 기반 특보 알림 전송 완료: ${successCount}/${results.length} 성공`);

    return results;
  }

  /**
   * 구독 기반 변동 알림 전송 (개별 사용자별)
   */
  async sendAlertChangeToSubscriptions(change: AlertChange): Promise<SubscriptionNotificationResult[]> {
    const relevantSubscriptions = this.subscriptionManager.getRelevantSubscriptionsForChange(change);
    
    if (relevantSubscriptions.length === 0) {
      const alert = change.current || change.previous!;
      logger.debug(`변동 알림: 관심있는 구독자 없음 - ${change.type} ${alert.regionName}`);
      return [];
    }

    const alert = change.current || change.previous!;
    logger.info(`구독 기반 변동 알림 전송: ${change.type} ${alert.regionName} - ${relevantSubscriptions.length}명 구독자`);

    const results: SubscriptionNotificationResult[] = [];

    // 플랫폼별로 구독자를 그룹화
    const subscriptionsByPlatform = new Map<string, UserSubscription[]>();
    for (const subscription of relevantSubscriptions) {
      if (!subscriptionsByPlatform.has(subscription.platform)) {
        subscriptionsByPlatform.set(subscription.platform, []);
      }
      subscriptionsByPlatform.get(subscription.platform)!.push(subscription);
    }

    // 각 플랫폼별로 구독 기반 전송
    for (const [platform, subscriptions] of subscriptionsByPlatform) {
      const service = this.services.find(s => s.platformName === platform);
      if (!service) {
        logger.warn(`플랫폼 서비스를 찾을 수 없음: ${platform}`);
        for (const sub of subscriptions) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.userId,
            platform: sub.platform,
            success: false,
            error: 'Platform service not found'
          });
        }
        continue;
      }

      try {
        if (service.sendAlertChangeToSubscriptions) {
          // 구독 기반 전송 지원
          const platformResults = await service.sendAlertChangeToSubscriptions(change, subscriptions);
          results.push(...platformResults);
        } else {
          // 구독 기반 전송 미지원 - 전역 전송으로 폴백
          logger.warn(`${platform}는 구독 기반 변동 알림을 지원하지 않음. 전역 전송으로 폴백`);
          const globalResult = await service.sendAlertChange(change);
          
          for (const sub of subscriptions) {
            results.push({
              subscriptionId: sub.id,
              userId: sub.userId,
              platform: sub.platform,
              success: globalResult.success,
              error: globalResult.error
            });
          }
        }
      } catch (error) {
        logger.error(`${platform} 구독 기반 변동 알림 전송 실패:`, error);
        for (const sub of subscriptions) {
          results.push({
            subscriptionId: sub.id,
            userId: sub.userId,
            platform: sub.platform,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`구독 기반 변동 알림 전송 완료: ${successCount}/${results.length} 성공`);

    return results;
  }

  /**
   * 구독 기반 다중 변동 알림 전송
   */
  async sendAlertChangesToSubscriptions(changes: AlertChange[]): Promise<SubscriptionNotificationResult[]> {
    if (changes.length === 0) {
      return [];
    }

    logger.info(`구독 기반 다중 변동 알림 전송 시작: ${changes.length}개 변동`);

    const allResults: SubscriptionNotificationResult[] = [];

    // 각 변동별로 개별 처리 (사용자별 관심 지역이 다르기 때문)
    for (const change of changes) {
      const results = await this.sendAlertChangeToSubscriptions(change);
      allResults.push(...results);
    }

    const successCount = allResults.filter(r => r.success).length;
    logger.info(`구독 기반 다중 변동 알림 전송 완료: ${successCount}/${allResults.length} 성공`);

    return allResults;
  }

  /**
   * 구독 추가 (편의 메서드)
   */
  addSubscription(
    platform: string, 
    userId: string, 
    targetRegions: string[], 
    options?: {
      warningTypes?: string[];
      displayName?: string;
      preferences?: UserSubscription['preferences'];
    }
  ): string {
    return this.subscriptionManager.addSubscription({
      platform,
      userId,
      targetRegions,
      warningTypes: options?.warningTypes,
      displayName: options?.displayName,
      preferences: options?.preferences,
      enabled: true
    });
  }

  /**
   * 구독 제거 (편의 메서드)
   */
  removeSubscription(platform: string, userId: string): boolean {
    const subscription = this.subscriptionManager.getUserSubscription(platform, userId);
    if (!subscription) return false;
    
    return this.subscriptionManager.removeSubscription(subscription.id);
  }

  /**
   * 구독 통계 조회
   */
  getSubscriptionStatistics() {
    return this.subscriptionManager.getStatistics();
  }

  /**
   * 특보 종류 코드를 한국어로 변환
   */
  private getWarningTypeName(code: string): string {
    const types: Record<string, string> = {
      'H': '폭염',
      'R': '호우', 
      'W': '강풍',
      'V': '풍랑',
      'T': '태풍',
      'S': '대설',
      'C': '한파',
      'D': '건조',
      'Y': '황사',
      'F': '안개',
      'O': '해일',
      'N': '지진해일'
    };
    return types[code?.trim()] || code;
  }

  // ========== 하이브리드 구독 관리 시스템 연동 ==========

  /**
   * 하이브리드 구독 관리 시스템 설정
   */
  setHybridSubscriptionManager(hybridManager: HybridSubscriptionManager): void {
    this.hybridManager = hybridManager;
    logger.info('하이브리드 구독 관리 시스템 연동 완료');
  }

  /**
   * 하이브리드 구독 관리 시스템 반환
   */
  getHybridSubscriptionManager(): HybridSubscriptionManager | undefined {
    return this.hybridManager;
  }

  /**
   * 하이브리드 구독 관리 시스템 사용 가능 여부
   */
  isHybridSubscriptionAvailable(): boolean {
    return !!this.hybridManager;
  }

  /**
   * 플랫폼별 구독 명령어 처리 (하이브리드 시스템 연동)
   */
  async processSubscriptionCommand(
    platform: string,
    userId: string,
    command: string,
    args: string[] = [],
    rawMessage?: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    if (!this.hybridManager) {
      return {
        success: false,
        message: '하이브리드 구독 시스템이 설정되지 않았습니다.',
        error: 'HYBRID_SYSTEM_NOT_AVAILABLE'
      };
    }

    try {
      const result = await this.hybridManager.processCommand({
        command: command as SubscriptionCommand,
        platform,
        userId,
        args,
        rawMessage
      });

      return result;
    } catch (error) {
      logger.error('하이브리드 구독 명령어 처리 실패:', error);
      return {
        success: false,
        message: '구독 명령어 처리 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'COMMAND_PROCESSING_FAILED'
      };
    }
  }

  /**
   * 웹 토큰 생성 (하이브리드 시스템 연동)
   */
  async generateWebToken(platform: string, userId: string): Promise<string | null> {
    if (!this.hybridManager) {
      logger.warn('하이브리드 구독 시스템이 설정되지 않았습니다');
      return null;
    }

    try {
      const authToken = await this.hybridManager.generateUserToken(platform, userId);
      return authToken.token;
    } catch (error) {
      logger.error('웹 토큰 생성 실패:', error);
      return null;
    }
  }

  /**
   * 하이브리드 플랫폼별 구독 통계 조회
   */
  async getHybridSubscriptionStats(): Promise<Record<string, any> | null> {
    if (!this.hybridManager) {
      return null;
    }

    try {
      return await this.hybridManager.getPlatformStats();
    } catch (error) {
      logger.error('하이브리드 구독 통계 조회 실패:', error);
      return null;
    }
  }

  /**
   * 등록된 하이브리드 플랫폼 목록
   */
  getHybridPlatformNames(): string[] {
    return this.hybridManager?.getRegisteredPlatforms() || [];
  }

  /**
   * 플랫폼별 도움말 메시지 조회 (하이브리드 시스템)
   */
  async getHybridHelpMessage(platform: string): Promise<string | null> {
    if (!this.hybridManager) {
      return null;
    }

    try {
      return await this.hybridManager.getHelpMessage(platform);
    } catch (error) {
      logger.error('하이브리드 도움말 조회 실패:', error);
      return null;
    }
  }
}