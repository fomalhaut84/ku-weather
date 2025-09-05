import { WeatherAlert, AlertChange, AlertChangeType } from '../../types/weather';
import { logger } from '../../utils/logger';
import { NotificationService, NotificationResult, SlackConfig } from './interfaces';

/**
 * Slack 알림 서비스
 * 
 * 기존 SlackService 로직을 NotificationService 인터페이스에 맞게 리팩토링
 */
export class SlackNotificationService implements NotificationService {
  public readonly platformName = 'slack';

  private readonly webhookUrl: string;
  private readonly environment: string;
  private readonly batchMode: boolean;

  constructor(config: SlackConfig, environment: string = 'development') {
    this.webhookUrl = config.webhookUrl;
    this.environment = environment;
    this.batchMode = config.batchMode ?? true;

    if (!this.validateConfig()) {
      throw new Error('Slack 설정이 유효하지 않습니다');
    }
  }

  validateConfig(): boolean {
    return !!(this.webhookUrl && this.webhookUrl.startsWith('https://hooks.slack.com/'));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testPayload = {
        text: `${this.getEnvironmentPrefix()}🔍 Slack 연결 테스트`,
        attachments: [{
          color: 'good',
          text: '건강 상태 확인 완료',
          footer: '한국 기상청',
          ts: Math.floor(Date.now() / 1000)
        }]
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Slack 건강 상태 확인 실패:', error);
      return false;
    }
  }

