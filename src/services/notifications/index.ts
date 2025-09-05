/**
 * 알림 서비스 모듈 통합 익스포트
 * 
 * Phase 1에서 구현된 다중 플랫폼 알림 시스템 + 개별 사용자 구독 시스템
 */

// 공통 인터페이스
export * from './interfaces';

// 구독 시스템
export { SubscriptionManager, UserSubscription, SubscriptionNotificationResult } from './SubscriptionManager';

// 구체적인 알림 서비스 구현체
export { SlackNotificationService } from './SlackNotificationService';

// 다중 플랫폼 매니저 (구독 시스템 통합)
export { MultiplatformNotificationService } from './MultiplatformNotificationService';

// 팩토리 클래스
export { NotificationFactory } from './NotificationFactory';

// 향후 추가될 서비스들 (Phase 2-4)
// export { TelegramNotificationService } from './TelegramNotificationService';
// export { DiscordNotificationService } from './DiscordNotificationService';  
// export { EmailNotificationService } from './EmailNotificationService';