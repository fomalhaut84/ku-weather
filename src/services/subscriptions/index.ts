/**
 * 하이브리드 구독 관리 시스템 통합 익스포트
 * 
 * 모든 플랫폼별 구독 인터페이스를 통합하는 중앙 시스템
 */

// 핵심 인터페이스 및 타입
export * from './interfaces';

// 통합 구독 관리 시스템
export { HybridSubscriptionManager } from './HybridSubscriptionManager';

// 공통 유틸리티
export { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from './CommandParser';

// 플랫폼별 구독 인터페이스
export { TelegramSubscriptionInterface } from './TelegramSubscriptionInterface';
export { SlackInteractiveInterface } from './SlackInteractiveInterface';
export { EmailCommandProcessor } from './EmailCommandProcessor';
export { WebSubscriptionInterface } from './WebSubscriptionInterface';

// 향후 추가될 플랫폼 인터페이스 (Phase 2-4)
// export { DiscordSubscriptionInterface } from './DiscordSubscriptionInterface';