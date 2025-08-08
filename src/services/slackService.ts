import { WeatherAlert } from '../types/weather';
import { logger } from '../utils/logger';

export class SlackService {
  private readonly webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL이 제공되지 않았습니다');
    }
  }

  async sendAlert(alert: WeatherAlert): Promise<void> {
    try {
      
      const payload = {
        text: '🌦️ 기상특보 알림',
        attachments: [
          {
            color: alert.LVL === '1' ? 'danger' : 'warning',
            title: `${this.getWarningTypeName(alert.WRN)} ${alert.CMD}`,
            fields: [
              {
                title: '지역',
                value: alert.REG_NAME,
                short: true
              },
              {
                title: '발령시각',
                value: this.formatDateTime(alert.TM_FC),
                short: true
              },
              {
                title: '발효시각',
                value: this.formatDateTime(alert.TM_EF),
                short: true
              },
              {
                title: '특보수준',
                value: alert.LVL,
                short: true
              },
              {
                title: '상위지역',
                value: alert.REG_UP_KO || '알 수 없음',
                short: true
              }
            ],
            footer: '한국 기상청',
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
        throw new Error(`Slack 메시지 보내기 실패: ${response.status} ${response.statusText}`);
      }

      logger.info(`Slack 알림 전송 완료: ${alert.REG_NAME} - ${alert.CMD}`);
    } catch (error) {
      logger.error('Slack 알림 전송 중 오류:', error);
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
      logger.error('기상특보 Slack 알림 전송 중 오류:', error);
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
      logger.error('다중 Slack 알림 전송 중 오류:', error);
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
      const date = new Date(dateTimeStr);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
      });
    } catch {
      return dateTimeStr;
    }
  }
}