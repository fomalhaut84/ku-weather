import { WeatherAlert, AlertChange, AlertChangeType } from '../types/weather';
import { logger } from '../utils/logger';
import { config } from '../config';

export class SlackService {
  private readonly webhookUrl: string;
  private readonly environment: string;
  private readonly batchMode: boolean;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
    this.environment = config.environment;
    this.batchMode = config.slackBatchMode;
    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL이 제공되지 않았습니다');
    }
  }

  /**
   * 환경별 메시지 접두사를 반환합니다.
   * production 환경에서는 접두사를 표시하지 않습니다.
   */
  private getEnvironmentPrefix(): string {
    // production 환경에서는 접두사 없음
    if (this.environment === 'production' || process.env.NODE_ENV === 'production') {
      return '';
    }
    
    const prefixes: Record<string, string> = {
      'development': '[DEV] ',
      'staging': '[STAGING] '
    };
    return prefixes[this.environment] || `[${this.environment.toUpperCase()}] `;
  }

  /**
   * 지역명으로 다음 날씨 검색 URL을 생성합니다.
   * 모바일 환경에서의 한글 URL 인코딩 문제를 해결하기 위해 지역명을 단순화합니다.
   */
  private generateWeatherSearchUrl(regionName: string): string {
    // 지역명을 검색 친화적으로 단순화
    const simplifiedRegion = this.simplifyRegionName(regionName);
    // 한글 공백은 + 기호로 대체하여 URL 인코딩 최소화
    const searchQuery = `${simplifiedRegion} 날씨`.replace(/\s+/g, '+');
    return `https://search.daum.net/search?w=tot&q=${searchQuery}`;
  }

  /**
   * 지역명을 검색에 최적화된 형태로 단순화합니다.
   */
  private simplifyRegionName(regionName: string): string {
    // 특보구역명의 복잡한 지역명을 단순화
    const regionMappings: Record<string, string> = {
      // 서울 지역
      '서울강북': '서울 강북구',
      '서울강남': '서울 강남구',
      '서울강서': '서울 강서구',
      '서울강동': '서울 강동구',
      '서울종로': '서울 종로구',
      '서울중구': '서울 중구',
      '서울용산': '서울 용산구',
      '서울성동': '서울 성동구',
      '서울광진': '서울 광진구',
      '서울동대문': '서울 동대문구',
      '서울중랑': '서울 중랑구',
      '서울성북': '서울 성북구',
      '서울도봉': '서울 도봉구',
      '서울노원': '서울 노원구',
      '서울은평': '서울 은평구',
      '서울서대문': '서울 서대문구',
      '서울마포': '서울 마포구',
      '서울양천': '서울 양천구',
      '서울구로': '서울 구로구',
      '서울금천': '서울 금천구',
      '서울영등포': '서울 영등포구',
      '서울동작': '서울 동작구',
      '서울관악': '서울 관악구',
      '서울서초': '서울 서초구',
      '서울송파': '서울 송파구',
      
      // 제주 지역 (가장 문제가 되는 긴 지역명)
      '제주도북부중산간': '제주',
      '제주도남부중산간': '제주',
      '제주도북부': '제주',
      '제주도남부': '제주',
      '제주도서부': '제주',
      '제주도동부': '제주',
      '제주북부중산간': '제주',
      '제주남부중산간': '제주',
      '제주북부': '제주',
      '제주남부': '제주',
      '제주서부': '제주',
      '제주동부': '제주',
      
      // 기타 복잡한 지역명들
      '인천강화': '인천 강화',
      '인천옹진': '인천 옹진',
      '경기동두천': '동두천',
      '경기과천': '과천',
      '경기구리': '구리',
      '경기남양주': '남양주',
      '경기오산': '오산',
      '경기시흥': '시흥',
      '경기군포': '군포',
      '경기의왕': '의왕',
      '경기하남': '하남',
      
      // 해상 지역들 (간소화)
      '서해북부먼바다': '서해',
      '서해중부먼바다': '서해',
      '서해남부먼바다': '서해',
      '남해동부먼바다': '남해',
      '남해서부먼바다': '남해',
      '동해북부먼바다': '동해',
      '동해중부먼바다': '동해',
      '동해남부먼바다': '동해',
      '제주도먼바다': '제주 바다'
    };

    // 매핑된 지역명이 있으면 사용, 없으면 원본에서 불필요한 접미사 제거
    if (regionMappings[regionName]) {
      return regionMappings[regionName];
    }

    // 기본적인 정리: 특별시, 광역시, 도 등의 접미사 처리
    let simplified = regionName
      .replace(/특별시$/, '')
      .replace(/광역시$/, '')
      .replace(/특별자치시$/, '')
      .replace(/특별자치도$/, '')
      .replace(/도$/, '')
      .replace(/시$/, '')
      .replace(/군$/, '')
      .replace(/구$/, '');

    // 너무 긴 지역명은 앞 2-3글자만 사용
    if (simplified.length > 4) {
      simplified = simplified.substring(0, 3);
    }

    return simplified || regionName;
  }

  /**
   * 변동 유형별 메시지 설정을 반환합니다.
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
   * 특보 변동사항을 Slack으로 전송합니다.
   */
  async sendAlertChange(change: AlertChange): Promise<void> {
    try {
      const config = this.getChangeTypeConfig(change.type);
      const alert = change.current || change.previous;
      
      if (!alert) {
        logger.warn('AlertChange에 current나 previous 정보가 없습니다');
        return;
      }

      const payload = {
        text: `${this.getEnvironmentPrefix()}${config.emoji} 기상특보 ${config.title}`,
        attachments: [
          {
            color: config.color,
            title: change.description,
            title_link: this.generateWeatherSearchUrl(alert.regionName),
            fields: [
              {
                title: '📍 지역',
                value: `<${this.generateWeatherSearchUrl(alert.regionName)}|${alert.regionName}>`,
                short: true
              },
              {
                title: '⚠️ 특보종류',
                value: this.getWarningTypeName(alert.warningType),
                short: true
              }
            ],
            footer: '한국 기상청',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      // 변동 유형에 따른 추가 필드 설정
      this.addChangeSpecificFields(payload.attachments[0], change);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorMessage = `Slack 메시지 보내기 실패: ${response.status} ${response.statusText}`;
        logger.error(errorMessage, {
          changeType: change.type,
          regionName: alert.regionName,
          webhookUrl: this.webhookUrl.substring(0, 50) + '...',
          environment: this.environment
        });
        throw new Error(errorMessage);
      }

      logger.info(`Slack 변동 알림 전송 완료: ${change.type} - ${alert.regionName}`);
    } catch (error) {
      const alertInfo = change.current || change.previous;
      logger.error('Slack 변동 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        changeType: change.type,
        regionName: alertInfo?.regionName || '알 수 없음',
        environment: this.environment,
        webhookUrl: this.webhookUrl.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * 여러 특보 변동사항을 Slack으로 전송합니다.
   */
  async sendAlertChanges(changes: AlertChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    try {
      if (changes.length === 1) {
        await this.sendAlertChange(changes[0]);
      } else {
        // 설정에 따라 배치 모드 또는 개별 전송 방식 선택
        if (this.batchMode) {
          await this.sendBatchedAlertChanges(changes);
        } else {
          await this.sendMultipleAlertChanges(changes);
        }
      }
    } catch (error) {
      logger.error('기상특보 변동 Slack 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        changesCount: changes.length,
        environment: this.environment,
        batchMode: this.batchMode
      });
      throw error;
    }
  }

  /**
   * 여러 특보 변동사항을 하나의 메시지로 묶어서 전송합니다.
   */
  async sendBatchedAlertChanges(changes: AlertChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    try {
      const attachments = changes.map((change, index) => {
        const config = this.getChangeTypeConfig(change.type);
        const alert = change.current || change.previous!;
        
        const attachment: any = {
          color: config.color,
          title: `${config.emoji} ${change.description}`,
          title_link: this.generateWeatherSearchUrl(alert.regionName),
          fields: [
            {
              title: '📍 지역',
              value: `<${this.generateWeatherSearchUrl(alert.regionName)}|${alert.regionName}>`,
              short: true
            },
            {
              title: '⚠️ 특보종류',
              value: this.getWarningTypeName(alert.warningType),
              short: true
            }
          ],
          footer: index === changes.length - 1 ? '한국 기상청' : '',
          ts: index === changes.length - 1 ? Math.floor(Date.now() / 1000) : undefined
        };

        // 변동 유형별 추가 필드
        this.addBatchedChangeFields(attachment, change);
        
        return attachment;
      });

      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 변동 알림 (${changes.length}건)`,
        attachments
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorMessage = `Slack 메시지 보내기 실패: ${response.status} ${response.statusText}`;
        logger.error(errorMessage, {
          changesCount: changes.length,
          webhookUrl: this.webhookUrl.substring(0, 50) + '...',
          environment: this.environment
        });
        throw new Error(errorMessage);
      }

      logger.info(`Slack 배치 변동 알림 전송 완료: ${changes.length}건`);
    } catch (error) {
      logger.error('Slack 배치 변동 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        changesCount: changes.length,
        environment: this.environment,
        webhookUrl: this.webhookUrl.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * 여러 특보 변동사항을 순차적으로 전송합니다. (기존 방식 유지)
   */
  async sendMultipleAlertChanges(changes: AlertChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    try {
      for (const change of changes) {
        await this.sendAlertChange(change);
        // API 요청 제한을 피하기 위해 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('다중 Slack 변동 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        changesCount: changes.length,
        environment: this.environment
      });
      throw error;
    }
  }

  /**
   * 배치 메시지용 간소화된 필드를 설정합니다.
   */
  private addBatchedChangeFields(attachment: any, change: AlertChange): void {
    // 배치 메시지에서는 핵심 정보만 표시
    switch (change.type) {
      case 'NEW':
        if (change.current) {
          attachment.fields.push({
            title: '📊 수준',
            value: this.getWarningLevel(change.current.level),
            short: true
          });
        }
        break;
        
      case 'RESOLVED':
        if (change.previous) {
          attachment.fields.push({
            title: '❌ 해제수준',
            value: this.getWarningLevel(change.previous.level),
            short: true
          });
        }
        break;
        
      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '📈 수준변화',
            value: `${this.getWarningLevel(change.previous.level)} → ${this.getWarningLevel(change.current.level)}`,
            short: false
          });
        }
        break;
        
      case 'TIME_EXTENDED':
        if (change.current) {
          attachment.fields.push({
            title: '⏰ 발효시각',
            value: this.formatDateTime(change.current.effectiveAt),
            short: true
          });
        }
        break;
        
      case 'MODIFIED':
        if (change.current) {
          attachment.fields.push({
            title: '📊 수준',
            value: this.getWarningLevel(change.current.level),
            short: true
          });
        }
        break;
    }
  }

  /**
   * 변동 유형에 따른 추가 필드를 설정합니다. (개별 메시지용)
   */
  private addChangeSpecificFields(attachment: any, change: AlertChange): void {
    const alert = change.current || change.previous!;
    
    // 공통 필드들
    attachment.fields.push(
      {
        title: '📢 발표시각',
        value: this.formatDateTime(alert.announcedAt),
        short: true
      },
      {
        title: '⏰ 발효시각', 
        value: this.formatDateTime(alert.effectiveAt),
        short: true
      }
    );

    // 변동 유형별 특수 처리
    switch (change.type) {
      case 'NEW':
        if (change.current) {
          attachment.fields.push({
            title: '📊 특보수준',
            value: this.getWarningLevel(change.current.level),
            short: true
          });
        }
        break;
        
      case 'RESOLVED':
        if (change.previous) {
          attachment.fields.push({
            title: '❌ 해제된 수준',
            value: this.getWarningLevel(change.previous.level),
            short: true
          });
        }
        break;
        
      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '📈 수준 변화',
            value: `${this.getWarningLevel(change.previous.level)} → ${this.getWarningLevel(change.current.level)}`,
            short: false
          });
        }
        break;
        
      case 'TIME_EXTENDED':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '⏳ 발효시각 변화',
            value: `${this.formatDateTime(change.previous.effectiveAt)} → ${this.formatDateTime(change.current.effectiveAt)}`,
            short: false
          });
        }
        break;
        
      case 'MODIFIED':
        if (change.current) {
          attachment.fields.push({
            title: '📊 현재 수준',
            value: this.getWarningLevel(change.current.level),
            short: true
          });
        }
        break;
    }
  }

  /**
   * 특보 수준 코드를 한국어 이름으로 변환합니다.
   */
  private getWarningLevel(levelCode: string): string {
    const levels: Record<string, string> = {
      '1': '예비',
      '2': '주의보',
      '3': '경보'
    };
    return levels[levelCode.trim()] || levelCode;
  }

  private getWarningCommand(cmdCode: string): string {
    const commands: Record<string, string> = {
      '1': '발표',
      '2': '대치',
      '3': '해제',
      '4': '대치해제(자동)',
      '5': '연장',
      '6': '변경',
      '7': '변경해제'
    };
    return commands[cmdCode.trim()] || cmdCode;
  }
  async sendAlert(alert: WeatherAlert): Promise<void> {
    try {
      
      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 알림`,
        attachments: [
          {
            color: alert.LVL === '1' ? 'danger' : 'warning',
            title: `${this.getWarningTypeName(alert.WRN)} ${this.getWarningCommand(alert.CMD)}`,
            title_link: this.generateWeatherSearchUrl(alert.REG_NAME),
            fields: [
              {
                title: '📍 지역',
                value: `<${this.generateWeatherSearchUrl(alert.REG_NAME)}|${alert.REG_NAME}>`,
                short: true
              },
              {
                title: '📢 발령시각',
                value: this.formatDateTime(alert.TM_FC),
                short: true
              },
              {
                title: '⏰ 발효시각',
                value: this.formatDateTime(alert.TM_EF),
                short: true
              },
              {
                title: '📊 특보수준',
                value: this.getWarningLevel(alert.LVL),
                short: true
              },
              {
                title: '🏢 상위지역',
                value: alert.REG_UP_KO || '알 수 없음',
                short: true
              }
            ],
            footer: '🌤️ 한국 기상청',
            ts: Math.floor(new Date(alert.TM_FC).getTime() / 1000)
          }
        ]
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorMessage = `Slack 메시지 보내기 실패: ${response.status} ${response.statusText}`;
        logger.error(errorMessage, {
          regionName: alert.REG_NAME,
          warningType: alert.WRN,
          command: alert.CMD,
          webhookUrl: this.webhookUrl.substring(0, 50) + '...',
          environment: this.environment
        });
        throw new Error(errorMessage);
      }

      logger.info(`Slack 알림 전송 완료: ${alert.REG_NAME} - ${alert.CMD}`);
    } catch (error) {
      logger.error('Slack 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        regionName: alert.REG_NAME,
        warningType: alert.WRN,
        command: alert.CMD,
        environment: this.environment,
        webhookUrl: this.webhookUrl.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  async sendWeatherAlert(alerts: WeatherAlert[]): Promise<void> {
    if (alerts.length === 0) {
      return;
    }

    try {
      if (alerts.length === 1) {
        await this.sendAlert(alerts[0]);
      } else {
        await this.sendMultipleAlerts(alerts);
      }
    } catch (error) {
      logger.error('기상특보 Slack 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        alertsCount: alerts.length,
        environment: this.environment
      });
      throw error;
    }
  }

  async sendMultipleAlerts(alerts: WeatherAlert[]): Promise<void> {
    if (alerts.length === 0) {
      return;
    }

    try {
      for (const alert of alerts) {
        await this.sendAlert(alert);
        // API 요청 제한을 피하기 위해 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('다중 Slack 알림 전송 중 오류:', {
        error: error instanceof Error ? error.message : String(error),
        alertsCount: alerts.length,
        environment: this.environment
      });
      throw error;
    }
  }


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

  private formatDateTime(dateTimeStr: string): string {
    try {
      // YYYYMMDDHHMM 형태를 YYYY-MM-DD HH:MM 형태로 변환 (기상청 API 형식)
      if (dateTimeStr.length === 12 && /^\d{12}$/.test(dateTimeStr)) {
        const year = dateTimeStr.substring(0, 4);
        const month = dateTimeStr.substring(4, 6);
        const day = dateTimeStr.substring(6, 8);
        const hour = dateTimeStr.substring(8, 10);
        const minute = dateTimeStr.substring(10, 12);
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }
      
      // ISO 형식이나 다른 형식 처리
      const date = new Date(dateTimeStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        });
      }
      
      // 변환할 수 없는 경우 원본 반환
      return dateTimeStr;
    } catch {
      return dateTimeStr;
    }
  }
}