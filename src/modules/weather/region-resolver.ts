import { WeatherRegion } from '../../types/weather';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface GridCoordinateInfo {
  nx: number;
  ny: number;
  name: string;
}

export class RegionResolver {
  private readonly regionUrl = 'https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php';
  private readonly authKey: string;
  private regionCache: Map<string, string> = new Map();

  // CSV 기반 격자 좌표 캐시 (행정구역코드 → 격자 좌표)
  private gridCoordinatesFromCsv: Map<string, GridCoordinateInfo> = new Map();

  // 기상청 특보구역 코드 -> 격자 좌표 매핑
  private readonly gridCoordinates: Map<string, GridCoordinateInfo> = new Map([
    // 서울특별시
    ['L1100000', { nx: 60, ny: 127, name: '서울특별시' }],
    ['L1100100', { nx: 60, ny: 127, name: '서울동남권' }],
    ['L1100200', { nx: 60, ny: 127, name: '서울동북권' }],
    ['L1100300', { nx: 60, ny: 127, name: '서울서남권' }],
    ['L1100400', { nx: 60, ny: 127, name: '서울서북권' }],

    // 광역시
    ['L1110000', { nx: 55, ny: 124, name: '인천광역시' }],
    ['L1120000', { nx: 67, ny: 100, name: '대전광역시' }],
    ['L1130000', { nx: 58, ny: 74, name: '광주광역시' }],
    ['L1140000', { nx: 89, ny: 90, name: '대구광역시' }],
    ['L1150000', { nx: 98, ny: 76, name: '부산광역시' }],
    ['L1160000', { nx: 102, ny: 84, name: '울산광역시' }],
    ['L1170000', { nx: 66, ny: 103, name: '세종특별자치시' }],

    // 경기도
    ['L1010000', { nx: 60, ny: 120, name: '경기도' }],

    // 강원특별자치도
    ['L1020000', { nx: 73, ny: 134, name: '강원특별자치도' }],

    // 충청남도
    ['L1030000', { nx: 55, ny: 107, name: '충청남도' }],

    // 충청북도
    ['L1040000', { nx: 69, ny: 107, name: '충청북도' }],

    // 전북특별자치도
    ['L1050000', { nx: 63, ny: 89, name: '전북특별자치도' }],

    // 전라남도
    ['L1060000', { nx: 51, ny: 67, name: '전라남도' }],

    // 경상북도
    ['L1070000', { nx: 87, ny: 106, name: '경상북도' }],

    // 경상남도
    ['L1080000', { nx: 91, ny: 77, name: '경상남도' }],

    // 제주특별자치도
    ['L1090000', { nx: 52, ny: 38, name: '제주특별자치도' }],
  ]);

  constructor(authKey: string) {
    if (!authKey) {
      throw new Error('WEATHER_API_KEY가 제공되지 않았습니다');
    }
    this.authKey = authKey;
    this.loadGridCoordinatesFromCsv();
  }

  formatDateForAPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}${month}${day}${hour}${minute}`;
  }

  async fetchRegionData(): Promise<void> {
    try {
      // 기상특보와 동일한 기간(7일치)으로 지역 데이터 수집
      const periods = [
        { days: 7, name: '최근 7일' }
      ];

      const allRegions = new Map<string, string>();

      for (const period of periods) {
        try {
          const now = new Date();
          const startDate = new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000);

          const params = {
            tmfc1: this.formatDateForAPI(startDate),
            tmfc2: this.formatDateForAPI(now),
            authKey: this.authKey
          };

          const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

          const url = `${this.regionUrl}?${queryString}`;
          logger.debug(`특보구역 API 호출 (${period.name}): ${url}`);

          const response = await fetch(url);
          if (!response.ok) {
            const errorText = await response.text();
            logger.debug(`특보구역 API 호출 실패 (${period.name}): ${response.status} ${response.statusText} - ${errorText}`);
            continue; // 다음 기간으로 계속
          }

          const responseText = await response.text();

          if (!responseText.trim().startsWith('#START')) {
            logger.debug(`특보구역 API 응답 형식 오류 (${period.name}): ${responseText.substring(0, 100)}`);
            continue;
          }

          const regions = this.parseRegionCSVResponse(responseText);

          // 지역 데이터를 통합 맵에 추가
          regions.forEach(region => {
            if (region.REG_NAME && region.REG_NAME.trim() !== '') {
              allRegions.set(region.REG_ID, region.REG_NAME);
            }
          });

          logger.debug(`${period.name} 기간에서 ${regions.length}개 지역 데이터 수집`);

          // 짧은 지연 후 다음 요청
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          logger.debug(`특보구역 데이터 수집 중 오류 (${period.name}):`, error);
          continue;
        }
      }

      // 캐시에 저장
      this.regionCache.clear();
      allRegions.forEach((name, id) => {
        this.regionCache.set(id, name);
      });

      logger.info(`총 ${allRegions.size}개 특보구역 데이터 로드 완료`);

      // 수집된 지역 데이터 샘플 로그
      const sampleRegions = Array.from(allRegions.entries()).slice(0, 10);
      logger.debug('수집된 지역 데이터 샘플:', sampleRegions);

    } catch (error) {
      logger.error('특보구역 데이터 로드 중 오류:', error);
    }
  }

  private parseRegionCSVResponse(responseText: string): WeatherRegion[] {
    const lines = responseText.split('\n');
    const regions: WeatherRegion[] = [];

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '' || !line.includes(',')) {
        continue;
      }

      try {
        // CSV 형식: REG_ID, TM_ST, TM_ED, REG_SP, REG_UP, REG_KO, REG_NAME, =
        const fields = line.split(',').map(field => field.trim());

        if (fields.length >= 7) {
          const region: WeatherRegion = {
            REG_ID: fields[0],
            TM_ST: fields[1],
            TM_ED: fields[2],
            REG_SP: fields[3],
            REG_UP: fields[4],
            REG_KO: fields[5],
            REG_NAME: fields[6]
          };

          regions.push(region);
        }
      } catch (error) {
        logger.debug(`특보구역 CSV 라인 파싱 오류: ${line}`);
      }
    }

    return regions;
  }

  /**
   * 지역 코드의 상위 지역명을 반환합니다.
   * manualRegionMapping에 있는 실제 상위 지역을 찾을 때까지 재귀적으로 탐색합니다.
   * @param regId 지역 코드 (예: S1311200)
   * @returns 상위 지역명 (예: 남해동부앞바다)
   */
  getUpperRegionName(regId: string): string {
    if (!regId || regId.length !== 8) {
      return '';
    }

    // Codex P1 피드백 반영: 먼저 현재 지역이 이미 광역시/도 단위인지 확인
    const currentName = this.getRegionName(regId);

    // 특수 코드 처리: 울릉도.독도는 경상북도로 매핑
    if (currentName === '울릉도.독도') {
      return '경상북도';
    }

    // 현재 지역이 실제 매핑이고 (fallback이 아니고)
    const isRealMapping = !currentName.startsWith('육상지역(') && !currentName.startsWith('해상지역(');

    // 광역시/도 단위면 자기 자신을 그룹으로 반환
    // endsWith로 정확히 체크 (예: "제주도", "흑산도" 같은 일반 지역 제외)
    // 주의: "앞바다"/"먼바다"는 여기서 체크하지 않음 (하위 지역도 "앞바다"로 끝날 수 있음)
    const isTopLevelGroup = currentName.endsWith('특별시') ||
                            currentName.endsWith('광역시') ||
                            currentName.endsWith('도') ||
                            currentName.endsWith('특별자치시') ||
                            currentName.endsWith('전해상') ||
                            // Codex P1 피드백 #2: 특수 최상위 지역 처리
                            currentName === '전국' ||
                            currentName === '전해상' ||
                            currentName.includes('연안바다') ||
                            currentName.includes('평수구역');

    if (isRealMapping && isTopLevelGroup) {
      return currentName;
    }

    // 지역 코드 계층 구조 분석
    // 예: S1311200 → S1311000 (상위 지역)
    //     S1311000 → S1310000
    //     S1310000 → S1300000
    //     S1300000 → S1000000

    const prefix = regId[0]; // L 또는 S
    const digits = regId.substring(1); // 7자리 숫자

    // 뒤에서부터 연속된 0의 개수를 세어 현재 레벨 파악
    let level = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] === '0') {
        level++;
      } else {
        break;
      }
    }

    // 최상위 레벨 (6개 이상의 0) 또는 매핑되지 않은 코드
    // Codex P1 피드백 #3: "기타" fallback 복원
    if (level >= 6) {
      return '기타';
    }

    // 상위 지역 코드 생성: 한 자리 더 0으로 만들기
    // 예: S1311200 (level 2) → S1311000 (level 3)
    //     S1311000 (level 3) → S1310000 (level 4)
    const nonZeroLength = 7 - level; // 0이 아닌 부분의 길이
    const parentDigits = digits.substring(0, nonZeroLength - 1) + '0'.repeat(level + 1);
    const parentRegId = prefix + parentDigits;

    // 상위 지역명 조회
    const parentName = this.getRegionName(parentRegId);

    // 상위 지역이 실제 매핑이고 (fallback이 아니고)
    const isParentRealMapping = !parentName.startsWith('육상지역(') && !parentName.startsWith('해상지역(');

    // 광역시/도 단위 또는 해상 그룹핑 단위면 반환
    const isParentTopLevel = parentName.endsWith('특별시') ||
                             parentName.endsWith('광역시') ||
                             parentName.endsWith('도') ||
                             parentName.endsWith('특별자치시') ||
                             parentName.endsWith('전해상') ||
                             // Codex P1 피드백 #4: 해상 중간 그룹핑 단위 추가
                             parentName.endsWith('앞바다') ||
                             parentName.endsWith('먼바다') ||
                             // Codex P1 피드백 #2: 특수 최상위 지역 처리
                             parentName === '전국' ||
                             parentName === '전해상' ||
                             parentName.includes('연안바다') ||
                             parentName.includes('평수구역');

    if (isParentRealMapping && isParentTopLevel) {
      return parentName;
    }

    // 아니면 계속 상위로 올라가서 광역시/도 단위를 찾음
    return this.getUpperRegionName(parentRegId);
  }

  getRegionName(regId: string): string {
    // 먼저 캐시에서 찾기
    const cachedName = this.regionCache.get(regId);
    if (cachedName) {
      return cachedName;
    }

    // area_code.md 기반 완전한 지역 매핑 (모든 지역 코드 포함)
    const manualRegionMapping: Record<string, string> = {
      // === 육상지역 (L) ===
      // 전국
      'L1000000': '전국',

      // 경기도
      'L1010000': '경기도',
      'L1010200': '광명시',
      'L1010300': '과천시',
      'L1010400': '안산시',
      'L1010500': '시흥시',
      'L1010600': '부천시',
      'L1010700': '김포시',
      'L1010800': '인천광역시',
      'L1010900': '강화군',
      'L1011100': '동두천시',
      'L1011200': '연천군',
      'L1011300': '포천시',
      'L1011400': '가평군',
      'L1011500': '고양시',
      'L1011600': '양주시',
      'L1011700': '의정부시',
      'L1011800': '파주시',
      'L1011900': '수원시',
      'L1012000': '성남시',
      'L1012100': '안양시',
      'L1012200': '구리시',
      'L1012300': '남양주시',
      'L1012400': '오산시',
      'L1012500': '평택시',
      'L1012600': '군포시',
      'L1012700': '의왕시',
      'L1012800': '하남시',
      'L1012900': '용인시',
      'L1013000': '이천시',
      'L1013100': '안성시',
      'L1013200': '화성시',
      'L1013300': '여주시',
      'L1013400': '광주시',
      'L1013500': '양평군',
      'L1013600': '옹진군',
      'L1014000': '서해5도',
      'L1014100': '서해5도',

      // 강원도
      'L1020000': '강원도',
      'L1020110': '강릉시평지',
      'L1020210': '동해시평지',
      'L1020300': '태백시',
      'L1020410': '삼척시평지',
      'L1020510': '속초시평지',
      'L1020610': '고성군평지',
      'L1020710': '양양군평지',
      'L1020800': '영월군',
      'L1020910': '평창군평지',
      'L1021010': '정선군평지',
      'L1021100': '횡성군',
      'L1021200': '원주시',
      'L1021300': '철원군',
      'L1021400': '화천군',
      'L1021510': '홍천군평지',
      'L1021600': '춘천시',
      'L1021710': '양구군평지',
      'L1021810': '인제군평지',
      'L1025020': '강원북부산지',
      'L1026020': '강원중부산지',
      'L1027020': '강원남부산지',

      // 충청남도
      'L1030000': '충청남도',
      'L1030100': '대전광역시',
      'L1030200': '천안시',
      'L1030300': '공주시',
      'L1030400': '아산시',
      'L1030500': '논산시',
      'L1030600': '금산군',
      'L1030800': '부여군',
      'L1030900': '청양군',
      'L1031000': '예산군',
      'L1031100': '태안군',
      'L1031200': '당진시',
      'L1031300': '서산시',
      'L1031400': '보령시',
      'L1031500': '서천군',
      'L1031600': '홍성군',
      'L1031700': '계룡시',
      'L1031800': '세종특별자치시',

      // 충청북도
      'L1040000': '충청북도',
      'L1040100': '청주시',
      'L1040300': '보은군',
      'L1040400': '괴산군',
      'L1040600': '옥천군',
      'L1040700': '영동군',
      'L1040800': '충주시',
      'L1040900': '제천시',
      'L1041000': '진천군',
      'L1041100': '음성군',
      'L1041200': '단양군',
      'L1041300': '증평군',

      // 전라남도
      'L1050000': '전라남도',
      'L1050100': '광주광역시',
      'L1050200': '나주시',
      'L1050300': '담양군',
      'L1050400': '곡성군',
      'L1050500': '구례군',
      'L1050600': '장성군',
      'L1050700': '화순군',
      'L1050800': '고흥군',
      'L1050900': '보성군',
      'L1051000': '여수시',
      'L1051100': '광양시',
      'L1051200': '순천시',
      'L1051300': '장흥군',
      'L1051400': '강진군',
      'L1051500': '해남군',
      'L1051600': '완도군',
      'L1051700': '영암군',
      'L1051800': '무안군',
      'L1051900': '함평군',
      'L1052000': '영광군',
      'L1052100': '목포시',
      'L1052200': '신안군(흑산면제외)',
      'L1052300': '진도군',
      'L1052400': '흑산도.홍도',
      'L1052500': '흑산도.홍도',
      'L1052600': '거문도.초도',

      // 전북자치도
      'L1060000': '전북자치도',
      'L1060100': '고창군',
      'L1060200': '부안군',
      'L1060300': '군산시',
      'L1060400': '김제시',
      'L1060500': '완주군',
      'L1060600': '진안군',
      'L1060700': '무주군',
      'L1060800': '장수군',
      'L1060900': '임실군',
      'L1061000': '순창군',
      'L1061100': '익산시',
      'L1061200': '정읍시',
      'L1061300': '전주시',
      'L1061400': '남원시',

      // 경상북도
      'L1070000': '경상북도',
      'L1070100': '대구광역시',
      'L1070200': '군위군',
      'L1070300': '구미시',
      'L1070400': '영천시',
      'L1070500': '경산시',
      'L1070700': '청도군',
      'L1070800': '고령군',
      'L1070900': '성주군',
      'L1071000': '칠곡군',
      'L1071100': '김천시',
      'L1071200': '상주시',
      'L1071300': '문경시',
      'L1071400': '예천군',
      'L1071500': '안동시',
      'L1071600': '영주시',
      'L1071700': '의성군',
      'L1071800': '청송군',
      'L1071910': '영양군평지',
      'L1072010': '봉화군평지',
      'L1072100': '울릉도.독도',
      'L1072200': '영덕군',
      'L1072310': '울진군평지',
      'L1072400': '포항시',
      'L1072500': '경주시',
      'L1075020': '경북북동산지',

      // 경상남도
      'L1080000': '경상남도',
      'L1080500': '양산시',
      'L1080600': '창원시',
      'L1080900': '김해시',
      'L1081000': '밀양시',
      'L1081100': '의령군',
      'L1081200': '함안군',
      'L1081300': '창녕군',
      'L1081400': '진주시',
      'L1081500': '하동군',
      'L1081600': '산청군',
      'L1081700': '함양군',
      'L1081800': '거창군',
      'L1081900': '합천군',
      'L1082000': '통영시',
      'L1082100': '사천시',
      'L1082200': '거제시',
      'L1082300': '고성군',
      'L1082400': '남해군',
      'L1082500': '부산동부',
      'L1082600': '부산중부',
      'L1082700': '부산서부',
      'L1082800': '울산동부',
      'L1082900': '울산서부',

      // 제주도
      'L5010000': '제주도',  // 제주특별자치도 (상위 코드)
      'L1090000': '제주도',
      'L1090500': '제주도산지',
      'L1090600': '제주도서부',
      'L1090700': '제주도북부',
      'L1090800': '제주도동부',
      'L1090900': '제주도남부',
      'L1091000': '추자도',
      'L1091100': '제주도북부중산간',
      'L1091200': '제주도남부중산간',

      // 서울특별시
      'L1100000': '서울특별시',
      'L1100100': '서울동남권',
      'L1100200': '서울동북권',
      'L1100300': '서울서남권',
      'L1100400': '서울서북권',

      // 광역시/특별시/자치시
      'L1110000': '인천광역시',
      'L1120000': '대전광역시',
      'L1130000': '광주광역시',
      'L1140000': '대구광역시',
      'L1150000': '부산광역시',
      'L1160000': '울산광역시',
      'L1170000': '세종특별자치시',
      'L1600000': '울릉도.독도',

      // === 해상지역 (S) ===
      // 전해상
      'S1000000': '전해상',

      // 동해전해상
      'S1100000': '동해전해상',

      // 동해남부전해상
      'S1130000': '동해남부전해상',
      'S1131000': '동해남부앞바다',
      'S1131100': '울산앞바다',
      'S1131200': '경북남부앞바다',
      'S1131300': '경북북부앞바다',
      'S1132110': '동해남부남쪽안쪽먼바다',
      'S1132120': '동해남부남쪽바깥먼바다',
      'S1132210': '동해남부북쪽안쪽먼바다',
      'S1132220': '동해남부북쪽바깥먼바다',

      // 동해중부전해상
      'S1150000': '동해중부전해상',
      'S1151000': '동해중부앞바다',
      'S1151100': '강원북부앞바다',
      'S1151200': '강원중부앞바다',
      'S1151300': '강원남부앞바다',
      'S1152010': '동해중부안쪽먼바다',
      'S1152020': '동해중부바깥먼바다',

      // 서해전해상
      'S1200000': '서해전해상',

      // 서해남부전해상
      'S1230000': '서해남부전해상',
      'S1231000': '서해남부앞바다',
      'S1231100': '전북북부앞바다',
      'S1231200': '전북남부앞바다',
      'S1231300': '전남북부서해앞바다',
      'S1231400': '전남중부서해앞바다',
      'S1231500': '전남남부서해앞바다',
      'S1232110': '서해남부북쪽안쪽먼바다',
      'S1232120': '서해남부북쪽바깥먼바다',
      'S1232210': '서해남부남쪽안쪽먼바다',
      'S1232220': '서해남부남쪽바깥먼바다',

      // 서해중부전해상
      'S1250000': '서해중부전해상',
      'S1251000': '서해중부앞바다',
      'S1251100': '인천·경기북부앞바다',
      'S1251200': '인천·경기남부앞바다',
      'S1251300': '충남북부앞바다',
      'S1251400': '충남남부앞바다',
      'S1252010': '서해중부안쪽먼바다',
      'S1252020': '서해중부바깥먼바다',

      // 남해전해상
      'S1300000': '남해전해상',

      // 남해동부전해상
      'S1310000': '남해동부전해상',
      'S1311000': '남해동부앞바다',
      'S1311100': '부산앞바다',
      'S1311200': '경남서부남해앞바다',
      'S1311300': '경남중부남해앞바다',
      'S1311400': '거제시동부앞바다',
      'S1312010': '남해동부안쪽먼바다',
      'S1312020': '남해동부바깥먼바다',

      // 남해서부전해상
      'S1320000': '남해서부전해상',
      'S1321000': '남해서부앞바다',
      'S1321100': '전남서부남해앞바다',
      'S1321200': '전남동부남해앞바다',
      'S1322100': '남해서부서쪽먼바다',
      'S1322200': '남해서부동쪽먼바다',

      // 제주도해상
      'S1323000': '제주도앞바다',
      'S1323100': '제주도북부앞바다',
      'S1323200': '제주도동부앞바다',
      'S1323300': '제주도남부앞바다',
      'S1323400': '제주도서부앞바다',
      'S1324020': '제주도남쪽바깥먼바다',
      'S1324110': '제주도남동쪽안쪽먼바다',
      'S1324210': '제주도남서쪽안쪽먼바다',
      'S1330000': '제주도전해상',

      // 연안바다/평수구역 (일부 주요지역만)
      'S2000000': '연안바다/평수구역'
    };

    // 수동 매핑에서 찾기
    if (manualRegionMapping[regId]) {
      return manualRegionMapping[regId];
    }

    // 패턴 기반 기본 처리
    if (regId.startsWith('L')) {
      return `육상지역(${regId})`;
    }

    if (regId.startsWith('S')) {
      return `해상지역(${regId})`;
    }

    return regId;
  }

  /**
   * 한국 표준시(KST, UTC+9) 기준 현재 시간 반환
   * 서버가 UTC나 다른 시간대에서 실행되더라도 KST 시간을 정확히 계산
   */
  getKSTNow(): Date {
    const now = new Date();
    // 현재 시간을 UTC 기준으로 변환
    const utcMillis = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    // UTC에 9시간(KST 오프셋) 추가
    const kstMillis = utcMillis + (9 * 60 * 60 * 1000);
    return new Date(kstMillis);
  }

  /**
   * 하위 지역 코드를 광역시도 코드로 변환
   * @param regionId 지역 코드 (예: L1100510)
   * @returns 광역시도 코드 (예: L1100000)
   */
  getUpperRegionCode(regionId: string): string {
    // 이미 gridCoordinates에 있으면 그대로 반환
    if (this.gridCoordinates.has(regionId)) {
      return regionId;
    }

    // L로 시작하는 8자리 이상 코드면 광역시도 코드로 변환
    // 예: L1100510 → L1100000, L1010100 → L1010000
    if (regionId.startsWith('L') && regionId.length >= 8) {
      const upperCode = regionId.substring(0, 5) + '000';
      if (this.gridCoordinates.has(upperCode)) {
        logger.debug(`지역 코드 ${regionId}를 광역시도 코드 ${upperCode}로 매핑`);
        return upperCode;
      }
    }

    // 찾지 못하면 원본 반환
    return regionId;
  }

  /**
   * CSV 파일에서 격자 좌표 데이터 로드
   * 파일: 단기예보지점좌표(위경도)_202504.csv
   * 형식: 구분,행정구역코드,1단계,2단계,3단계,격자 X,격자 Y,경도(시),경도(분),경도(초),위도(시),위도(분),위도(초),경도(초/100),위도(초/100),위치업데이트
   */
  private loadGridCoordinatesFromCsv(): void {
    try {
      const csvPath = path.join(process.cwd(), '단기예보지점좌표(위경도)_202504.csv');

      if (!fs.existsSync(csvPath)) {
        logger.warn(`격자 좌표 CSV 파일을 찾을 수 없습니다: ${csvPath}`);
        logger.warn('하드코딩된 광역시도 좌표만 사용됩니다.');
        return;
      }

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n');
      let loadedCount = 0;

      // 첫 번째 라인은 헤더이므로 스킵
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split(',');
        if (fields.length < 7) continue;

        const adminCode = fields[1].trim(); // 행정구역코드 (10자리 숫자)
        const region1 = fields[2].trim();   // 1단계 (시/도)
        const region2 = fields[3].trim();   // 2단계 (시/군/구)
        const region3 = fields[4].trim();   // 3단계 (읍/면/동)
        const nx = parseInt(fields[5].trim(), 10);
        const ny = parseInt(fields[6].trim(), 10);

        if (isNaN(nx) || isNaN(ny) || !adminCode) continue;

        // 지역명 조합
        let name = region1;
        if (region2) name += ` ${region2}`;
        if (region3) name += ` ${region3}`;

        // 행정구역코드를 그대로 키로 사용
        this.gridCoordinatesFromCsv.set(adminCode, { nx, ny, name });
        loadedCount++;
      }

      logger.info(`CSV 파일에서 ${loadedCount}개 지역의 격자 좌표를 로드했습니다.`);
    } catch (error) {
      logger.error('CSV 파일 로드 중 오류:', error);
      logger.warn('하드코딩된 광역시도 좌표만 사용됩니다.');
    }
  }

  /**
   * REG_ID를 행정구역코드로 변환
   * @param regionId 특보구역 코드 (예: L1100000, L1100510)
   * @returns 행정구역코드 (10자리, 예: 1100000000)
   */
  private convertRegIdToAdminCode(regionId: string): string | null {
    // L로 시작하는 8자리 코드
    if (!regionId.startsWith('L') || regionId.length < 8) {
      logger.warn(`잘못된 지역 코드 형식: ${regionId}`);
      return null;
    }

    // L 제거 (L1100000 → 1100000)
    const numericPart = regionId.substring(1);

    // 7자리 숫자 뒤에 000 추가 (1100000 → 1100000000)
    const adminCode = numericPart + '000';

    return adminCode;
  }

  /**
   * 격자 좌표 조회 (CSV 우선, 하드코딩 fallback)
   * @param regionId 특보구역 코드 (예: L1100000)
   * @returns 격자 좌표 정보
   */
  getGridCoordinates(regionId: string): GridCoordinateInfo | null {
    // 1. 행정구역코드로 변환
    const adminCode = this.convertRegIdToAdminCode(regionId);

    // 2. CSV에서 조회 (우선)
    if (adminCode && this.gridCoordinatesFromCsv.has(adminCode)) {
      const gridInfo = this.gridCoordinatesFromCsv.get(adminCode)!;
      logger.debug(`CSV에서 격자 좌표 조회 성공: ${regionId} → ${adminCode} → (${gridInfo.nx}, ${gridInfo.ny})`);
      return gridInfo;
    }

    // 3. 하드코딩된 광역시도 좌표에서 조회 (fallback)
    if (this.gridCoordinates.has(regionId)) {
      const gridInfo = this.gridCoordinates.get(regionId)!;
      logger.debug(`하드코딩 좌표 조회 성공: ${regionId} → (${gridInfo.nx}, ${gridInfo.ny})`);
      return gridInfo;
    }

    // 4. 상위 지역 코드로 재시도
    const upperRegionId = this.getUpperRegionCode(regionId);
    if (upperRegionId !== regionId) {
      logger.debug(`상위 지역 코드로 재시도: ${regionId} → ${upperRegionId}`);
      return this.getGridCoordinates(upperRegionId);
    }

    logger.warn(`지역 코드 ${regionId}에 대한 격자 좌표를 찾을 수 없습니다`);
    return null;
  }
}
