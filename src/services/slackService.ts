import { WeatherAlert, AlertChange, AlertChangeType } from '../types/weather';
import { logger } from '../utils/logger';
import { config } from '../config';
import { SlackAttachment, SlackAttachmentField } from '../types/api';
import {
  formatDateTime,
  getWarningTypeName,
  getWarningLevelName,
  getWarningCommandName,
  generateWeatherSearchUrl,
  getWarningTypeEmoji
} from '../utils/messageFormatter';
import { groupAlertChanges, getLevelName, getLevelEmoji, formatRegionList } from '../utils/messageGrouper';

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
            title_link: generateWeatherSearchUrl(alert.regionName),
            fields: [
              {
                title: '📍 지역',
                value: `<${generateWeatherSearchUrl(alert.regionName)}|${alert.regionName}>`,
                short: true
              },
              {
                title: '⚠️ 특보종류',
                value: getWarningTypeName(alert.warningType),
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
   * 그루핑 기능을 사용하여 수준/종류/상위지역별로 정리합니다.
   */
  async sendBatchedAlertChanges(changes: AlertChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    try {
      // 그루핑 로직 적용
      const groupedAlerts = groupAlertChanges(changes);
      const attachments: SlackAttachment[] = [];

      // 수준별로 섹션 헤더 추가
      let currentLevel = '';

      for (let i = 0; i < groupedAlerts.length; i++) {
        const group = groupedAlerts[i];
        const changeConfig = this.getChangeTypeConfig(group.changeType);

        // 수준이 바뀔 때마다 구분선 추가
        if (group.level !== currentLevel) {
          currentLevel = group.level;
          const levelEmoji = getLevelEmoji(group.level);
          const levelName = getLevelName(group.level);

          attachments.push({
            color: group.level === '3' ? '#ff0000' : group.level === '2' ? '#ff9900' : '#ffcc00',
            text: `${levelEmoji} *${levelName}*`,
            mrkdwn_in: ['text'],
            fields: []
          });
        }

        // 상위지역별 지역명 조합 (새로운 포맷팅 함수 사용)
        const regionTexts: string[] = [];
        for (const [upperRegion, regionNames] of group.regions.entries()) {
          regionTexts.push(formatRegionList(upperRegion, regionNames));
        }

        const warningEmoji = getWarningTypeEmoji(group.warningType);
        const warningName = getWarningTypeName(group.warningType);
        const levelName = getLevelName(group.level);

        // 그룹 정보를 하나의 attachment로 표시
        const attachment: SlackAttachment = {
          color: changeConfig.color,
          text: `${changeConfig.emoji} *${warningEmoji} ${warningName}${levelName} ${this.getChangeTypeText(group.changeType)}*\n${regionTexts.join(', ')}`,
          mrkdwn_in: ['text'],
          fields: [],
          footer: i === groupedAlerts.length - 1 ? '한국 기상청' : '',
          ts: i === groupedAlerts.length - 1 ? Math.floor(Date.now() / 1000) : undefined
        };

        attachments.push(attachment);
      }

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

      logger.info(`Slack 배치 변동 알림 전송 완료: ${changes.length}건 (${groupedAlerts.length}개 그룹)`);
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
   * 변동 유형을 한글 텍스트로 변환합니다.
   */
  private getChangeTypeText(changeType: AlertChangeType): string {
    const texts: Record<AlertChangeType, string> = {
      'NEW': '신규 발표',
      'RESOLVED': '해제',
      'LEVEL_UP': '수준 상향',
      'LEVEL_DOWN': '수준 하향',
      'TIME_EXTENDED': '발효시각 연장',
      'MODIFIED': '내용 변경'
    };
    return texts[changeType] || changeType;
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
  private addBatchedChangeFields(attachment: SlackAttachment, change: AlertChange): void {
    // 배치 메시지에서는 핵심 정보만 표시
    switch (change.type) {
      case 'NEW':
        if (change.current) {
          attachment.fields.push({
            title: '📊 수준',
            value: getWarningLevelName(change.current.level),
            short: true
          });
        }
        break;

      case 'RESOLVED':
        if (change.previous) {
          attachment.fields.push({
            title: '❌ 해제수준',
            value: getWarningLevelName(change.previous.level),
            short: true
          });
        }
        break;

      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '📈 수준변화',
            value: `${getWarningLevelName(change.previous.level)} → ${getWarningLevelName(change.current.level)}`,
            short: false
          });
        }
        break;

      case 'TIME_EXTENDED':
        if (change.current) {
          attachment.fields.push({
            title: '⏰ 발효시각',
            value: formatDateTime(change.current.effectiveAt),
            short: true
          });
        }
        break;

      case 'MODIFIED':
        if (change.current) {
          attachment.fields.push({
            title: '📊 수준',
            value: getWarningLevelName(change.current.level),
            short: true
          });
        }
        break;
    }
  }

  /**
   * 변동 유형에 따른 추가 필드를 설정합니다. (개별 메시지용)
   */
  private addChangeSpecificFields(attachment: SlackAttachment, change: AlertChange): void {
    const alert = change.current || change.previous!;
    
    // 공통 필드들
    attachment.fields.push(
      {
        title: '📢 발표시각',
        value: formatDateTime(alert.announcedAt),
        short: true
      },
      {
        title: '⏰ 발효시각',
        value: formatDateTime(alert.effectiveAt),
        short: true
      }
    );

    // 변동 유형별 특수 처리
    switch (change.type) {
      case 'NEW':
        if (change.current) {
          attachment.fields.push({
            title: '📊 특보수준',
            value: getWarningLevelName(change.current.level),
            short: true
          });
        }
        break;

      case 'RESOLVED':
        if (change.previous) {
          attachment.fields.push({
            title: '❌ 해제된 수준',
            value: getWarningLevelName(change.previous.level),
            short: true
          });
        }
        break;

      case 'LEVEL_UP':
      case 'LEVEL_DOWN':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '📈 수준 변화',
            value: `${getWarningLevelName(change.previous.level)} → ${getWarningLevelName(change.current.level)}`,
            short: false
          });
        }
        break;

      case 'TIME_EXTENDED':
        if (change.previous && change.current) {
          attachment.fields.push({
            title: '⏳ 발효시각 변화',
            value: `${formatDateTime(change.previous.effectiveAt)} → ${formatDateTime(change.current.effectiveAt)}`,
            short: false
          });
        }
        break;

      case 'MODIFIED':
        if (change.current) {
          attachment.fields.push({
            title: '📊 현재 수준',
            value: getWarningLevelName(change.current.level),
            short: true
          });
        }
        break;
    }
  }

  async sendAlert(alert: WeatherAlert): Promise<void> {
    try {
      
      const payload = {
        text: `${this.getEnvironmentPrefix()}🌦️ 기상특보 알림`,
        attachments: [
          {
            color: alert.LVL === '3' ? 'danger' : 'warning',
            title: `${getWarningTypeName(alert.WRN)} ${getWarningCommandName(alert.CMD)}`,
            title_link: generateWeatherSearchUrl(alert.REG_NAME),
            fields: [
              {
                title: '📍 지역',
                value: `<${generateWeatherSearchUrl(alert.REG_NAME)}|${alert.REG_NAME}>`,
                short: true
              },
              {
                title: '📢 발령시각',
                value: formatDateTime(alert.TM_FC),
                short: true
              },
              {
                title: '⏰ 발효시각',
                value: formatDateTime(alert.TM_EF),
                short: true
              },
              {
                title: '📊 특보수준',
                value: getWarningLevelName(alert.LVL),
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


}