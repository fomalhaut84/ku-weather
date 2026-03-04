'use client';

import { WARNING_TYPE_EMOJI } from '@/types/alert';
import type { Region, WarningType } from '@/types/subscription';

interface AlertFiltersProps {
  selectedRegion: string;
  onRegionChange: (v: string) => void;
  selectedWarningType: string;
  onWarningTypeChange: (v: string) => void;
  selectedWarningLevel: string;
  onWarningLevelChange: (v: string) => void;
  availableRegions: Region[];
  availableWarningTypes: WarningType[];
  hasActiveFilters: boolean;
  onReset: () => void;
}

export default function AlertFilters({
  selectedRegion,
  onRegionChange,
  selectedWarningType,
  onWarningTypeChange,
  selectedWarningLevel,
  onWarningLevelChange,
  availableRegions,
  availableWarningTypes,
  hasActiveFilters,
  onReset,
}: AlertFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">🔍 필터</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">지역</label>
          <select
            value={selectedRegion}
            onChange={(e) => onRegionChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">전체 지역</option>
            {availableRegions.map((region) => (
              <option key={region.code} value={region.code}>{region.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">특보 종류</label>
          <select
            value={selectedWarningType}
            onChange={(e) => onWarningTypeChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">전체 특보</option>
            {availableWarningTypes.map((warning) => (
              <option key={warning.code} value={warning.code}>
                {WARNING_TYPE_EMOJI[warning.code] || ''} {warning.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">특보 수준</label>
          <select
            value={selectedWarningLevel}
            onChange={(e) => onWarningLevelChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">전체 수준</option>
            <option value="1">⚠️ 예비특보</option>
            <option value="2">🟠 주의보</option>
            <option value="3">🔴 경보</option>
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
