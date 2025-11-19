/**
 * 지도 시각화 관련 상수
 */

// 육상 특보 수준별 색상 (Choropleth용)
export const LAND_ALERT_COLORS: Record<number, string> = {
  0: '#e2e8f0', // 정상 - 회색
  1: '#fef3c7', // 예비특보 - 노란색
  2: '#fed7aa', // 주의보 - 주황색
  3: '#fecaca', // 경보 - 빨간색
};

// 해상 특보 종류 (warningType 코드)
export const MARINE_WARNING_TYPES = ['O', 'N', 'V']; // 해일, 지진해일, 풍랑

// 지역명 매핑 (GeoJSON name → upperRegion)
export const REGION_NAME_MAP: Record<string, string> = {
  '서울특별시': '서울특별시',
  '부산광역시': '부산광역시',
  '대구광역시': '대구광역시',
  '인천광역시': '인천광역시',
  '광주광역시': '광주광역시',
  '대전광역시': '대전광역시',
  '울산광역시': '울산광역시',
  '세종특별자치시': '세종특별자치시',
  '경기도': '경기도',
  '강원특별자치도': '강원도', // GeoJSON과 DB의 명칭 차이 고려
  '충청북도': '충청북도',
  '충청남도': '충청남도',
  '전북특별자치도': '전라북도', // GeoJSON과 DB의 명칭 차이 고려
  '전라남도': '전라남도',
  '경상북도': '경상북도',
  '경상남도': '경상남도',
  '제주특별자치도': '제주특별자치도',
};

// 역매핑: upperRegion → GeoJSON name
export const UPPER_REGION_TO_GEOJSON: Record<string, string> = Object.entries(
  REGION_NAME_MAP
).reduce((acc, [geoName, upperRegion]) => {
  acc[upperRegion] = geoName;
  return acc;
}, {} as Record<string, string>);
