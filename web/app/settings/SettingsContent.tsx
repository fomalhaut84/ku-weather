'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { UserSubscription, Region, WarningType } from '@/types/subscription';
import {
  getMySubscription,
  updateSubscription,
  deleteSubscription,
  getAvailableRegions,
  getAvailableWarningTypes,
} from '@/lib/api';

export default function SettingsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [availableWarningTypes, setAvailableWarningTypes] = useState<WarningType[]>([]);

  // 폼 상태
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedWarningTypes, setSelectedWarningTypes] = useState<string[]>([]);
  const [minLevel, setMinLevel] = useState<string>('1');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [batchMode, setBatchMode] = useState(false);
  const [enabled, setEnabled] = useState(true);

  // 초기 데이터 로드
  useEffect(() => {
    async function loadData() {
      if (!token) {
        setError('인증 토큰이 없습니다. URL을 확인해주세요.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 병렬로 데이터 로드
        const [subscriptionRes, regionsRes, warningTypesRes] = await Promise.all([
          getMySubscription(token),
          getAvailableRegions(),
          getAvailableWarningTypes(),
        ]);

        // 에러 체크
        if (!subscriptionRes.success) {
          setError(subscriptionRes.error || '구독 정보를 불러올 수 없습니다.');
          setLoading(false);
          return;
        }

        if (!regionsRes.success || !warningTypesRes.success) {
          setError('지역 및 특보 목록을 불러올 수 없습니다.');
          setLoading(false);
          return;
        }

        // 데이터 설정
        const subData = subscriptionRes.data!;
        setSubscription(subData);
        setAvailableRegions(regionsRes.data || []);
        setAvailableWarningTypes(warningTypesRes.data || []);

        // 폼 초기값 설정
        setSelectedRegions(subData.targetRegions || []);
        setSelectedWarningTypes(subData.warningTypes || []);
        setMinLevel(subData.preferences?.minLevel || '1');
        setBatchMode(subData.preferences?.batchMode || false);
        setEnabled(subData.enabled);

        if (subData.preferences?.quietHours) {
          setQuietHoursEnabled(true);
          setQuietHoursStart(subData.preferences.quietHours.start);
          setQuietHoursEnd(subData.preferences.quietHours.end);
        }

        setLoading(false);
      } catch (err) {
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    }

    loadData();
  }, [token]);

  // 지역 선택 토글
  const toggleRegion = (regionCode: string) => {
    setSelectedRegions(prev =>
      prev.includes(regionCode)
        ? prev.filter(r => r !== regionCode)
        : [...prev, regionCode]
    );
  };

  // 특보 종류 선택 토글
  const toggleWarningType = (warningCode: string) => {
    setSelectedWarningTypes(prev =>
      prev.includes(warningCode)
        ? prev.filter(w => w !== warningCode)
        : [...prev, warningCode]
    );
  };

  // 저장 핸들러
  const handleSave = async () => {
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // "전국/전체" 선택 시 빈 문자열('')을 빈 배열로 정규화
      const normalizeSelection = (arr: string[]) => {
        if (arr.includes('')) {
          // 빈 문자열이 포함되어 있으면 "전체" 선택을 의미하므로 빈 배열 반환
          return [];
        }
        // 아니면 빈 문자열 제거 후 반환
        return arr.filter(item => item !== '');
      };

      const result = await updateSubscription(token, {
        targetRegions: normalizeSelection(selectedRegions),
        warningTypes: normalizeSelection(selectedWarningTypes),
        enabled,
        preferences: {
          minLevel,
          quietHours: quietHoursEnabled
            ? { start: quietHoursStart, end: quietHoursEnd }
            : null,
          batchMode,
        },
      });

      if (!result.success) {
        setError(result.error || '저장에 실패했습니다.');
        setSaving(false);
        return;
      }

      setSuccess('구독 설정이 성공적으로 저장되었습니다!');
      setSaving(false);

      // 성공 메시지 3초 후 제거
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  // 구독 삭제 핸들러
  const handleDelete = async () => {
    if (!token) return;
    if (!confirm('정말로 구독을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await deleteSubscription(token);

      if (!result.success) {
        setError(result.error || '삭제에 실패했습니다.');
        setSaving(false);
        return;
      }

      alert('구독이 삭제되었습니다.');
      window.location.href = '/';
    } catch (err) {
      setError('삭제 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  // 로딩 중
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error && !subscription) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 mb-2">오류</h2>
          <p className="text-red-600">{error}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">⚙️ 구독 설정</h1>
          <p className="text-gray-600">
            {subscription?.platformDisplayName || subscription?.platform} ({subscription?.displayName})
          </p>
        </div>

        {/* 에러/성공 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        {/* 설정 폼 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          {/* 구독 활성화 */}
          <div className="mb-8">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-3 text-lg font-medium">
                알림 활성화
              </span>
            </label>
            <p className="mt-2 text-sm text-gray-500">
              비활성화하면 모든 알림이 중지됩니다.
            </p>
          </div>

          {/* 모니터링 지역 */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4">📍 모니터링 지역</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {availableRegions.map((region) => (
                <label key={region.code} className="flex items-center cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(region.code)}
                    onChange={() => toggleRegion(region.code)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">{region.name}</span>
                </label>
              ))}
            </div>
            {selectedRegions.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">
                * 지역을 선택하지 않으면 전국 모든 지역의 특보를 받습니다.
              </p>
            )}
          </div>

          {/* 특보 종류 */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4">🌦️ 특보 종류</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {availableWarningTypes.map((warning) => (
                <label key={warning.code} className="flex items-center cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedWarningTypes.includes(warning.code)}
                    onChange={() => toggleWarningType(warning.code)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">{warning.name}</span>
                </label>
              ))}
            </div>
            {selectedWarningTypes.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">
                * 특보 종류를 선택하지 않으면 모든 종류의 특보를 받습니다.
              </p>
            )}
          </div>

          {/* 최소 특보 수준 */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4">📊 최소 특보 수준</h3>
            <div className="space-y-2">
              {[
                { value: '1', label: '예비특보', desc: '주의가 필요한 수준' },
                { value: '2', label: '주의보', desc: '위험 수준' },
                { value: '3', label: '경보', desc: '매우 위험한 수준' },
              ].map((level) => (
                <label key={level.value} className="flex items-start cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="radio"
                    name="minLevel"
                    value={level.value}
                    checked={minLevel === level.value}
                    onChange={(e) => setMinLevel(e.target.value)}
                    className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <div className="font-medium">{level.label}</div>
                    <div className="text-sm text-gray-500">{level.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 조용한 시간대 */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4">🔕 조용한 시간대</h3>
            <label className="flex items-center cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2">조용한 시간대 사용</span>
            </label>

            {quietHoursEnabled && (
              <div className="flex items-center gap-4 pl-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">시작</label>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="border rounded px-3 py-2"
                  />
                </div>
                <span className="mt-6">~</span>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">종료</label>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="border rounded px-3 py-2"
                  />
                </div>
              </div>
            )}
            <p className="mt-2 text-sm text-gray-500">
              지정한 시간대에는 알림이 전송되지 않습니다.
            </p>
          </div>

          {/* 배치 모드 */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4">📦 배치 모드</h3>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => setBatchMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2">배치 모드 사용</span>
            </label>
            <p className="mt-2 text-sm text-gray-500">
              여러 특보를 하나의 메시지로 묶어서 전송합니다.
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-4 pt-6 border-t">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '저장 중...' : '💾 저장'}
            </button>

            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-6 py-3 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🗑️ 구독 삭제
            </button>
          </div>
        </div>

        {/* 하단 링크 */}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:underline"
          >
            📊 특보 현황 보기
          </Link>
          <span className="mx-3 text-gray-400">|</span>
          <Link
            href="/"
            className="text-blue-600 hover:underline"
          >
            홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
