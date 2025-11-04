/**
 * 구독 관리 타입 정의
 */

export interface UserSubscription {
  platform: string;
  userId: string;
  targetRegions: string[];
  warningTypes: string[];
  enabled: boolean;
  displayName: string;
  regionNames?: string[];
  warningTypeNames?: string[];
  platformDisplayName?: string;
  preferences?: {
    minLevel?: string;
    quietHours?: {
      start: string;
      end: string;
    } | null;
    batchMode?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Region {
  code: string;
  name: string;
  aliases: string[];
}

export interface WarningType {
  code: string;
  name: string;
  aliases: string[];
}

export interface SubscriptionStats {
  overall: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    platformBreakdown: Record<string, number>;
  };
  user: {
    hasSubscription: boolean;
    platform: string;
    regions: number;
    warningTypes: number;
    enabled: boolean;
  };
  metadata: {
    availableRegions: Region[];
    availableWarningTypes: WarningType[];
    platformInfo: {
      name: string;
      displayName: string;
      features: string[];
    };
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
