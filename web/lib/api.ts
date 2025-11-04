/**
 * API 클라이언트 함수
 */

import type {
  UserSubscription,
  Region,
  WarningType,
  SubscriptionStats,
  ApiResponse
} from '@/types/subscription';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * API 요청 헬퍼 함수
 */
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * 토큰으로 사용자 인증
 */
export async function authenticateToken(token: string): Promise<ApiResponse<UserSubscription>> {
  return fetchAPI<UserSubscription>('/api/subscriptions/auth', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * 내 구독 정보 조회
 */
export async function getMySubscription(token: string): Promise<ApiResponse<UserSubscription>> {
  return fetchAPI<UserSubscription>('/api/subscriptions/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * 구독 설정 업데이트
 */
export async function updateSubscription(
  token: string,
  subscription: Partial<UserSubscription>
): Promise<ApiResponse<{ subscription: UserSubscription; regions: string[]; warningTypes: string[] }>> {
  return fetchAPI('/api/subscriptions/update', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(subscription),
  });
}

/**
 * 구독 삭제
 */
export async function deleteSubscription(token: string): Promise<ApiResponse<void>> {
  return fetchAPI('/api/subscriptions/delete', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * 구독 통계 조회
 */
export async function getSubscriptionStats(token: string): Promise<ApiResponse<SubscriptionStats>> {
  return fetchAPI<SubscriptionStats>('/api/subscriptions/stats', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * 사용 가능한 지역 목록 조회
 */
export async function getAvailableRegions(): Promise<ApiResponse<Region[]>> {
  return fetchAPI<Region[]>('/api/subscriptions/regions');
}

/**
 * 사용 가능한 특보 종류 목록 조회
 */
export async function getAvailableWarningTypes(): Promise<ApiResponse<WarningType[]>> {
  return fetchAPI<WarningType[]>('/api/subscriptions/warning-types');
}
