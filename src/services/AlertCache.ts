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
    const now = new Date().toISOString();
    return {
      key,
      regionId: alert.REG_ID,
      regionName: alert.REG_NAME,
      warningType: alert.WRN,
      level: alert.LVL,
      command: alert.CMD,
      announcedAt: alert.TM_FC,
      effectiveAt: alert.TM_EF,
      lastUpdated: now,
      lastSeenAt: now,  // API에서 확인된 현재 시각
      endTime: alert.TM_ED  // 종료시각 (Grace period 판단용)
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
    const now = new Date().toISOString();

    // 현재 특보들을 캐시용 객체로 변환
    currentAlerts.forEach(alert => {
      const cached = this.toCachedAlert(alert);
      currentCachedAlerts.set(cached.key, cached);
    });

    // 1. 캐시에 있지만 API 응답에 없는 특보 감지 (Grace Period 판단)
    // TM_ED (종료시각) 기반으로 Grace period 판단, TM_ED가 없으면 30분 타임아웃 사용
    const gracePeriodEntries = new Map<string, CachedAlert>();
    // 자동 해제 로직 제거: API 데이터만 신뢰하고 해제 알림은 기상청 명령(CMD=3,4,7)에만 의존

    for (const [key, previous] of this.cache) {
      if (!currentCachedAlerts.has(key)) {
        // API 응답에 완전히 없는 특보 발견
        const now = Date.now();
        // API 응답에 없는 특보는 기상청 시스템에서 해제되었을 가능성이 높음
        // 하지만 자동 해제 알림은 전송하지 않고, 조용히 캐시에서만 제거
        
        let shouldSilentlyRemove = false;
        let shouldKeepInCache = false;

        // 예비특보(LVL='1')는 발효시각 전까지는 유지
        if (previous.level === '1') {
          try {
            // effectiveAt은 "YYYYMMDDHHMM" 형식의 KST 타임스탬프
            const year = parseInt(previous.effectiveAt.substring(0, 4));
            const month = parseInt(previous.effectiveAt.substring(4, 6)) - 1; // JS Date month는 0-based
            const day = parseInt(previous.effectiveAt.substring(6, 8));
            const hour = parseInt(previous.effectiveAt.substring(8, 10));
            const minute = parseInt(previous.effectiveAt.substring(10, 12));

            // KST (UTC+9)를 UTC로 변환
            const effectiveAtUTC = Date.UTC(year, month, day, hour, minute) - 9 * 60 * 60 * 1000;
            const effectiveAt = new Date(effectiveAtUTC);

            if (!isNaN(effectiveAt.getTime()) && now < effectiveAt.getTime()) {
              // 예비특보이고 발효시각 전 → Grace period로 처리 (유지)
              const minutesUntilEffective = Math.round((effectiveAt.getTime() - now) / 1000 / 60);
              logger.debug(`예비특보 발효 대기 중: ${previous.regionName} ${this.getWarningTypeName(previous.warningType)} (발효까지 ${minutesUntilEffective}분)`);
              gracePeriodEntries.set(key, previous);
              continue; // 다음 특보로 넘어감 (유지)
            }
          } catch (error) {
            logger.debug(`발효시각 파싱 실패 (${previous.effectiveAt}): ${error}`);
          }
        }

        // TM_ED (종료시각) 확인 - 도과 시 조용히 정리만 수행
        if (previous.endTime && previous.endTime.trim() !== '') {
          try {
            const endTime = new Date(previous.endTime);
            if (!isNaN(endTime.getTime()) && now > endTime.getTime()) {
              // 종료시각 도과 → 조용히 캐시에서 제거 (알림 없음)
              shouldSilentlyRemove = true;
              logger.debug(`종료시각 도과로 캐시 정리: ${previous.regionName} ${this.getWarningTypeName(previous.warningType)}`);
            } else if (!isNaN(endTime.getTime())) {
              // 종료시각 미도과 → 일시적 API 누락으로 간주, 캐시 유지
              const timeUntilEnd = Math.round((endTime.getTime() - now) / 1000 / 60);
              logger.debug(`일시적 API 누락 추정: ${previous.regionName} ${this.getWarningTypeName(previous.warningType)} (종료까지 ${timeUntilEnd}분)`);
              shouldKeepInCache = true;
            }
          } catch {
            logger.debug(`TM_ED 파싱 실패 (${previous.endTime}), 캐시 유지`);
            shouldKeepInCache = true;
          }
        } else {
          // TM_ED가 없는 경우, 일시적 API 누락으로 간주하여 더 오래 유지
          const lastSeenAt = new Date(previous.lastSeenAt || previous.lastUpdated);
          const timeSinceLastSeen = now - lastSeenAt.getTime();
          
          // 기존 30분 → 2시간으로 연장하여 API 불안정성 대응
          const EXTENDED_GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2시간
          
          if (timeSinceLastSeen > EXTENDED_GRACE_PERIOD_MS) {
            // 2시간 초과 → 조용히 캐시에서 제거 (알림 없음)
            shouldSilentlyRemove = true;
            logger.debug(`장기간 미확인으로 캐시 정리: ${previous.regionName} ${this.getWarningTypeName(previous.warningType)} (${Math.round(timeSinceLastSeen/1000/60)}분 미확인)`);
          } else {
            // 2시간 내 → 캐시 유지
            shouldKeepInCache = true;
            logger.debug(`일시적 API 누락: ${previous.regionName} ${this.getWarningTypeName(previous.warningType)} (${Math.round(timeSinceLastSeen/1000/60)}분 경과)`);
          }
        }

        // 캐시 유지가 필요한 경우 gracePeriodEntries에 추가
        if (shouldKeepInCache) {
          gracePeriodEntries.set(key, previous);
        }
        
        // shouldSilentlyRemove가 true인 경우 아무것도 하지 않음 (조용히 제거)
      }
    }

    // 2. 신규 특보 및 수준 변경 감지
    for (const [key, current] of currentCachedAlerts) {
      const previous = this.cache.get(key);

      if (!previous) {
        if (this.isNewCommand(current.command)) {
          // CMD=1: 진짜 신규 발표
          changes.push({
            type: 'NEW',
            current,
            description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(current.level)} 신규 발표`
          });
        } else if (!this.isResolvedCommand(current.command)) {
          // CMD=2,5,6: 기존 활성 특보 (초기 실행 시 캐시에 저장만 하고 알림 없음)
          logger.debug(`기존 활성 특보 발견: ${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getCommandName(current.command)} (초기 캐시 설정)`);
        } else {
          // CMD=3,4,7: 해제 명령이지만 캐시에 이전 데이터가 없음 (이미 해제된 상태)
          logger.debug(`이미 해제된 특보: ${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getCommandName(current.command)}`);
        }
      } else {
        // 기존 특보의 변동 감지 (해제 명령이 아닌 경우만)
        if (!this.isResolvedCommand(current.command)) {
          // API 불안정성 감지: 일시적으로 사라졌다가 다시 나타난 특보 처리
          // announcedAt이 다르고, 이전 특보가 일시적으로 사라졌다면 진짜 신규로 처리
          if (previous.announcedAt !== current.announcedAt || previous.command !== current.command) {
            const lastSeenAt = new Date(previous.lastSeenAt || previous.lastUpdated);
            const timeSinceLastSeen = Date.now() - lastSeenAt.getTime();
            const API_INSTABILITY_WINDOW_MS = 30 * 60 * 1000; // 30분 (API 일시 불안정 허용 시간)

            // API 불안정 윈도우 내에 있고, 데이터가 다르면 진짜 신규 특보 가능성
            if (timeSinceLastSeen > 0 && timeSinceLastSeen < API_INSTABILITY_WINDOW_MS && timeSinceLastSeen > 60 * 1000) {
              // 1분 이상 경과한 경우 (즉, 최소 한 번의 폴링 사이클을 놓친 경우)
              logger.debug(`Grace period 내 새로운 특보 감지: ${current.regionName} ${this.getWarningTypeName(current.warningType)} (이전: ${previous.announcedAt}/${previous.command}, 현재: ${current.announcedAt}/${current.command}, 경과시간: ${Math.round(timeSinceLastSeen/1000)}초)`);

              if (this.isNewCommand(current.command)) {
                // 신규 발표 명령이면 NEW로 처리
                changes.push({
                  type: 'NEW',
                  current,
                  description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(current.level)} 신규 발표`
                });
              } else {
                // 다른 명령이면 변동으로 처리
                const change = this.detectAlertChange(previous, current);
                if (change) {
                  changes.push(change);
                }
              }
            } else {
              // 일반적인 변동 (즉시 변경)
              const change = this.detectAlertChange(previous, current);
              if (change) {
                changes.push(change);
              }
            }
          } else if (gracePeriodEntries.has(key)) {
            // 동일한 특보 재등장: 변동 없음, grace period 엔트리 유지
            logger.debug(`동일 특보 재등장 (중복 알림 방지): ${current.regionName} ${this.getWarningTypeName(current.warningType)}`);
          } else {
            // 일반적인 변동 감지 (데이터 동일)
            const change = this.detectAlertChange(previous, current);
            if (change) {
              changes.push(change);
            }
          }
        }
      }
    }

    // 3. Grace period 엔트리를 currentCachedAlerts에 병합
    for (const [key, gracePeriodEntry] of gracePeriodEntries) {
      if (!currentCachedAlerts.has(key)) {
        // API 응답에 여전히 없음: grace period 엔트리 유지
        currentCachedAlerts.set(key, gracePeriodEntry);
      }
      // API 응답에 있으면 currentCachedAlerts의 값을 우선 (Step 2에서 이미 처리됨)
    }

    // 4. 해제 명령 처리 및 활성 특보 수집
    const activeAlerts = new Map<string, CachedAlert>();

    for (const [key, current] of currentCachedAlerts) {
      if (this.isResolvedCommand(current.command)) {
        const previous = this.cache.get(key);
        if (previous) {
          // 기상청 API 해제 명령 처리 (CMD=3,4,7)
          changes.push({
            type: 'RESOLVED',
            previous,
            description: `${previous.regionName} ${this.getWarningTypeName(previous.warningType)} ${this.getWarningLevel(previous.level)} 해제`
          });
        }
        // 해제된 특보는 캐시에 저장하지 않음
      } else {
        // 활성 특보만 캐시에 유지
        activeAlerts.set(key, current);
      }
    }

    // 캐시 업데이트 (활성 특보만)
    this.replaceCache(activeAlerts);

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

    // 발효시각만 변경된 경우 (명령과 발표시각은 동일)
    if (previous.command === current.command && 
        previous.announcedAt === current.announcedAt && 
        previous.effectiveAt !== current.effectiveAt) {
      return {
        type: 'TIME_EXTENDED',
        current,
        previous,
        description: `${current.regionName} ${this.getWarningTypeName(current.warningType)} ${this.getWarningLevel(current.level)} 발효시각 연장`
      };
    }
    
    // 기타 내용 변경 감지 (명령 또는 발표시각 변경)
    if (previous.command !== current.command || 
        previous.announcedAt !== current.announcedAt) {
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
   * 이미 변환된 캐시 데이터로 캐시를 교체합니다.
   * detectChanges() 메서드에서 사용하여 중복 처리를 방지합니다.
   * @param newCache 새로운 캐시 데이터 (Map<string, CachedAlert>)
   */
  private replaceCache(newCache: Map<string, CachedAlert>): void {
    this.cache.clear();
    
    // 해제 관련 명령이 아닌 특보만 저장
    newCache.forEach((cached, key) => {
      if (!this.isResolvedCommand(cached.command)) {
        this.cache.set(key, cached);
      }
    });
    
    this.lastUpdateTime = new Date();
    logger.debug(`특보 캐시 교체 완료: ${this.cache.size}개 특보`);
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

  /**
   * 신규 발표 명령인지 확인합니다.
   * @param command 특보 명령 코드
   * @returns 신규 발표 명령 여부
   */
  private isNewCommand(command: string): boolean {
    // 1: 발표 (신규)
    return command.trim() === '1';
  }

  /**
   * 명령 코드를 한국어 이름으로 변환합니다.
   * @param command 특보 명령 코드
   * @returns 한국어 명령 이름
   */
  private getCommandName(command: string): string {
    const commands: Record<string, string> = {
      '1': '발표',
      '2': '대치',
      '3': '해제',
      '4': '대치해제(자동)',
      '5': '연장',
      '6': '변경',
      '7': '변경해제'
    };
    return commands[command.trim()] || command;
  }
}