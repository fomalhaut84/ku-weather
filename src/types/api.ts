/**
 * 기상청 API 응답 타입 정의
 */

/**
 * 기상청 API 공통 응답 래퍼
 */
export interface WeatherApiResponse {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      dataType?: string;
      items?: {
        item: ForecastItem[];
      };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

/**
 * 단기/초단기 예보 아이템
 */
export interface ForecastItem {
  baseDate: string;
  baseTime: string;
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
}

/**
 * Slack Webhook 메시지 Attachment
 */
export interface SlackAttachment {
  color: string;
  title?: string;
  text?: string;
  fields: SlackAttachmentField[];
  footer?: string;
  ts?: number;
  mrkdwn_in?: string[];
}

/**
 * Slack Attachment 필드
 */
export interface SlackAttachmentField {
  title: string;
  value: string;
  short: boolean;
}

/**
 * Slack Webhook 페이로드
 */
export interface SlackPayload {
  text: string;
  attachments?: SlackAttachment[];
}

/**
 * 특보 조회 필터
 */
export interface AlertFilters {
  regionId?: string;
  warningType?: string;
  warningLevel?: string;
  upperRegion?: string;
}

/**
 * 특보 이력 조회 필터
 */
import { AlertChangeType } from './weather';

export interface AlertHistoryFilters {
  startDate: Date;
  endDate: Date;
  regionId?: string;
  warningType?: string;
  changeType?: AlertChangeType;
}

/**
 * 변동 유형별 설정
 */
export interface ChangeTypeConfig {
  emoji: string;
  color: string;
  text?: string;
}

/**
 * 구독 통계 데이터
 */
export interface SubscriptionStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  platformBreakdown: Record<string, number>;
  regionBreakdown: Record<string, number>;
}
