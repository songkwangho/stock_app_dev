// 서버 DB timestamp를 안전하게 Date로 파싱.
// 두 형식을 모두 처리한다 (PostgreSQL 전환 후에도 SQLite 레거시 덤프 호환성 유지):
//   - PostgreSQL TIMESTAMPTZ (현재 기본): ISO 8601 "2024-01-15T08:00:00.000Z" — Z/오프셋 포함, new Date() 직접 가능
//   - SQLite CURRENT_TIMESTAMP (레거시): "2024-01-15 08:00:00" — UTC지만 T/Z 없음, JS new Date()가 로컬 시간으로 잘못 해석
// 입력: 서버 timestamp 문자열
function parseServerDate(input: string): Date {
  // Z나 +HH:MM 접미사가 있으면 ISO 8601 — 그대로 파싱
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) return new Date(input);
  // 접미사 없으면 SQLite 레거시 형식 — 'T'와 'Z' 추가해 명시 UTC로 해석
  return new Date(input.replace(' ', 'T') + 'Z');
}

// KST(UTC+9) 기준 시간 정보 추출 (사용자 시간대와 무관)
function getKSTNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utcMs + 9 * 60 * 60000);
  return { day: kst.getUTCDay(), hour: kst.getUTCHours() };
}

// 데이터 신선도 라벨 생성 (KST 기준 장중/장외 자동 판단)
// lastUpdated 형식: PostgreSQL TIMESTAMPTZ (ISO 8601) 또는 SQLite 레거시 (UTC "YYYY-MM-DD HH:MM:SS")
// 공휴일은 별도 처리하지 않음 (알려진 제약 — 광복절 등 평일 휴장일에 "장중 데이터"로 오표시 가능)
export function getDataFreshnessLabel(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) return '데이터 없음';

  const updated = parseServerDate(lastUpdated);
  const diffMs = Date.now() - updated.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  const { day, hour } = getKSTNow();
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = isWeekday && hour >= 9 && hour < 16;

  const timeStr = updated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const contextLabel = isMarketHours ? '장중 데이터' : '전일 종가';

  if (diffMin < 1) return `방금 (${timeStr}, ${contextLabel})`;
  if (diffMin < 60) return `${diffMin}분 전 (${timeStr}, ${contextLabel})`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전 (${timeStr}, ${contextLabel})`;
  return `${Math.floor(diffMin / 1440)}일 전 (${timeStr}, ${contextLabel})`;
}

// 짧은 라벨 (대시보드용 — 컨텍스트 라벨 제외)
// lastUpdated 형식: PostgreSQL TIMESTAMPTZ (ISO 8601) 또는 SQLite 레거시 (UTC "YYYY-MM-DD HH:MM:SS")
// parseServerDate를 통해 두 형식 모두 UTC로 명시 해석되어 KST와 9시간 오차가 발생하지 않는다.
export function getDataFreshnessShort(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) return '';
  const diffMs = Date.now() - parseServerDate(lastUpdated).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
  return `${Math.floor(mins / 1440)}일 전`;
}