  async sendAlert(alert: WeatherAlert): Promise<NotificationResult> {
    const startTime = Date.now();
    
    try {
      const attachment = this.createAlertAttachment(alert);
      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 알림`,
        attachments: [attachment]
      };

      const response = await this.sendToSlack(payload);
      
      return {
        platform: this.platformName,
        success: response.ok,
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      logger.error('Slack 특보 알림 전송 실패:', error);
      
      return {
        platform: this.platformName,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async sendAlertChange(change: AlertChange): Promise<NotificationResult> {
    const startTime = Date.now();
    
    try {
      const config = this.getChangeTypeConfig(change.type);
      const alert = change.current || change.previous!;
      const attachment = this.createChangeAttachment(change, config);
      
      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 변동 알림`,
        attachments: [attachment]
      };

      const response = await this.sendToSlack(payload);
      
      logger.info(`Slack 변동 알림 전송 완료: ${change.type} - ${alert.regionName}`);
      
      return {
        platform: this.platformName,
        success: response.ok,
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      logger.error('Slack 변동 알림 전송 실패:', error);
      
      return {
        platform: this.platformName,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async sendAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]> {
    if (changes.length === 0) {
      return [];
    }

    if (changes.length === 1) {
      // 단일 변동은 개별 전송
      return [await this.sendAlertChange(changes[0])];
    }

    // 2개 이상은 설정에 따라 배치 또는 개별 전송
    if (this.batchMode) {
      return [await this.sendBatchedAlertChanges(changes)];
    } else {
      return await this.sendMultipleAlertChanges(changes);
    }
  }

  /**
   * 배치 방식으로 다중 변동 알림 전송
   */
  private async sendBatchedAlertChanges(changes: AlertChange[]): Promise<NotificationResult> {
    const startTime = Date.now();
    
    try {
      const attachments = changes.map((change, index) => {
        const config = this.getChangeTypeConfig(change.type);
        return this.createBatchChangeAttachment(change, config, index === changes.length - 1);
      });

      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 변동 알림 (${changes.length}건)`,
        attachments
      };

      const response = await this.sendToSlack(payload);
      
      if (response.ok) {
        logger.info(`Slack 배치 변동 알림 전송 완료: ${changes.length}건`);
      }
      
      return {
        platform: this.platformName,
        success: response.ok,
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      logger.error('Slack 배치 변동 알림 전송 실패:', error);
      
      return {
        platform: this.platformName,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 개별 방식으로 다중 변동 알림 전송
   */
  private async sendMultipleAlertChanges(changes: AlertChange[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    for (let i = 0; i < changes.length; i++) {
      const result = await this.sendAlertChange(changes[i]);
      results.push(result);
      
      // 마지막 메시지가 아니면 1초 대기 (Rate limiting)
      if (i < changes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Slack API로 페이로드 전송
   */
  private async sendToSlack(payload: any): Promise<Response> {
    return await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * 환경별 메시지 접두사 반환
   */
  private getEnvironmentPrefix(): string {
    const prefixes: Record<string, string> = {
      'development': '[DEV] ',
      'staging': '[STAGING] ',
      'production': ''
    };
    return this.environment in prefixes ? prefixes[this.environment] : `[${this.environment.toUpperCase()}] `;
  }

  /**
   * 변동 유형별 설정 반환
   */
  private getChangeTypeConfig(type: AlertChangeType) {
    const configs = {
      NEW: {
        emoji: '🆕',
        color: 'danger',
        title: '신규 발표'
      },
      RESOLVED: {
        emoji: '✅',
        color: 'good', 
        title: '해제'
      },
      LEVEL_UP: {
        emoji: '⬆️',
        color: 'danger',
        title: '수준 상향'
      },
      LEVEL_DOWN: {
        emoji: '⬇️',
        color: 'warning',
        title: '수준 하향'
      },
      TIME_EXTENDED: {
        emoji: '⏰',
        color: 'warning',
        title: '시간 연장'
      },
      MODIFIED: {
        emoji: '🔄',
        color: 'warning',
        title: '내용 변경'
      }
    };
    return configs[type];
  }

  /**
   * 특보 알림용 Attachment 생성
   */
  private createAlertAttachment(alert: WeatherAlert) {
    const color = this.getAlertColor(alert.LVL);
    
    return {
      color,
      title: `🌦️ ${this.getRegionName(alert)} ${this.getWarningTypeName(alert.WRN)} ${this.getWarningLevel(alert.LVL)}`,
      fields: [
        {
          title: '📍 지역',
          value: this.getRegionName(alert),
          short: true
        },
        {
          title: '⚠️ 특보종류',
          value: this.getWarningTypeName(alert.WRN),
          short: true
        },
        {
          title: '📊 수준',
          value: this.getWarningLevel(alert.LVL),
          short: true
        },
        {
          title: '📅 발표시각',
          value: this.formatDateTime(alert.TM_FC),
          short: true
        },
        {
          title: '⏰ 발효시각',
          value: this.formatDateTime(alert.TM_EF),
          short: true
        }
      ],
      footer: '한국 기상청',
      ts: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * 변동 알림용 Attachment 생성
   */
  private createChangeAttachment(change: AlertChange, config: any) {
    const alert = change.current || change.previous!;
    
    const attachment: any = {
      color: config.color,
      title: `${config.emoji} ${change.description}`,
      fields: [
        {
          title: '📍 지역',
          value: alert.regionName,
          short: true
        },
        {
          title: '⚠️ 특보종류',
          value: this.getWarningTypeName(alert.warningType),
          short: true
        }
      ]
    };

    // 변동 유형별 추가 필드
    if (change.type === 'NEW' || change.type === 'LEVEL_UP' || change.type === 'LEVEL_DOWN') {
      const level = this.getWarningLevel(change.current!.level);

      if (change.type === 'NEW') {
        attachment.fields.push({ title: '📊 수준', value: level, short: true });
      } else if (change.type === 'LEVEL_UP' || change.type === 'LEVEL_DOWN') {
        const prevLevel = this.getWarningLevel(change.previous!.level);
        const currLevel = this.getWarningLevel(change.current!.level);
        attachment.fields.push({ 
          title: '📈 수준변화', 
          value: `${prevLevel} → ${currLevel}`, 
          short: true 
        });
      }
    } else if (change.type === 'RESOLVED') {
      const level = this.getWarningLevel(change.previous!.level);
      attachment.fields.push({ title: '❌ 해제수준', value: level, short: true });
    }

    attachment.footer = '한국 기상청';
    attachment.ts = Math.floor(Date.now() / 1000);
    
    return attachment;
  }

  /**
   * 배치 전송용 Attachment 생성
   */
  private createBatchChangeAttachment(change: AlertChange, config: any, isLast: boolean) {
    const alert = change.current || change.previous!;
    
    const attachment: any = {
      color: config.color,
      title: `${config.emoji} ${change.description}`,
      fields: [
        {
          title: '📍 지역',
          value: alert.regionName,
          short: true
        },
        {
          title: '⚠️ 특보종류',
          value: this.getWarningTypeName(alert.warningType),
          short: true
        }
      ]
    };

    // 변동 유형별 추가 필드 (간소화)
    if (change.type === 'NEW' || change.type === 'RESOLVED') {
      const level = change.type === 'NEW' ? 
        this.getWarningLevel(change.current!.level) :
        this.getWarningLevel(change.previous!.level);
      
      attachment.fields.push({ 
        title: change.type === 'NEW' ? '📊 수준' : '❌ 해제수준', 
        value: level, 
        short: true 
      });
    } else if (change.type === 'LEVEL_UP' || change.type === 'LEVEL_DOWN') {
      const prevLevel = this.getWarningLevel(change.previous!.level);
      const currLevel = this.getWarningLevel(change.current!.level);
      attachment.fields.push({ 
        title: '📈 수준변화', 
        value: `${prevLevel} → ${currLevel}`, 
        short: true 
      });
    }

    // 마지막 attachment에만 footer와 timestamp 추가
    if (isLast) {
      attachment.footer = '한국 기상청';
      attachment.ts = Math.floor(Date.now() / 1000);
    } else {
      attachment.footer = '';
    }
    
    return attachment;
  }

  /**
   * 특보 수준에 따른 색상 반환
   */
  private getAlertColor(level: string): string {
    const colors: Record<string, string> = {
      '1': '#ffcc00', // 예비특보 - 주황색
      '2': '#ff9900', // 주의보 - 주황색
      '3': '#ff0000'  // 경보 - 빨간색  
    };
    return colors[level] || '#808080';
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

  /**
   * 특보 수준 코드를 한국어로 변환
   */
  private getWarningLevel(level: string): string {
    const levels: Record<string, string> = {
      '1': '예비',
      '2': '주의보',
      '3': '경보'
    };
    return levels[level?.trim()] || level;
  }

  /**
   * 지역명 반환 (WeatherAlert 또는 문자열)
   */
  private getRegionName(alertOrName: WeatherAlert | string): string {
    if (typeof alertOrName === 'string') {
      return alertOrName;
    }
    return alertOrName.REG_NAME || alertOrName.REG_ID;
  }

  /**
   * 날짜 시간 포맷팅
   */
  private formatDateTime(dateString: string): string {
    if (!dateString) return '정보 없음';
    
    try {
      // KMA API의 12자리 포맷 (YYYYMMDDHHmm)
      if (dateString.length === 12 && /^\d{12}$/.test(dateString)) {
        const year = dateString.substring(0, 4);
        const month = dateString.substring(4, 6);
        const day = dateString.substring(6, 8);
        const hour = dateString.substring(8, 10);
        const minute = dateString.substring(10, 12);
        
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
        return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      }
      
      // ISO 형식 시도
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      }
    } catch (error) {
      logger.debug('날짜 포맷팅 실패:', dateString, error);
    }
    
    return dateString;
  }
}