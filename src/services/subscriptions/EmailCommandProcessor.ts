/**
 * Email 명령어 프로세서
 * 
 * 이메일 Reply-to 기반 구독 관리 시스템
 */

import { SubscriptionManager, UserSubscription } from '../notifications/SubscriptionManager';
import { logger } from '../../utils/logger';
import {
  PlatformSubscriptionInterface,
  EmailCommandProcessor as IEmailCommandProcessor,
  SubscriptionCommandParams,
  SubscriptionCommandResult,
  UserAuthToken
} from './interfaces';
import { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from './CommandParser';
import { WebSubscriptionInterface } from './WebSubscriptionInterface';

/**
 * 이메일 템플릿 타입
 */
interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Email 구독 인터페이스 구현
 */
export class EmailCommandProcessor implements PlatformSubscriptionInterface, IEmailCommandProcessor {
  readonly platformName = 'email';

  private subscriptionManager: SubscriptionManager;
  private commandParser: CommonCommandParser;
  private smtpConfig?: any;
  private webInterface?: WebSubscriptionInterface;

  constructor(
    subscriptionManager: SubscriptionManager,
    smtpConfig?: any,
    webInterface?: WebSubscriptionInterface
  ) {
    this.subscriptionManager = subscriptionManager;
    this.commandParser = new CommonCommandParser();
    this.smtpConfig = smtpConfig;
    this.webInterface = webInterface;
    logger.info('Email 명령어 프로세서 초기화 완료');
  }

  /**
   * Email 명령어 처리 (Reply-to 방식)
   */
  async handleCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      // 명령어 유효성 검증
      if (!this.commandParser.validateCommand(params)) {
        return {
          success: false,
          message: '잘못된 명령어 형식입니다. 도움말을 확인하세요.',
          error: 'INVALID_COMMAND_FORMAT'
        };
      }

      logger.debug(`Email 명령어 처리: ${params.command} - ${params.args.join(' ')}`);

      // 명령어별 처리
      switch (params.command) {
        case 'subscribe':
          return await this.handleSubscribeCommand(params);
          
        case 'unsubscribe':
          return await this.handleUnsubscribeCommand(params);
          
        case 'status':
        case 'list':
          return await this.handleStatusCommand(params);
          
        case 'help':
          return await this.handleHelpCommand(params);
          
        default:
          return {
            success: false,
            message: '알 수 없는 명령어입니다. HELP를 입력하여 사용 가능한 명령어를 확인하세요.',
            error: 'UNKNOWN_COMMAND'
          };
      }

    } catch (error) {
      logger.error('Email 명령어 처리 중 오류:', error);
      return {
        success: false,
        message: '명령어 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * 이메일에서 명령어 추출
   */
  extractCommand(subject: string, body: string): SubscriptionCommandParams | null {
    try {
      // 제목에서 명령어 추출 시도
      let commandText = this.extractCommandFromSubject(subject);
      
      // 제목에서 찾지 못한 경우 본문에서 추출
      if (!commandText) {
        commandText = this.extractCommandFromBody(body);
      }

      if (!commandText) return null;

      // 이메일 주소에서 사용자 ID 추출 (실제로는 From 헤더에서 가져와야 함)
      const emailMatch = body.match(/From: ([^\s]+@[^\s]+)/i);
      const userId = emailMatch ? emailMatch[1] : 'unknown@email.com';

      // 명령어 파싱
      return this.commandParser.parseCommand(commandText, 'email', userId);

    } catch (error) {
      logger.warn('Email 명령어 추출 실패:', error);
      return null;
    }
  }

  /**
   * 명령어 실행 결과 이메일 생성
   */
  createResponseEmail(result: SubscriptionCommandResult, recipientEmail: string): EmailTemplate {
    const emoji = result.success ? '✅' : '❌';
    const status = result.success ? '성공' : '실패';
    
    const subject = `${emoji} 기상특보 구독 ${status}`;
    
    const text = `기상특보 구독 처리 결과\n\n` +
      `상태: ${status}\n` +
      `메시지: ${result.message}\n\n` +
      this.getEmailFooter();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>기상특보 구독 결과</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .result { padding: 15px; border-radius: 5px; margin: 20px 0; }
            .success { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .error { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .footer { padding: 20px; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${emoji} 기상특보 구독 ${status}</h1>
            </div>
            <div class="content">
              <div class="result ${result.success ? 'success' : 'error'}">
                <strong>처리 결과:</strong> ${result.message}
              </div>
              ${this.getHtmlHelpSection()}
            </div>
            <div class="footer">
              ${this.getEmailFooter()}
            </div>
          </div>
        </body>
      </html>
    `;

    return { subject, html, text };
  }

  /**
   * 구독 설정 확인 이메일 생성
   */
  async createConfirmationEmail(subscription: UserSubscription, recipientEmail: string): Promise<EmailTemplate> {
    const summary = this.commandParser.formatSubscriptionSummary(subscription);
    const webToken = await this.generateWebToken(recipientEmail);
    
    const subject = '✅ 기상특보 구독 설정 확인';
    
    const text = `기상특보 구독이 설정되었습니다.\n\n` +
      `구독 정보:\n${summary}\n\n` +
      `설정 변경은 웹 페이지에서 가능합니다:\n` +
      `https://weather.starryjeju.net/subscribe?token=${webToken}\n\n` +
      this.getEmailFooter();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>기상특보 구독 확인</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .subscription-info { padding: 15px; background-color: white; border-radius: 5px; margin: 20px 0; }
            .web-link { text-align: center; margin: 20px 0; }
            .btn { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
            .footer { padding: 20px; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ 구독 설정 완료</h1>
            </div>
            <div class="content">
              <div class="subscription-info">
                <h3>📋 현재 구독 정보</h3>
                <pre>${summary}</pre>
              </div>
              <div class="web-link">
                <p>더 자세한 설정은 웹 페이지에서 관리하세요:</p>
                <a href="https://weather.starryjeju.net/subscribe?token=${webToken}" class="btn">
                  🌐 웹에서 설정 관리
                </a>
              </div>
              ${this.getHtmlHelpSection()}
            </div>
            <div class="footer">
              ${this.getEmailFooter()}
            </div>
          </div>
        </body>
      </html>
    `;

    return { subject, html, text };
  }

  // PlatformSubscriptionInterface 구현

  async generateAuthToken(userId: string): Promise<UserAuthToken> {
    const token = await this.generateWebToken(userId);
    return {
      token,
      platform: 'email',
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간
      createdAt: new Date()
    };
  }

  async notifySubscriptionChange(userId: string, change: string): Promise<void> {
    try {
      if (this.smtpConfig) {
        // 실제 이메일 전송 로직 (Phase 2에서 구현)
        logger.info(`[Email] 구독 변경 알림 전송: ${userId} - ${change}`);
      } else {
        logger.info(`[Email] 구독 변경 알림 (Mock): ${userId} - ${change}`);
      }
    } catch (error) {
      logger.error('Email 구독 변경 알림 실패:', error);
    }
  }

  getHelpMessage(): string {
    return `📧 Email 기상특보 구독 도움말

📝 명령어 사용법:
이메일 제목에 명령어를 입력하거나, 본문 첫 줄에 작성하세요.

기본 명령어:
• SUBSCRIBE <지역> [특보종류] - 구독 추가
• UNSUBSCRIBE [지역] - 구독 해제  
• STATUS - 구독 현황 확인
• HELP - 도움말

🌍 지역: seoul, busan, jeju, all 등
⚠️ 특보: heat, rain, typhoon, all 등

📬 예시:
제목: "SUBSCRIBE seoul heat"
제목: "STATUS"
제목: "UNSUBSCRIBE"

🌐 웹 설정: 더 자세한 설정은 웹 페이지에서 가능합니다.
토큰을 받으려면 STATUS 명령어를 사용하세요.`;
  }

  // Private helper methods

  private async handleSubscribeCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    if (params.args.length < 1) {
      return {
        success: false,
        message: '지역을 지정해주세요.\n예시: SUBSCRIBE seoul heat',
        error: 'MISSING_REGION'
      };
    }

    // 지역 파싱
    const regionInfo = this.commandParser.parseRegion(params.args[0]);
    if (!regionInfo) {
      const availableRegions = Object.values(REGION_MAPPINGS).map(m => m.aliases[0]).slice(0, 10).join(', ');
      return {
        success: false,
        message: `잘못된 지역명입니다: ${params.args[0]}\n사용 가능한 지역: ${availableRegions}`,
        error: 'INVALID_REGION'
      };
    }

    // 특보 종류 파싱
    let warningTypes: string[] = [];
    if (params.args.length > 1) {
      for (let i = 1; i < params.args.length; i++) {
        const warningInfo = this.commandParser.parseWarningType(params.args[i]);
        if (warningInfo) {
          if (warningInfo.code === '') {
            warningTypes = [];
            break;
          }
          warningTypes.push(warningInfo.code);
        }
      }
    }

    // 기존 구독 정보 조회 및 업데이트
    const existingSubscription = this.subscriptionManager.getUserSubscription('email', params.userId);
    const currentRegions = existingSubscription?.targetRegions || [];
    const newRegions = regionInfo.code === '' 
      ? [] 
      : [...new Set([...currentRegions, regionInfo.code])];

    const currentWarningTypes = existingSubscription?.warningTypes || [];
    const newWarningTypes = warningTypes.length === 0 
      ? [] 
      : [...new Set([...currentWarningTypes, ...warningTypes])];

    try {
      this.subscriptionManager.addSubscription({
        platform: 'email',
        userId: params.userId,
        targetRegions: newRegions,
        warningTypes: newWarningTypes,
        enabled: true,
        displayName: existingSubscription?.displayName || `Email 사용자 ${params.userId.split('@')[0]}`
      });

      const regionName = regionInfo.code === '' ? '전국' : regionInfo.name;
      const warningName = warningTypes.length === 0 ? '모든 특보' : 
        warningTypes.map(code => this.getWarningTypeName(code)).join(', ');

      return {
        success: true,
        message: `✅ 구독이 추가되었습니다!\n📍 지역: ${regionName}\n⚠️ 특보: ${warningName}\n\n웹 설정 토큰을 받으려면 STATUS 명령어를 사용하세요.`
      };

    } catch (error) {
      logger.error('Email 구독 추가 실패:', error);
      return {
        success: false,
        message: '구독 추가 중 오류가 발생했습니다.',
        error: 'SUBSCRIPTION_ADD_FAILED'
      };
    }
  }

  private async handleUnsubscribeCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    const existingSubscription = this.subscriptionManager.getUserSubscription('email', params.userId);
    
    if (!existingSubscription) {
      return {
        success: false,
        message: '구독 중인 알림이 없습니다.',
        error: 'NO_SUBSCRIPTION'
      };
    }

    try {
      // 전체 해제
      if (params.args.length === 0) {
        this.subscriptionManager.removeSubscription(existingSubscription.id);
        return {
          success: true,
          message: '✅ 모든 구독이 해제되었습니다.'
        };
      }

      // 특정 지역 해제
      const regionInfo = this.commandParser.parseRegion(params.args[0]);
      if (!regionInfo) {
        return {
          success: false,
          message: `잘못된 지역명입니다: ${params.args[0]}`,
          error: 'INVALID_REGION'
        };
      }

      const currentRegions = existingSubscription.targetRegions || [];
      const newRegions = currentRegions.filter(region => region !== regionInfo.code);

      if (newRegions.length === 0) {
        this.subscriptionManager.removeSubscription(existingSubscription.id);
        return {
          success: true,
          message: `✅ ${regionInfo.name} 지역 구독이 해제되어 모든 구독이 제거되었습니다.`
        };
      }

      this.subscriptionManager.addSubscription({
        ...existingSubscription,
        targetRegions: newRegions
      });

      return {
        success: true,
        message: `✅ ${regionInfo.name} 지역 구독이 해제되었습니다.`
      };

    } catch (error) {
      logger.error('Email 구독 해제 실패:', error);
      return {
        success: false,
        message: '구독 해제 중 오류가 발생했습니다.',
        error: 'UNSUBSCRIBE_FAILED'
      };
    }
  }

  private async handleStatusCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    try {
      const stats = this.subscriptionManager.getStatistics();
      const userSubscription = this.subscriptionManager.getUserSubscription('email', params.userId);
      const webToken = await this.generateWebToken(params.userId);
      
      let message = `📊 기상특보 구독 현황\n\n` +
        `👥 전체 구독자: ${stats.totalSubscriptions}명\n` +
        `✅ 활성 구독자: ${stats.activeSubscriptions}명\n` +
        `📧 Email 사용자: ${stats.platformBreakdown.email || 0}명\n\n`;

      if (userSubscription) {
        const summary = this.commandParser.formatSubscriptionSummary(userSubscription);
        message += `📋 내 구독 정보:\n${summary}\n\n`;
      } else {
        message += `❌ 구독 중인 알림이 없습니다.\n\n`;
      }

      message += `🌐 웹에서 상세 설정:\n` +
        `https://weather.starryjeju.net/subscribe?token=${webToken}\n\n` +
        `토큰: ${webToken.substring(0, 20)}... (24시간 유효)`;

      return {
        success: true,
        message
      };

    } catch (error) {
      logger.error('Email 상태 확인 실패:', error);
      return {
        success: false,
        message: '상태 확인 중 오류가 발생했습니다.',
        error: 'STATUS_FAILED'
      };
    }
  }

  private async handleHelpCommand(params: SubscriptionCommandParams): Promise<SubscriptionCommandResult> {
    return {
      success: true,
      message: this.getHelpMessage()
    };
  }

  private extractCommandFromSubject(subject: string): string | null {
    // "Re: 기상특보 - SUBSCRIBE seoul heat" 형식에서 명령어 추출
    const rePattern = /Re:\s*기상특보.*?-\s*(.+)$/i;
    const directPattern = /^(SUBSCRIBE|UNSUBSCRIBE|STATUS|HELP)\b/i;
    
    let match = subject.match(rePattern);
    if (match) return match[1].trim();
    
    match = subject.match(directPattern);
    if (match) return subject.trim();
    
    return null;
  }

  private extractCommandFromBody(body: string): string | null {
    // 본문 첫 줄에서 명령어 추출
    const lines = body.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return null;
    
    const firstLine = lines[0];
    const commandPattern = /^(SUBSCRIBE|UNSUBSCRIBE|STATUS|HELP)\b/i;
    
    if (commandPattern.test(firstLine)) {
      return firstLine;
    }
    
    return null;
  }

  private getEmailFooter(): string {
    return `---\n` +
      `한국 기상청 기상특보 알림 시스템\n` +
      `이 이메일은 자동 생성되었습니다.\n` +
      `문의사항: admin@starryjeju.net\n` +
      `웹사이트: https://weather.starryjeju.net`;
  }

  private getHtmlHelpSection(): string {
    return `
      <div style="margin-top: 30px; padding: 15px; background-color: white; border-radius: 5px;">
        <h3>📧 Email 명령어 사용법</h3>
        <p>이메일 제목 또는 본문 첫 줄에 명령어를 입력하세요:</p>
        <ul>
          <li><strong>SUBSCRIBE seoul heat</strong> - 서울 폭염 알림 구독</li>
          <li><strong>UNSUBSCRIBE seoul</strong> - 서울 알림 해제</li>
          <li><strong>STATUS</strong> - 구독 현황 및 웹 토큰 확인</li>
          <li><strong>HELP</strong> - 이 도움말</li>
        </ul>
      </div>
    `;
  }

  private getWarningTypeName(code: string): string {
    const warning = Object.values(WARNING_TYPE_MAPPINGS).find(w => w.code === code);
    return warning ? warning.name : code;
  }

  private async generateWebToken(userId: string): Promise<string> {
    // WebSubscriptionInterface가 있으면 데이터베이스 기반 토큰 생성
    if (this.webInterface) {
      try {
        const subscription = this.subscriptionManager.getUserSubscription('email', userId);
        const displayName = subscription?.displayName || userId;

        const tokenInfo = await this.webInterface.generateAccessToken('email', userId, displayName);
        logger.info(`Email 웹 토큰 생성 (DB): ${userId}`);
        return tokenInfo.token;
      } catch (error) {
        logger.error('데이터베이스 토큰 생성 실패, 폴백 사용:', error);
        // 실패 시 폴백
      }
    }

    // 폴백: 임시 토큰 생성 (하위 호환성)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const userHash = this.hashUserId(userId);

    return `EM_${timestamp}_${userHash}_${random}`;
  }

  private hashUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}