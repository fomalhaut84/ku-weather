/**
 * 개별 사용자 구독 시스템 사용 예시
 * 
 * 이 파일은 새로운 구독 기반 알림 시스템의 사용법을 보여줍니다.
 * 실제 운영에서는 이런 방식으로 사용자별 맞춤 알림을 설정할 수 있습니다.
 */

import { MultiplatformNotificationService } from '../services/notifications/MultiplatformNotificationService';
import { NotificationFactory } from '../services/notifications/NotificationFactory';
import { SubscriptionManager } from '../services/notifications/SubscriptionManager';
import { logger } from '../utils/logger';

/**
 * 구독 시스템 데모
 */
export class SubscriptionDemo {
  private notificationService: MultiplatformNotificationService;
  private subscriptionManager: SubscriptionManager;

  constructor() {
    // 1. 일반적인 다중 플랫폼 서비스 생성 (기존 방식)
    this.notificationService = NotificationFactory.createMultiplatformService({
      platforms: ['slack'], // 현재 Phase 1에서는 Slack만 지원
      environment: 'development',
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
        batchMode: true
      }
    });

    // 2. 구독 매니저 가져오기
    this.subscriptionManager = this.notificationService.getSubscriptionManager();
  }

  /**
   * 사용자별 맞춤 구독 설정 예시
   */
  setupUserSubscriptions() {
    logger.info('=== 사용자별 맞춤 구독 설정 시작 ===');

    // 사용자 A: 서울+경기 지역의 폭염, 호우만 관심
    this.notificationService.addSubscription(
      'telegram',                           // 플랫폼
      'user_a_chat_id',                    // Telegram Chat ID  
      ['L1100000', 'L1010000'],            // 서울, 경기
      {
        warningTypes: ['H', 'R'],          // 폭염, 호우만
        displayName: '사용자 A (직장인)',
        preferences: {
          quietHours: { start: '22:00', end: '08:00' },  // 밤 10시~아침 8시 조용
          minLevel: '2',                                  // 주의보 이상만
          batchMode: false                                // 개별 알림 선호
        }
      }
    );

    // 사용자 B: 제주도 전체 특보 관심 (여행객)
    this.notificationService.addSubscription(
      'telegram',
      'user_b_chat_id',
      ['L5010000'],                        // 제주도
      {
        displayName: '사용자 B (여행객)',
        preferences: {
          minLevel: '1'                     // 예비특보부터 모두 받기
        }
      }
    );

    // 사용자 C: 전국 태풍 정보 관심 (기상 전문가)
    this.notificationService.addSubscription(
      'email',
      'expert@weather.com',
      [],                                  // 빈 배열 = 전국
      {
        warningTypes: ['T'],               // 태풍만
        displayName: '기상 전문가 C',
        preferences: {
          batchMode: true                  // 배치 알림으로 받기
        }
      }
    );

    // 사용자 D: 회사 Slack 채널 관리자 (부산, 대구, 울산 지역)
    this.notificationService.addSubscription(
      'slack',
      '#busan-weather',                    // Slack 채널
      ['L2600000', 'L2700000', 'L3100000'], // 부산, 대구, 울산
      {
        displayName: '부산 사무소 알림봇',
        preferences: {
          minLevel: '2'                    // 주의보 이상만
        }
      }
    );

    logger.info('사용자별 구독 설정 완료');
  }

  /**
   * 실제 특보 발생 시뮬레이션
   */
  async simulateWeatherAlert() {
    logger.info('=== 특보 발생 시뮬레이션 ===');

    // 서울 폭염 주의보 발생 (사용자 A가 관심있어 함)
    const seoulHeatAlert = {
      REG_ID: 'L1100000',
      REG_NAME: '서울특별시',
      WRN: 'H',          // 폭염
      LVL: '2',          // 주의보
      TM_FC: '202508151400',
      TM_EF: '202508151500',
      TM_IN: '202508151400',
      STN: '184',
      CMD: '1',          // 발표
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
      MAN_IN: ''
    };

    logger.info('서울 폭염 주의보 발생 - 구독 기반 알림 전송');
    const results = await this.notificationService.sendAlertToSubscriptions(seoulHeatAlert);
    
    logger.info(`알림 전송 결과: ${results.length}건`);
    results.forEach(result => {
      logger.info(`  - ${result.platform}/${result.userId}: ${result.success ? '성공' : '실패 (' + result.error + ')'}`);
    });

    // 제주도 태풍 경보 발생 (사용자 B, C가 관심있어 함)  
    const jejuTyphoonAlert = {
      REG_ID: 'L5010000',
      REG_NAME: '제주특별자치도',
      WRN: 'T',          // 태풍
      LVL: '3',          // 경보
      TM_FC: '202508151500',
      TM_EF: '202508151600',
      TM_IN: '202508151500',
      STN: '184',
      CMD: '1',          // 발표
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
      MAN_IN: ''
    };

    logger.info('제주도 태풍 경보 발생 - 구독 기반 알림 전송');
    const jejuResults = await this.notificationService.sendAlertToSubscriptions(jejuTyphoonAlert);
    
    logger.info(`알림 전송 결과: ${jejuResults.length}건`);
    jejuResults.forEach(result => {
      logger.info(`  - ${result.platform}/${result.userId}: ${result.success ? '성공' : '실패 (' + result.error + ')'}`);
    });
  }

  /**
   * 구독 통계 조회 예시
   */
  showSubscriptionStatistics() {
    logger.info('=== 구독 통계 ===');
    
    const stats = this.notificationService.getSubscriptionStatistics();
    
    logger.info(`총 구독자: ${stats.totalSubscriptions}명`);
    logger.info(`활성 구독자: ${stats.activeSubscriptions}명`);
    
    logger.info('플랫폼별 구독자:');
    Object.entries(stats.platformBreakdown).forEach(([platform, count]) => {
      logger.info(`  - ${platform}: ${count}명`);
    });
    
    logger.info('지역별 관심도:');
    Object.entries(stats.regionBreakdown).forEach(([region, count]) => {
      logger.info(`  - ${region}: ${count}명`);
    });
  }

  /**
   * 동적 구독 관리 예시
   */
  manageDynamicSubscriptions() {
    logger.info('=== 동적 구독 관리 ===');

    // 특정 사용자 구독 조회
    const userA = this.subscriptionManager.getUserSubscription('telegram', 'user_a_chat_id');
    if (userA) {
      logger.info(`사용자 A 구독 정보:`, {
        관심지역: userA.targetRegions.length,
        관심특보: userA.warningTypes?.length || '전체',
        생성일: userA.createdAt.toISOString()
      });
    }

    // 특정 지역에 관심있는 사용자 조회
    const seoulSubscribers = this.subscriptionManager.getSubscriptionsForRegion('L1100000');
    logger.info(`서울에 관심있는 구독자: ${seoulSubscribers.length}명`);

    // 사용자의 관심 지역 업데이트 (여행 등으로 인해)
    this.notificationService.addSubscription(
      'telegram',
      'user_a_chat_id',
      ['L1100000', 'L1010000', 'L5010000'], // 서울+경기+제주로 확대
      {
        warningTypes: ['H', 'R', 'T'],       // 폭염+호우+태풍으로 확대
        displayName: '사용자 A (여행 중)'
      }
    );

    logger.info('사용자 A 구독 정보 업데이트 완료');
  }

  /**
   * 전체 데모 실행
   */
  async runDemo() {
    logger.info('🌦️ 개별 사용자 구독 시스템 데모 시작');
    
    try {
      // 1. 사용자별 구독 설정
      this.setupUserSubscriptions();
      
      // 2. 구독 통계 확인
      this.showSubscriptionStatistics();
      
      // 3. 특보 발생 시뮬레이션
      await this.simulateWeatherAlert();
      
      // 4. 동적 구독 관리
      this.manageDynamicSubscriptions();
      
      logger.info('🎉 데모 완료! 구독 시스템이 성공적으로 작동합니다.');
      
    } catch (error) {
      logger.error('데모 실행 중 오류:', error);
    }
  }
}

/**
 * 데모 실행 함수
 */
export async function runSubscriptionDemo() {
  const demo = new SubscriptionDemo();
  await demo.runDemo();
}

// 직접 실행 시 데모 시작
if (require.main === module) {
  runSubscriptionDemo().catch(console.error);
}