import { WeatherAlert, AlertChange } from '../../types/weather';
import { logger } from '../../utils/logger';

/**
 * 개별 사용자 구독 정보
 */
export interface UserSubscription {
  id: string;                    // 고유 구독 ID
  platform: string;             // 플랫폼 (telegram, discord, email, slack)
  userId: string;                // 플랫폼별 사용자 ID (chatId, email, etc.)
  targetRegions: string[];       // 모니터링 대상 지역 코드 배열
  warningTypes?: string[];       // 관심 특보 종류 (없으면 전체)
  enabled: boolean;              // 구독 활성/비활성
  createdAt: Date;               // 구독 생성일
  updatedAt: Date;               // 마지막 업데이트일
  displayName?: string;          // 사용자 표시명 (선택적)
  preferences?: {                // 개별 사용자 선호 설정
    quietHours?: {               // 조용한 시간대
      start: string;             // '22:00'
      end: string;               // '08:00'
    };
    minLevel?: string;           // 최소 특보 수준 ('1', '2', '3')
    batchMode?: boolean;         // 배치 모드 사용 여부
  };
}

/**
 * 구독별 알림 발송 결과
 */
export interface SubscriptionNotificationResult {
  subscriptionId: string;
  userId: string;
  platform: string;
  success: boolean;
  error?: string;
  filteredOut?: boolean;        // 필터링으로 제외됨
  filterReason?: string;        // 제외 사유
}

/**
 * 사용자별 구독 관리 시스템
 * 
 * 개별 사용자가 원하는 지역만 모니터링할 수 있는 기능 제공
 */
export class SubscriptionManager {
  private subscriptions: Map<string, UserSubscription> = new Map();
  private platformIndex: Map<string, Set<string>> = new Map(); // platform -> subscription IDs

  /**
   * 구독 추가/업데이트
   */
  addSubscription(subscription: Omit<UserSubscription, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = this.generateSubscriptionId(subscription.platform, subscription.userId);
    
    const existingSubscription = this.subscriptions.get(id);
    const now = new Date();
    
    const fullSubscription: UserSubscription = {
      ...subscription,
      id,
      createdAt: existingSubscription?.createdAt || now,
      updatedAt: now
    };

    this.subscriptions.set(id, fullSubscription);
    
    // 플랫폼별 인덱스 업데이트
    if (!this.platformIndex.has(subscription.platform)) {
      this.platformIndex.set(subscription.platform, new Set());
    }
    this.platformIndex.get(subscription.platform)!.add(id);

    logger.info(`구독 ${existingSubscription ? '업데이트' : '추가'}: ${subscription.platform}/${subscription.userId} - 지역 ${subscription.targetRegions.length}개`);
    
    return id;
  }

  /**
   * 구독 제거
   */
  removeSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    
    // 플랫폼별 인덱스에서도 제거
    const platformSet = this.platformIndex.get(subscription.platform);
    if (platformSet) {
      platformSet.delete(subscriptionId);
    }

