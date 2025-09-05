import { WeatherAlert, AlertChange } from '../../types/weather';
import { logger } from '../../utils/logger';
import { NotificationService, NotificationResult } from './interfaces';

/**
 * 다중 플랫폼 알림 관리 서비스
 * 
 * 여러 알림 플랫폼에 동시 전송하고 결과를 취합하여 반환
 */
export class MultiplatformNotificationService {
  private services: NotificationService[] = [];

  constructor(services: NotificationService[] = []) {
    this.services = [...services];
    logger.info(`MultiplatformNotificationService 초기화: ${this.services.length}개 플랫폼`);
  }

  /**
   * 알림 서비스 추가
   */
  addService(service: NotificationService): void {
    this.services.push(service);
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
   * 모든 플랫폼에 단일 특보 알림 전송
   */
  async sendAlert(alert: WeatherAlert): Promise<NotificationResult[]> {
    if (this.services.length === 0) {
      logger.warn('등록된 알림 서비스가 없습니다');
      return [];
    }

    logger.info(`모든 플랫폼에 특보 알림 전송: ${alert.REG_NAME} ${this.getWarningTypeName(alert.WRN)}`);

    const results = await Promise.allSettled(
      this.services.map(async service => {
        try {
          return await service.sendAlert(alert);
        } catch (error) {
          logger.error(`${service.platformName} 특보 알림 전송 실패:`, error);
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
   */
  async sendAlertWithRetry(
    alert: WeatherAlert, 
    maxRetries: number = 3, 
    backoffMs: number = 1000
  ): Promise<NotificationResult[]> {
    let lastResults: NotificationResult[] = [];
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResults = await this.sendAlert(alert);
      
      const failedResults = lastResults.filter(result => !result.success);
      
      if (failedResults.length === 0) {
        // 모든 플랫폼 성공
        logger.info(`특보 알림 전송 성공 (시도 ${attempt}/${maxRetries})`);
        return lastResults;
      }
      
      if (attempt < maxRetries) {
        const failedPlatforms = failedResults.map(r => r.platform).join(', ');
        logger.warn(`특보 알림 전송 실패 플랫폼: ${failedPlatforms} (${attempt}/${maxRetries} 시도)`);
        
        // Exponential backoff
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        const failedPlatforms = failedResults.map(r => r.platform).join(', ');
        logger.error(`특보 알림 전송 최종 실패: ${failedPlatforms} (${maxRetries}회 시도 완료)`);
      }
    }
    
    return lastResults;
  }

  /**
   * 플랫폼별 전송 성공률 통계
   */
  getStatistics(): { [platform: string]: { total: number; success: number; successRate: number } } {
    // 실제 운영에서는 이 정보를 메모리나 데이터베이스에 저장해야 함
    // 현재는 구조만 제공
    return {};
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
}