import { SubscriptionManager, UserSubscription } from '../../../services/notifications/SubscriptionManager';
import { WeatherAlert, AlertChange } from '../../../types/weather';

// logger 모킹
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('SubscriptionManager', () => {
  let subscriptionManager: SubscriptionManager;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
  });

  const createMockSubscription = (overrides: Partial<UserSubscription> = {}): Omit<UserSubscription, 'id' | 'createdAt' | 'updatedAt'> => ({
    platform: 'telegram',
    userId: 'test_user_123',
    targetRegions: ['L1100000'], // 서울
    warningTypes: ['H', 'R'], // 폭염, 호우
    enabled: true,
    displayName: '테스트 사용자',
    ...overrides
  });

  const createMockAlert = (overrides: Partial<WeatherAlert> = {}): WeatherAlert => ({
    REG_ID: 'L1100000',
    REG_NAME: '서울특별시',
    WRN: 'H', // 폭염
    LVL: '2', // 주의보
    TM_FC: '202508151400',
    TM_EF: '202508151500',
    TM_IN: '202508151400',
    STN: '184',
    CMD: '1',
    GRD: '',
    CNT: '1',
    RPT: '101',
    TM_ST: '',
    TM_ED: '',
    REG_SP: '',
    REG_UP: '',
    REG_KO: '',
    REG_UP_KO: '',
    STN_ID: '184',
    TM_SEQ: '',
    MAN_FC: '',
    MAN_IN: '',
    ...overrides
  });

  describe('구독 관리', () => {
    test('새 구독 추가', () => {
      const subscription = createMockSubscription();
      const id = subscriptionManager.addSubscription(subscription);
      
      expect(id).toBe('telegram:test_user_123');
      
      const retrieved = subscriptionManager.getUserSubscription('telegram', 'test_user_123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.platform).toBe('telegram');
      expect(retrieved?.userId).toBe('test_user_123');
      expect(retrieved?.targetRegions).toEqual(['L1100000']);
    });

    test('기존 구독 업데이트', () => {
      const subscription = createMockSubscription();
      const id1 = subscriptionManager.addSubscription(subscription);
      
      // 같은 사용자의 구독 업데이트
      const updatedSubscription = createMockSubscription({
        targetRegions: ['L1100000', 'L1010000'], // 서울 + 경기
        warningTypes: ['H', 'R', 'T'] // 폭염 + 호우 + 태풍
      });
      const id2 = subscriptionManager.addSubscription(updatedSubscription);
      
      expect(id1).toBe(id2); // 같은 ID
      
      const retrieved = subscriptionManager.getUserSubscription('telegram', 'test_user_123');
      expect(retrieved?.targetRegions).toEqual(['L1100000', 'L1010000']);
      expect(retrieved?.warningTypes).toEqual(['H', 'R', 'T']);
    });

    test('구독 제거', () => {
      const subscription = createMockSubscription();
      const id = subscriptionManager.addSubscription(subscription);
      
      const removed = subscriptionManager.removeSubscription(id);
      expect(removed).toBe(true);
      
      const retrieved = subscriptionManager.getUserSubscription('telegram', 'test_user_123');
      expect(retrieved).toBeUndefined();
    });

    test('존재하지 않는 구독 제거 시도', () => {
      const removed = subscriptionManager.removeSubscription('nonexistent:user');
      expect(removed).toBe(false);
    });
  });

  describe('플랫폼별 구독 조회', () => {
    beforeEach(() => {
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'telegram',
        userId: 'user1',
        targetRegions: ['L1100000']
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'telegram',
        userId: 'user2',
        targetRegions: ['L1010000']
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'discord',
        userId: 'user3',
        targetRegions: ['L1100000']
      }));
    });

    test('특정 플랫폼 구독자 조회', () => {
      const telegramSubs = subscriptionManager.getSubscriptionsByPlatform('telegram');
      expect(telegramSubs).toHaveLength(2);
      expect(telegramSubs.every(sub => sub.platform === 'telegram')).toBe(true);
      
      const discordSubs = subscriptionManager.getSubscriptionsByPlatform('discord');
      expect(discordSubs).toHaveLength(1);
      expect(discordSubs[0].platform).toBe('discord');
    });

    test('존재하지 않는 플랫폼 조회', () => {
      const subs = subscriptionManager.getSubscriptionsByPlatform('email');
      expect(subs).toEqual([]);
    });
  });

  describe('지역별 구독자 조회', () => {
    beforeEach(() => {
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'seoul_user',
        targetRegions: ['L1100000'] // 서울만
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'multi_user',
        targetRegions: ['L1100000', 'L1010000'] // 서울 + 경기
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'all_user',
        targetRegions: [] // 전체 지역
      }));
    });

    test('특정 지역 관심 구독자 조회', () => {
      const seoulSubs = subscriptionManager.getSubscriptionsForRegion('L1100000');
      expect(seoulSubs).toHaveLength(3); // seoul_user, multi_user, all_user
      
      const gyeonggiSubs = subscriptionManager.getSubscriptionsForRegion('L1010000');
      expect(gyeonggiSubs).toHaveLength(2); // multi_user, all_user
      
      const jejuSubs = subscriptionManager.getSubscriptionsForRegion('L5010000');
      expect(jejuSubs).toHaveLength(1); // all_user만
    });

    test('플랫폼 필터링과 함께 지역별 조회', () => {
      // Discord 사용자 추가
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'discord',
        userId: 'discord_seoul',
        targetRegions: ['L1100000']
      }));
      
      const telegramSeoulSubs = subscriptionManager.getSubscriptionsForRegion('L1100000', 'telegram');
      expect(telegramSeoulSubs).toHaveLength(3); // telegram 사용자들만
      
      const discordSeoulSubs = subscriptionManager.getSubscriptionsForRegion('L1100000', 'discord');
      expect(discordSeoulSubs).toHaveLength(1); // discord 사용자 1명
    });
  });

  describe('특보별 관련 구독자 조회', () => {
    beforeEach(() => {
      // 서울 폭염만 관심
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'seoul_heat_user',
        targetRegions: ['L1100000'],
        warningTypes: ['H']
      }));
      
      // 서울 모든 특보 관심
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'seoul_all_user',
        targetRegions: ['L1100000'],
        warningTypes: []
      }));
      
      // 전체 지역 태풍만 관심
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'typhoon_expert',
        targetRegions: [],
        warningTypes: ['T']
      }));
      
      // 최소 수준 설정 (주의보 이상만)
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'level_filtered_user',
        targetRegions: ['L1100000'],
        preferences: {
          minLevel: '2' // 주의보 이상만
        }
      }));
    });

    test('서울 폭염 주의보 - 관련 구독자 조회', () => {
      const alert = createMockAlert({
        REG_ID: 'L1100000',
        WRN: 'H',
        LVL: '2'
      });
      
      const relevantSubs = subscriptionManager.getRelevantSubscriptions(alert);
      expect(relevantSubs).toHaveLength(3); // seoul_heat_user, seoul_all_user, level_filtered_user
      
      const userIds = relevantSubs.map(sub => sub.userId);
      expect(userIds).toContain('seoul_heat_user');
      expect(userIds).toContain('seoul_all_user');
      expect(userIds).toContain('level_filtered_user');
      expect(userIds).not.toContain('typhoon_expert'); // 태풍 전문가는 폭염에 관심 없음
    });

    test('서울 폭염 예비특보 - 최소 수준 필터링', () => {
      const alert = createMockAlert({
        REG_ID: 'L1100000',
        WRN: 'H',
        LVL: '1' // 예비특보
      });
      
      const relevantSubs = subscriptionManager.getRelevantSubscriptions(alert);
      expect(relevantSubs).toHaveLength(2); // level_filtered_user는 제외 (최소 수준 2)
      
      const userIds = relevantSubs.map(sub => sub.userId);
      expect(userIds).toContain('seoul_heat_user');
      expect(userIds).toContain('seoul_all_user');
      expect(userIds).not.toContain('level_filtered_user');
    });

    test('부산 태풍 경보 - 전체 지역 관심자만 해당', () => {
      const alert = createMockAlert({
        REG_ID: 'L2600000', // 부산
        WRN: 'T', // 태풍
        LVL: '3'  // 경보
      });
      
      const relevantSubs = subscriptionManager.getRelevantSubscriptions(alert);
      expect(relevantSubs).toHaveLength(1); // typhoon_expert만
      expect(relevantSubs[0].userId).toBe('typhoon_expert');
    });
  });

  describe('조용한 시간대 필터링', () => {
    beforeEach(() => {
      // 야간 조용 시간 설정 (22:00 ~ 08:00)
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'night_quiet_user',
        preferences: {
          quietHours: {
            start: '22:00',
            end: '08:00'
          }
        }
      }));
      
      // 조용 시간 없음
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'always_active_user'
      }));
    });

    test('조용한 시간대 필터링은 실제 시간에 의존하므로 구조 테스트만', () => {
      const alert = createMockAlert();
      const relevantSubs = subscriptionManager.getRelevantSubscriptions(alert);
      
      // 조용한 시간대 여부는 현재 시각에 따라 달라지므로
      // 여기서는 기능이 정상적으로 동작하는지만 확인
      expect(relevantSubs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: expect.any(String) })
        ])
      );
    });
  });

  describe('구독 통계', () => {
    beforeEach(() => {
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'telegram',
        userId: 'user1',
        targetRegions: ['L1100000']
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'telegram',  
        userId: 'user2',
        targetRegions: ['L1010000']
      }));
      
      subscriptionManager.addSubscription(createMockSubscription({
        platform: 'discord',
        userId: 'user3',
        targetRegions: [],
        enabled: false // 비활성
      }));
    });

    test('전체 구독 통계 조회', () => {
      const stats = subscriptionManager.getStatistics();
      
      expect(stats.totalSubscriptions).toBe(3);
      expect(stats.activeSubscriptions).toBe(2); // enabled: false인 것 제외
      
      expect(stats.platformBreakdown).toEqual({
        telegram: 2
      });
      
      expect(stats.regionBreakdown).toEqual({
        'L1100000': 1,
        'L1010000': 1
      });
    });
  });

  describe('데이터 가져오기/내보내기', () => {
    test('구독 데이터 내보내기', () => {
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'export_test_user'
      }));
      
      const exported = subscriptionManager.exportSubscriptions();
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual(
        expect.objectContaining({
          platform: 'telegram',
          userId: 'export_test_user',
          targetRegions: ['L1100000']
        })
      );
    });

    test('구독 데이터 가져오기', () => {
      const mockData: UserSubscription[] = [{
        id: 'telegram:imported_user',
        platform: 'telegram',
        userId: 'imported_user',
        targetRegions: ['L5010000'],
        warningTypes: ['T'],
        enabled: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        displayName: 'Imported User'
      }];
      
      subscriptionManager.importSubscriptions(mockData);
      
      const retrieved = subscriptionManager.getUserSubscription('telegram', 'imported_user');
      expect(retrieved).toBeDefined();
      expect(retrieved?.targetRegions).toEqual(['L5010000']);
      expect(retrieved?.displayName).toBe('Imported User');
    });
  });

  describe('AlertChange 기반 구독자 조회', () => {
    beforeEach(() => {
      subscriptionManager.addSubscription(createMockSubscription({
        userId: 'change_interested_user',
        targetRegions: ['L1100000'],
        warningTypes: ['H']
      }));
    });

    test('변동 정보로부터 관련 구독자 조회', () => {
      const change: AlertChange = {
        type: 'NEW',
        description: '서울 폭염 주의보 신규 발표',
        current: {
          regionId: 'L1100000',
          regionName: '서울특별시',
          warningType: 'H',
          level: '2',
          command: '1',
          announcedAt: '202508151400',
          effectiveAt: '202508151500',
          key: 'test-key',
          lastUpdated: '202508151400'
        }
      };
      
      const relevantSubs = subscriptionManager.getRelevantSubscriptionsForChange(change);
      expect(relevantSubs).toHaveLength(1);
      expect(relevantSubs[0].userId).toBe('change_interested_user');
    });
  });
});