    logger.info(`구독 제거: ${subscription.platform}/${subscription.userId}`);
    return true;
  }

  /**
   * 사용자의 구독 조회
   */
  getUserSubscription(platform: string, userId: string): UserSubscription | undefined {
    const id = this.generateSubscriptionId(platform, userId);
    return this.subscriptions.get(id);
  }

  /**
   * 플랫폼별 구독 목록 조회
   */
  getSubscriptionsByPlatform(platform: string): UserSubscription[] {
    const subscriptionIds = this.platformIndex.get(platform) || new Set();
    return Array.from(subscriptionIds)
      .map(id => this.subscriptions.get(id))
      .filter((sub): sub is UserSubscription => sub !== undefined && sub.enabled);
  }

  /**
   * 특정 지역에 관심있는 구독자 조회
   */
  getSubscriptionsForRegion(regionId: string, platform?: string): UserSubscription[] {
    const allSubscriptions = platform 
      ? this.getSubscriptionsByPlatform(platform)
      : Array.from(this.subscriptions.values()).filter(sub => sub.enabled);

    return allSubscriptions.filter(sub => 
      sub.targetRegions.length === 0 || // 빈 배열 = 전체 지역
      sub.targetRegions.includes(regionId)
    );
  }

  /**
   * 특정 특보에 관심있는 구독자 조회 및 필터링
   */
  getRelevantSubscriptions(alert: WeatherAlert): UserSubscription[] {
    const regionId = alert.REG_ID;
    const warningType = alert.WRN;
    const level = alert.LVL;

    return Array.from(this.subscriptions.values())
      .filter(sub => sub.enabled)
      .filter(sub => {
        // 지역 필터링
        const regionMatch = sub.targetRegions.length === 0 || sub.targetRegions.includes(regionId);
        if (!regionMatch) return false;

        // 특보 종류 필터링
        const typeMatch = !sub.warningTypes || sub.warningTypes.length === 0 || sub.warningTypes.includes(warningType);
        if (!typeMatch) return false;

        // 최소 수준 필터링
        const minLevel = sub.preferences?.minLevel;
        if (minLevel && level < minLevel) return false;

        // 조용한 시간대 필터링
        if (this.isQuietHours(sub)) return false;

        return true;
      });
  }

  /**
   * 특보 변동에 관심있는 구독자 조회
   */
  getRelevantSubscriptionsForChange(change: AlertChange): UserSubscription[] {
    const alert = change.current || change.previous!;
    return this.getRelevantSubscriptions({
      REG_ID: alert.regionId,
      WRN: alert.warningType,
      LVL: alert.level,
      REG_NAME: alert.regionName,
      TM_FC: alert.announcedAt,
      TM_EF: alert.effectiveAt,
      TM_IN: '',
      STN: '',
      CMD: alert.command,
      GRD: '',
      CNT: '',
      RPT: '',
      TM_ST: '',
      TM_ED: '',
      REG_SP: '',
      REG_UP: '',
      REG_KO: '',
      REG_UP_KO: '',
      STN_ID: '',
      TM_SEQ: '',
      MAN_FC: '',
      MAN_IN: ''
    });
  }

  /**
   * 전체 구독 통계
   */
  getStatistics(): {
    totalSubscriptions: number;
    activeSubscriptions: number;
    platformBreakdown: Record<string, number>;
    regionBreakdown: Record<string, number>;
  } {
    const allSubs = Array.from(this.subscriptions.values());
    const activeSubs = allSubs.filter(sub => sub.enabled);

    const platformBreakdown: Record<string, number> = {};
    const regionBreakdown: Record<string, number> = {};

    for (const sub of activeSubs) {
      platformBreakdown[sub.platform] = (platformBreakdown[sub.platform] || 0) + 1;
      
      if (sub.targetRegions.length === 0) {
        regionBreakdown['전체'] = (regionBreakdown['전체'] || 0) + 1;
      } else {
        for (const region of sub.targetRegions) {
          regionBreakdown[region] = (regionBreakdown[region] || 0) + 1;
        }
      }
    }

    return {
      totalSubscriptions: allSubs.length,
      activeSubscriptions: activeSubs.length,
      platformBreakdown,
      regionBreakdown
    };
  }

  /**
   * 구독 데이터 내보내기 (백업/마이그레이션용)
   */
  exportSubscriptions(): UserSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * 구독 데이터 가져오기 (백업/마이그레이션용)
   */
  importSubscriptions(subscriptions: UserSubscription[]): void {
    this.subscriptions.clear();
    this.platformIndex.clear();

    for (const subscription of subscriptions) {
      this.subscriptions.set(subscription.id, subscription);
      
      if (!this.platformIndex.has(subscription.platform)) {
        this.platformIndex.set(subscription.platform, new Set());
      }
      this.platformIndex.get(subscription.platform)!.add(subscription.id);
    }

    logger.info(`구독 데이터 가져오기 완료: ${subscriptions.length}개`);
  }

  /**
   * 구독 ID 생성
   */
  private generateSubscriptionId(platform: string, userId: string): string {
    return `${platform}:${userId}`;
  }

  /**
   * 조용한 시간대 확인
   */
  private isQuietHours(subscription: UserSubscription): boolean {
    const quietHours = subscription.preferences?.quietHours;
    if (!quietHours) return false;

    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5); // 'HH:MM'

    const start = quietHours.start;
    const end = quietHours.end;

    // 같은 날 (예: 09:00 ~ 18:00)
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    }
    
    // 다음 날로 넘어가는 경우 (예: 22:00 ~ 08:00)
    return currentTime >= start || currentTime <= end;
  }
}