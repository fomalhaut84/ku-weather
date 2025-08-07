import { WeatherAlert, CachedAlert, AlertChange, AlertChangeType } from '../types/weather';
import { logger } from '../utils/logger';

/**
 * 특보 캐시 및 변동 감지 서비스
 * 메모리 기반으로 특보 상태를 캐시하고 변동사항을 감지합니다.
 */
export class AlertCache {
  private cache: Map<string, CachedAlert> = new Map();
  private lastUpdateTime: Date = new Date();

  /**
   * WeatherAlert를 고유키로 변환합니다.
   * 지역과 특보 종류만으로 키를 생성하여 수준/명령 변경을 감지할 수 있도록 합니다.
   * @param alert 기상특보 데이터
   * @returns 고유 식별자 문자열
   */
  private generateAlertKey(alert: WeatherAlert): string {
    return `${alert.REG_ID}-${alert.WRN}`;
  }

  /**
   * WeatherAlert를 CachedAlert로 변환합니다.
   * @param alert 기상특보 데이터
   * @returns 캐시용 특보 객체
   */
  private toCachedAlert(alert: WeatherAlert): CachedAlert {
    const key = this.generateAlertKey(alert);
    return {
      key,
      regionId: alert.REG_ID,
      regionName: alert.REG_NAME,
      warningType: alert.WRN,
      level: alert.LVL,
      command: alert.CMD,
      announcedAt: alert.TM_FC,
      effectiveAt: alert.TM_EF,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 특보 변동을 감지하고 캐시를 업데이트합니다.
   * @param currentAlerts 현재 특보 목록
   * @returns 감지된 변동사항 목록
   */
  detectChanges(currentAlerts: WeatherAlert[]): AlertChange[] {
    const changes: AlertChange[] = [];
    const currentCachedAlerts = new Map<string, CachedAlert>();
    
    // 현재 특보들을 캐시용 객체로 변환
    currentAlerts.forEach(alert => {
      const cached = this.toCachedAlert(alert);
      currentCachedAlerts.set(cached.key, cached);
    });

    // 1. 신규 특보 및 수준 변경 감지
    for (const [key, current] of currentCachedAlerts) {
      const previous = this.cache.get(key);
      
      if (!previous) {
        // 신규 특보 (해제 명령이 아닌 경우만)
        if (!this.isResolvedCommand(current.command)) {
          changes.push({
            type: 'NEW',
            current,
            description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(current.level)} 신규 발표`
          });
        }
      } else {
        // 기존 특보의 변동 감지 (해제 명령이 아닌 경우만)
        if (!this.isResolvedCommand(current.command)) {
          const change = this.detectAlertChange(previous, current);
          if (change) {
            changes.push(change);
          }
        }
      }
    }

    // 2. 해제된 특보 감지
    for (const [key, previous] of this.cache) {
      const current = currentCachedAlerts.get(key);
      if (!current || this.isResolvedCommand(current.command)) {
        // 해제된 특보 (완전히 사라졌거나 해제 명령)
        changes.push({
          type: 'RESOLVED',
          previous,
          description: `${previous.regionName} ${this.getWarningTypeName(previous.warningType)} ${this.getWarningLevel(previous.level)} 해제`
        });
      }
    }

    // 캐시 업데이트
    this.updateCache(currentAlerts);
    
    logger.debug(`특보 변동 감지 완료: ${changes.length}개 변동사항`);
    return changes;
  }

  /**
   * 개별 특보의 변동을 감지합니다.
   * @param previous 이전 특보
   * @param current 현재 특보
   * @returns 변동사항 또는 null
   */
  private detectAlertChange(previous: CachedAlert, current: CachedAlert): AlertChange | null {
    // 수준 변경 감지
    if (previous.level !== current.level) {
      const prevLevel = parseInt(previous.level);
      const currLevel = parseInt(current.level);
      
      if (currLevel > prevLevel) {
        return {
          type: 'LEVEL_UP',
          current,
          previous,
          description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(previous.level)} → ${this.getWarningLevel(current.level)} 수준 상향`
        };
      } else if (currLevel < prevLevel) {
        return {
          type: 'LEVEL_DOWN',
          current,
          previous,
          description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(previous.level)} → ${this.getWarningLevel(current.level)} 수준 하향`
        };
      }
    }

    // 기타 내용 변경 감지
    if (previous.command !== current.command || 
        previous.announcedAt !== current.announcedAt ||
        previous.effectiveAt !== current.effectiveAt) {
      return {
        type: 'MODIFIED',
        current,
        previous,
        description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(current.level)} 내용 변경`
      };
    }

    return null;
  }

  /**
   * 캐시를 현재 특보 목록으로 업데이트합니다.
   * 해제된 특보는 캐시에서 제거합니다.
   * @param alerts 현재 특보 목록
   */
  updateCache(alerts: WeatherAlert[]): void {
    this.cache.clear();
    
    alerts.forEach(alert => {
      // 해제 관련 명령이 아닌 특보만 캐시에 저장
      if (!this.isResolvedCommand(alert.CMD)) {
        const cached = this.toCachedAlert(alert);
        this.cache.set(cached.key, cached);
      }
    });
    
    this.lastUpdateTime = new Date();
    logger.debug(`특보 캐시 업데이트 완료: ${this.cache.size}개 특보`);
  }

  /**
   * 캐시를 완전히 초기화합니다.
   */
  clearCache(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.lastUpdateTime = new Date();
    logger.info(`특보 캐시 초기화: ${previousSize}개 특보 제거`);
  }

  /**
   * 현재 캐시 상태를 조회합니다.
   * @returns 캐시 상태 정보
   */
  getCacheStatus(): { count: number; lastUpdated: Date } {
    return {
      count: this.cache.size,
      lastUpdated: this.lastUpdateTime
    };
  }

  /**
   * 특정 키의 캐시된 특보를 조회합니다.
   * @param key 특보 고유키
   * @returns 캐시된 특보 또는 undefined
   */
  getCachedAlert(key: string): CachedAlert | undefined {
    return this.cache.get(key);
  }

  /**
   * 모든 캐시된 특보를 배열로 반환합니다.
   * @returns 캐시된 특보 배열
   */
  getAllCachedAlerts(): CachedAlert[] {
    return Array.from(this.cache.values());
  }

  /**
   * 특보 종류 코드를 한국어 이름으로 변환합니다.
   * @param warningCode 특보 종류 코드
   * @returns 한국어 특보 이름
   */
  private getWarningTypeName(warningCode: string): string {
    const warningTypes: Record<string, string> = {
      'W': '강풍',
      'R': '호우',
      'C': '한파',
      'D': '건조',
      'O': '해일',
      'N': '지진해일',
      'V': '풍랑',
      'T': '태풍',
      'S': '대설',
      'Y': '황사',
      'H': '폭염',
      'F': '안개'
    };
    return warningTypes[warningCode.trim()] || warningCode;
  }

  /**
   * 특보 수준 코드를 한국어 이름으로 변환합니다.
   * @param levelCode 특보 수준 코드
   * @returns 한국어 특보 수준
   */
  private getWarningLevel(levelCode: string): string {
    const levels: Record<string, string> = {
      '1': '예비',
      '2': '주의보',
      '3': '경보'
    };
    return levels[levelCode.trim()] || levelCode;
  }

  /**
   * 해제 관련 명령인지 확인합니다.
   * @param command 특보 명령 코드
   * @returns 해제 관련 명령 여부
   */
  private isResolvedCommand(command: string): boolean {
    // 3: 해제, 4: 대치해제(자동), 7: 변경해제
    return ['3', '4', '7'].includes(command.trim());
  }
}