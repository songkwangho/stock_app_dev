// SQLite CURRENT_TIMESTAMP는 UTC 기준 "YYYY-MM-DD HH:MM:SS" 형식.
// JS new Date()로 파싱하면 로컬 시간으로 잘못 해석되므로 'Z'를 붙여 UTC로 명시.
// 입력: "2024-01-15 08:00:00" (UTC) | ISO 8601 (Z 포함) | Date 객체
function parseServerDate(input: string): Date {
  // ISO 8601 (Z나 +HH:MM 포함)이면 그대로 파싱
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) return new Date(input);
  // SQLite 형식 "YYYY-MM-DD HH:MM:SS"이면 'T'와 'Z' 추가하여 UTC로 명시
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
// lastUpdated 형식: SQLite CURRENT_TIMESTAMP (UTC "YYYY-MM-DD HH:MM:SS") 또는 ISO 8601
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
// lastUpdated 형식: SQLite CURRENT_TIMESTAMP (UTC "YYYY-MM-DD HH:MM:SS") 또는 ISO 8601
// parseServerDate를 통해 SQLite 형식을 UTC로 명시하여 KST와의 9시간 오차를 방지한다.
export function getDataFreshnessShort(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) return '';
  const diffMs = Date.now() - parseServerDate(lastUpdated).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
  return `${Math.floor(mins / 1440)}일 전`;
}
