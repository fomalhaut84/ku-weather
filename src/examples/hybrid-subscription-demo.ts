/**
 * 하이브리드 구독 관리 시스템 사용 예시
 * 
 * 모든 플랫폼별 최적화된 구독 관리 방식을 보여주는 통합 데모
 */

import { MultiplatformNotificationService } from '../services/notifications/MultiplatformNotificationService';
import { NotificationFactory } from '../services/notifications/NotificationFactory';
import {
  HybridSubscriptionManager,
  TelegramSubscriptionInterface,
  SlackInteractiveInterface,
  EmailCommandProcessor,
  WebSubscriptionInterface
} from '../services/subscriptions';
import { TokenService } from '../services/TokenService';
import { databaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

/**
 * 하이브리드 구독 시스템 통합 데모
 */
export class HybridSubscriptionDemo {
  private notificationService: MultiplatformNotificationService;
  private hybridManager: HybridSubscriptionManager;

  constructor() {
    // 1. 기존 다중 플랫폼 서비스 생성
    this.notificationService = NotificationFactory.createMultiplatformService({
      platforms: ['slack'], // Phase 1: Slack만 지원
      environment: 'development',
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
        batchMode: true
      }
    });

    // 2. 하이브리드 구독 관리 시스템 초기화
    this.hybridManager = new HybridSubscriptionManager(
      this.notificationService.getSubscriptionManager()
    );

    this.setupPlatformInterfaces();
  }

  /**
   * 플랫폼별 구독 인터페이스 설정
   */
  private setupPlatformInterfaces() {
    const subscriptionManager = this.notificationService.getSubscriptionManager();

    // Telegram Bot 인터페이스 등록
    const telegramInterface = new TelegramSubscriptionInterface(
      subscriptionManager,
      process.env.TELEGRAM_BOT_TOKEN
    );
    this.hybridManager.registerPlatformInterface('telegram', telegramInterface);

    // Slack 인터랙티브 메시지 인터페이스 등록
    const slackInterface = new SlackInteractiveInterface(
      subscriptionManager,
      process.env.SLACK_WEBHOOK_URL
    );
    this.hybridManager.registerPlatformInterface('slack', slackInterface);

    // Email 명령어 프로세서 등록
    const emailInterface = new EmailCommandProcessor(
      subscriptionManager,
      {
        host: process.env.EMAIL_SMTP_HOST,
        port: process.env.EMAIL_SMTP_PORT,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      }
    );
    this.hybridManager.registerPlatformInterface('email', emailInterface);

    // 웹 인터페이스 등록
    const prisma = databaseService.getPrismaClient();
    const tokenService = new TokenService(prisma);
    const webInterface = new WebSubscriptionInterface(subscriptionManager, tokenService);
    this.hybridManager.registerWebInterface(webInterface);

    logger.info('모든 플랫폼별 구독 인터페이스 등록 완료');
  }

  /**
   * Telegram Bot 명령어 시뮬레이션
   */
  async demonstrateTelegramCommands() {
    logger.info('=== Telegram Bot 명령어 데모 ===');

    const telegramCommands = [
      { command: 'subscribe' as const, platform: 'telegram', userId: 'telegram_user_123', args: ['seoul', 'heat'] },
      { command: 'subscribe' as const, platform: 'telegram', userId: 'telegram_user_456', args: ['busan', 'rain'] },
      { command: 'quiet' as const, platform: 'telegram', userId: 'telegram_user_123', args: ['22:00', '08:00'] },
      { command: 'list' as const, platform: 'telegram', userId: 'telegram_user_123', args: [] },
      { command: 'status' as const, platform: 'telegram', userId: 'telegram_user_456', args: [] }
    ];

    for (const cmd of telegramCommands) {
      logger.info(`🤖 Telegram 명령어: /${cmd.command} ${cmd.args.join(' ')}`);
      
      const result = await this.hybridManager.processCommand(cmd);
      logger.info(`결과: ${result.success ? '성공' : '실패'} - ${result.message}`);
      
      await this.delay(1000); // 1초 대기
    }
  }

  /**
   * Email 명령어 시뮬레이션
   */
  async demonstrateEmailCommands() {
    logger.info('=== Email 명령어 데모 ===');

    const emailCommands = [
      { command: 'subscribe' as const, platform: 'email', userId: 'user1@example.com', args: ['jeju', 'typhoon'] },
      { command: 'subscribe' as const, platform: 'email', userId: 'user2@example.com', args: ['all'] },
      { command: 'status' as const, platform: 'email', userId: 'user1@example.com', args: [] },
      { command: 'unsubscribe' as const, platform: 'email', userId: 'user2@example.com', args: ['jeju'] }
    ];

    for (const cmd of emailCommands) {
      logger.info(`📧 Email 명령어: ${cmd.command.toUpperCase()} ${cmd.args.join(' ')}`);
      
      const result = await this.hybridManager.processCommand(cmd);
      logger.info(`결과: ${result.success ? '성공' : '실패'} - ${result.message}`);
      
      await this.delay(1000);
    }
  }

  /**
   * 웹 토큰 기반 구독 관리 시뮬레이션
   */
  async demonstrateWebInterface() {
    logger.info('=== 웹 인터페이스 데모 ===');

    // 1. 사용자 토큰 생성 (Telegram에서 생성됨)
    const telegramToken = await this.hybridManager.generateUserToken('telegram', 'web_demo_user');
    logger.info(`🔑 웹 토큰 생성: ${telegramToken.token.substring(0, 20)}...`);

    // 2. 웹 인터페이스를 통한 구독 설정 업데이트
    const webInterface = this.hybridManager['webInterface'];
    if (webInterface) {
      // 3. 웹에서 구독 설정 업데이트
      const updateResult = await webInterface.updateSubscription(telegramToken.token, {
        targetRegions: ['L1100000', 'L5010000'], // 서울 + 제주
        warningTypes: ['H', 'T'], // 폭염 + 태풍
        preferences: {
          quietHours: { start: '23:00', end: '07:00' },
          minLevel: '2'
        }
      });
      
      logger.info(`웹 구독 업데이트: ${updateResult.success ? '성공' : '실패'} - ${updateResult.message}`);
      
      // 4. 구독 현황 조회
      const subscriptions = await webInterface.getUserSubscriptions(telegramToken.token);
      logger.info(`웹 구독 현황: ${subscriptions.length}개 구독`);
      
      // 5. 구독 통계 조회
      const stats = await webInterface.getSubscriptionStats(telegramToken.token) as Record<string, Record<string, unknown>> | null;
      logger.info(`웹 구독 통계:`, {
        전체구독자: stats?.overall?.totalSubscriptions,
        사용자구독: stats?.user?.hasSubscription
      });
    }
  }

  /**
   * 실제 특보 발생 시뮬레이션 (하이브리드 구독 적용)
   */
  async simulateHybridAlertNotification() {
    logger.info('=== 하이브리드 구독 알림 시뮬레이션 ===');

    // 서울 폭염 주의보 발생
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

    logger.info('서울 폭염 주의보 발표 - 하이브리드 구독 알림 전송');
    
    // 구독 기반 알림 전송
    const results = await this.notificationService.sendAlertToSubscriptions(seoulHeatAlert);
    
    logger.info(`구독 알림 전송 결과: ${results.length}건`);
    results.forEach(result => {
      logger.info(`  - ${result.platform}/${result.userId}: ${result.success ? '성공' : '실패 (' + result.error + ')'}`)
    });

    // 제주 태풍 경보 발생
    const jejuTyphoonAlert = {
      ...seoulHeatAlert,
      REG_ID: 'L5010000',
      REG_NAME: '제주특별자치도',
      WRN: 'T',          // 태풍
      LVL: '3'           // 경보
    };

    logger.info('제주 태풍 경보 발표 - 하이브리드 구독 알림 전송');
    const jejuResults = await this.notificationService.sendAlertToSubscriptions(jejuTyphoonAlert);
    
    logger.info(`구독 알림 전송 결과: ${jejuResults.length}건`);
    jejuResults.forEach(result => {
      logger.info(`  - ${result.platform}/${result.userId}: ${result.success ? '성공' : '실패 (' + result.error + ')'}`)
    });
  }

  /**
   * 플랫폼별 구독 통계 시뮬레이션
   */
  async demonstrateSubscriptionAnalytics() {
    logger.info('=== 하이브리드 구독 통계 분석 ===');

    try {
      const platformStats = await this.hybridManager.getPlatformStats();
      
      logger.info('📊 전체 구독 통계:');
      logger.info(`  - 총 구독자: ${platformStats.overall.totalSubscriptions}명`);
      logger.info(`  - 활성 구독자: ${platformStats.overall.activeSubscriptions}명`);
      
      logger.info('📱 플랫폼별 구독 현황:');
      Object.entries(platformStats.platforms).forEach(([platform, stats]: [string, any]) => {
        logger.info(`  - ${platform}: ${stats.totalSubscriptions}명 (활성: ${stats.activeSubscriptions}명)`);
      });
      
      logger.info('🔧 인터페이스 현황:');
      logger.info(`  - 등록된 플랫폼: ${platformStats.interfaces.registered.join(', ')}`);
      logger.info(`  - 웹 인터페이스: ${platformStats.interfaces.webEnabled ? '활성' : '비활성'}`);
      
    } catch (error) {
      logger.error('구독 통계 조회 실패:', error);
    }
  }

  /**
   * 플랫폼별 도움말 시뮬레이션
   */
  async demonstratePlatformHelp() {
    logger.info('=== 플랫폼별 도움말 데모 ===');

    const platforms = this.hybridManager.getRegisteredPlatforms();
    
    for (const platform of platforms) {
      logger.info(`\n📖 ${platform.toUpperCase()} 도움말:`);
      const helpMessage = await this.hybridManager.getHelpMessage(platform);
      logger.info(helpMessage);
    }
  }

  /**
   * 전체 하이브리드 데모 실행
   */
  async runDemo() {
    logger.info('🌈 하이브리드 구독 관리 시스템 데모 시작');
    
    try {
      // 1. Telegram Bot 명령어 데모
      await this.demonstrateTelegramCommands();
      await this.delay(2000);
      
      // 2. Email 명령어 데모
      await this.demonstrateEmailCommands();
      await this.delay(2000);
      
      // 3. 웹 인터페이스 데모
      await this.demonstrateWebInterface();
      await this.delay(2000);
      
      // 4. 실제 특보 알림 시뮬레이션
      await this.simulateHybridAlertNotification();
      await this.delay(2000);
      
      // 5. 구독 통계 분석
      await this.demonstrateSubscriptionAnalytics();
      await this.delay(2000);
      
      // 6. 플랫폼별 도움말
      await this.demonstratePlatformHelp();
      
      logger.info('🎉 하이브리드 구독 시스템 데모 완료!');
      logger.info('📈 각 플랫폼별 최적화된 구독 관리가 성공적으로 구현되었습니다.');
      
    } catch (error) {
      logger.error('하이브리드 데모 실행 중 오류:', error);
    }
  }

  /**
   * 실사용 예시: Express.js 라우터 연동 코드
   */
  getExpressRouterExample(): string {
    return `
// Express.js 라우터 연동 예시
import express from 'express';
import { HybridSubscriptionDemo } from './hybrid-subscription-demo';

const router = express.Router();
const hybridDemo = new HybridSubscriptionDemo();
const hybridManager = hybridDemo['hybridManager'];

// Telegram Bot Webhook
router.post('/webhook/telegram', async (req, res) => {
  const { message } = req.body;
  if (message && message.text.startsWith('/')) {
    const params = {
      command: message.text.substring(1).split(' ')[0] as any,
      platform: 'telegram',
      userId: message.from.id.toString(),
      args: message.text.split(' ').slice(1),
      rawMessage: message.text
    };
    
    const result = await hybridManager.processCommand(params);
    
    // Telegram Bot API로 응답 전송
    // await sendTelegramMessage(message.chat.id, result.message);
  }
  
  res.sendStatus(200);
});

// Slack Interactive Components
router.post('/webhook/slack', async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const slackInterface = hybridManager['platformInterfaces'].get('slack');
  
  if (slackInterface && 'handleButtonAction' in slackInterface) {
    const result = await slackInterface.handleButtonAction(payload);
    res.json(result);
  } else {
    res.sendStatus(400);
  }
});

// Email Webhook (메일 서버 연동)
router.post('/webhook/email', async (req, res) => {
  const { subject, body, from } = req.body;
  const emailInterface = hybridManager['platformInterfaces'].get('email');
  
  if (emailInterface && 'extractCommand' in emailInterface) {
    const commandParams = emailInterface.extractCommand(subject, body);
    if (commandParams) {
      commandParams.userId = from;
      const result = await hybridManager.processCommand(commandParams);
      
      // SMTP로 응답 이메일 전송
      const responseEmail = emailInterface.createResponseEmail(result, from);
      // await sendEmail(from, responseEmail);
    }
  }
  
  res.sendStatus(200);
});

// Web API Endpoints
router.get('/api/subscription/:token', async (req, res) => {
  const { token } = req.params;
  const webInterface = hybridManager['webInterface'];
  
  if (webInterface) {
    const subscription = await webInterface.authenticateWithToken(token);
    res.json(subscription);
  } else {
    res.status(404).json({ error: 'Web interface not available' });
  }
});

router.put('/api/subscription/:token', async (req, res) => {
  const { token } = req.params;
  const updateRequest = req.body;
  const webInterface = hybridManager['webInterface'];
  
  if (webInterface) {
    const result = await webInterface.updateSubscription(token, updateRequest);
    res.json(result);
  } else {
    res.status(404).json({ error: 'Web interface not available' });
  }
});

export default router;
`;
  }

  // Private helper methods
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 하이브리드 구독 데모 실행 함수
 */
export async function runHybridSubscriptionDemo() {
  const demo = new HybridSubscriptionDemo();
  await demo.runDemo();
}

// 직접 실행 시 데모 시작
if (require.main === module) {
  runHybridSubscriptionDemo().catch(console.error);
}