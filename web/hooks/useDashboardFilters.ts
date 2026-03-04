import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAvailableRegions, getAvailableWarningTypes } from '@/lib/api';
import type { Region, WarningType } from '@/types/subscription';

interface UseDashboardFiltersReturn {
  selectedRegion: string;
  setSelectedRegion: (v: string) => void;
  selectedWarningType: string;
  setSelectedWarningType: (v: string) => void;
  selectedWarningLevel: string;
  setSelectedWarningLevel: (v: string) => void;
  availableRegions: Region[];
  availableWarningTypes: WarningType[];
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

export function useDashboardFilters(): UseDashboardFiltersReturn {
  const searchParams = useSearchParams();

  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedWarningType, setSelectedWarningType] = useState('');
  const [selectedWarningLevel, setSelectedWarningLevel] = useState('');
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [availableWarningTypes, setAvailableWarningTypes] = useState<WarningType[]>([]);

  // 초기 메타데이터 로드 + URL 파라미터 동기화
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [regionsRes, warningTypesRes] = await Promise.all([
          getAvailableRegions(),
          getAvailableWarningTypes(),
        ]);

        if (regionsRes.success) {
          setAvailableRegions(regionsRes.data || []);
        }
        if (warningTypesRes.success) {
          setAvailableWarningTypes(warningTypesRes.data || []);
        }

        // URL 파라미터에서 필터 설정
        const regionParam = searchParams.get('region');
        const typeParam = searchParams.get('type');
        const levelParam = searchParams.get('level');

        if (regionParam) {
          const regionObj = regionsRes.data?.find(
            (r) => r.code === regionParam || r.name === regionParam
          );
          if (regionObj) {
            setSelectedRegion(regionObj.code);
          }
        }
        if (typeParam) setSelectedWarningType(typeParam);
        if (levelParam) setSelectedWarningLevel(levelParam);
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    }

    loadMetadata();
  }, [searchParams]);

  const resetFilters = () => {
    setSelectedRegion('');
    setSelectedWarningType('');
    setSelectedWarningLevel('');
  };

  const hasActiveFilters = !!(selectedRegion || selectedWarningType || selectedWarningLevel);

  return {
    selectedRegion,
    setSelectedRegion,
    selectedWarningType,
    setSelectedWarningType,
    selectedWarningLevel,
    setSelectedWarningLevel,
    availableRegions,
    availableWarningTypes,
    resetFilters,
    hasActiveFilters,
  };
}
