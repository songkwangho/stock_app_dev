# Frontend Documentation — 구조·스토어·컴포넌트·타입

> UX 원칙·온보딩·면책·디자인시스템은 `docs/FRONTEND_UX.md` 참조

---

## 개요
- **프레임워크**: React 19 + TypeScript / **번들러**: Vite 7
- **스타일**: Tailwind CSS v4 (다크 테마) / **차트**: Recharts v3.7
- **상태관리**: Zustand v5 (도메인별 스토어 분리) / **아이콘**: Lucide React
- **HTTP**: Axios (X-Device-Id 헤더 자동 첨부) / **모바일**: Capacitor (래핑 예정)

---

## 사용자 식별 (device_id)

로그인 없이 기기별 UUID로 개인 데이터를 서버에서 분리한다. 환경별 저장소가 달라지므로 `DeviceIdStorage` 인터페이스로 추상화한다.

```typescript
// src/storage/deviceId.ts
interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}

class WebDeviceIdStorage implements DeviceIdStorage {
  get() { return localStorage.getItem('device_id'); }
  set(id: string) { localStorage.setItem('device_id', id); }
}
// Capacitor 환경: CapacitorDeviceIdStorage implements DeviceIdStorage { ... }

function getDeviceId(storage: DeviceIdStorage = new WebDeviceIdStorage()): string {
  let id = storage.get();
  if (!id) { id = crypto.randomUUID(); storage.set(id); }
  return id;
}
```

```typescript
// src/api/stockApi.ts — Axios 인터셉터
axios.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});
```

> **Capacitor 전환 시**: `WebDeviceIdStorage` → `CapacitorDeviceIdStorage` 구현체만 교체. `getDeviceId()` 호출부 변경 없음.

---

## 상태관리 (Zustand — 4개 도메인 스토어 + Toast)

컴포넌트는 필요한 스토어만 import (관심사 분리). `navigateTo`는 `useNavigationStore`에서만 호출.

### useNavigationStore
**관심사**: UI 탐색 상태 (도메인 데이터 없음)

```typescript
interface NavigationState {
  activeTab: string;
  selectedStock: StockSummary | null;
  previousTab: string;        // 상세뷰 뒤로가기 시 복귀 탭
  pendingFocus: string | null; // 페이지 진입 시 자동 트리거할 포커스 식별자
}
interface NavigationActions {
  navigateTo(tab: string, options?: { focus?: string }): void;
  handleDetailClick(stock: StockSummary): void;
  goBack(): void;
  consumePendingFocus(): string | null; // pendingFocus 읽고 즉시 비움
}
```
> `pendingFocus` 현재 사용처: 온보딩 "직접 추가할게요" → `'add-holding-search'`. 사용처 증가 전까지 이 형태 유지.

### usePortfolioStore
**관심사**: 보유종목 도메인 상태

```typescript
interface PortfolioState { holdings: Holding[]; isLoading: boolean; error: string | null; }
interface PortfolioActions {
  fetchHoldings(): Promise<void>;
  addHolding(stock: AddHoldingPayload): Promise<void>;
  updateHolding(stock: UpdateHoldingPayload): Promise<void>;
  deleteHolding(code: string): Promise<void>;
}
```

### useAlertStore
**관심사**: 알림 상태

```typescript
interface AlertState { alerts: Alert[]; unreadCount: number; }
interface AlertActions {
  fetchAlerts(): Promise<void>;
  fetchUnreadCount(): Promise<void>;
  markAllRead(): Promise<void>;
  deleteAlert(id: number): Promise<void>;
}
```

### useWatchlistStore
**관심사**: 관심종목 상태 (WatchlistPage + HoldingsAnalysisPage 탭 공유)

```typescript
interface WatchlistState { items: WatchlistItem[]; isLoading: boolean; lastFetched: number; }
interface WatchlistActions {
  fetchWatchlist(force?: boolean): Promise<void>; // TTL 30초 이내 재호출 스킵
  addToWatchlist(code: string): Promise<void>;    // 내부적으로 force 호출
  removeFromWatchlist(code: string): Promise<void>; // optimistic + 실패 시 롤백 + 토스트
}
```
> 삭제 실패 시: 이전 배열로 롤백 + `useToastStore.addToast('관심종목 삭제에 실패했어요. 다시 시도해 주세요.', 'error')`. 단순 재출현은 사용자 혼란 유발하므로 반드시 토스트와 함께.

---

## 페이지 구조 (7개, 전부 lazy loading)

### DashboardPage (`activeTab === 'dashboard'`)
스토어: `useNavigationStore`, `usePortfolioStore`
- 포트폴리오 요약 (총자산, 수익률 카드, 종목수), 수익률 추이 AreaChart (20일), 자산배분 PieChart, 보유종목 리스트 (읽기전용)
- 빈 포트폴리오 CTA: `onboarding_done` 설정된 **재방문** 시에만 표시
- **수익률 카드**:
  - 제목 "수익률 (투자 대비 수익, 매입가 기준)" — 비교 기준 명시
  - subtitle: `₩원금 → ₩평가액 (가중 평균)` (KOSPI 라인은 별도 tooltip 영역으로 분리)
  - **KOSPI 비교 ℹ️ 툴팁**: `StatCard.tooltip` props로 별도 표시 — `오늘 KOSPI ±N%` + 클릭 시 인라인 툴팁 "KOSPI는 오늘 하루 변동률이에요. 내 수익률(매입 이후 전체 기간)과 직접 비교하기 어려워요." 두 수치가 같은 줄에 나란히 표시되지 않도록 분리해 초보자 직접 비교 오해 방지
- **부분 로딩 처리**: KOSPI 데이터(`marketIndices`)가 비어 있거나 KOSPI 항목이 없으면 tooltip 영역 자체를 숨김. 포트폴리오 히스토리는 차트 영역에서 별도 로딩 스피너 + ErrorBanner(`historyError` + retry)로 표시
- **포트폴리오 추이 차트**:
  - 컴포넌트: **`ComposedChart`** (16차 버그-C에서 `AreaChart`에 `Line` 혼용하던 비공식 패턴 교체)
  - X축: `m/d` 형식 (예: "1/15"). 차트 위에 첫·마지막 데이터 포인트의 한국어 풀 날짜 표시 (예: "1월 15일 ~ 2월 4일")
  - Y축: **`formatKoreanWon()`** — `₩35000k` 영문 k 표기 → `₩N만`/`₩N.N억` 한국식 (16차 5-2)
  - 툴팁: `labelFormatter`로 풀 날짜(`fullDate`) + `formatter`로 평가금액/투자원금 표시
  - **동적 색상**: `avgProfitRate < 0`이면 라인·그라디언트가 빨간색(`#ef4444`), 아니면 파란색(`#3b82f6`)
  - **"오늘" 라벨 (14차)**: 마지막 데이터 포인트의 X축 라벨과 툴팁 `fullDate`에 `(오늘)` 접미사를 붙여 초보자가 어느 날이 현재인지 즉시 파악할 수 있게 한다.
  - **투자원금 라인 (15차)**: `cost` 값을 회색(`#94a3b8`) 파선(`strokeDasharray="5 5"`) Line으로 평가금액 위에 오버레이. value 라인이 cost 라인 위에 있으면 수익, 아래면 손실 → "금액이 올랐는데 손해인가?" 혼동 해소. Legend 표기: "평가금액 (현재 가치)" / "투자원금 (산 가격 합계)".
  - **해석 힌트 (17차 5-1)**: 차트 상단에 "💡 평가금액(실선)이 투자원금(파선) 위에 있으면 수익 중, 아래면 손실 중" 한 줄 안내. Legend만으로는 초보자가 두 라인의 위아래 관계를 해석하지 못함.
  - **빈 포트폴리오 폴백 (14차)**: `holdings.length === 0`일 때 AreaChart 대신 "📈 종목을 추가하면 수익률 그래프를 볼 수 있어요" CTA 카드 렌더링 (Recharts 빈 차트가 오류 없이 빈 영역만 표시되어 초보자가 오해하는 문제 해소).
  - **자동 재시도 (14차)**: `historyError` ErrorBanner는 `autoRetryMs={3000}`. Neon sleep 해제 직후 한 번만 자동 재시도.
- **자산배분 PieChart 단일 종목 폴백 (15차)**: `holdings.length === 1`이면 PieChart(원 1개로 의미 없음) 대신 종목 카드 + amber 분산 권유 안내 박스("종목을 2개 이상 추가하면 자산 배분 그래프를 볼 수 있어요. 한 종목에 집중하면 그 종목 하락 시 손실이 커져요.")로 대체.
- **보유 종목 리스트 카드 (15차)**: 평단 옆에 현재가 표시 → `평단: ₩70,000 → 현재: ₩73,500` 형태. 초보자가 가장 궁금한 "지금 가격"을 즉시 확인 가능.
- 페이지 하단: "전체 종목 보기" 카드 → MajorStocksPage (모바일 접근성)
- API: `stockApi.getHoldingsHistory()` (KOSPI 데이터는 App.tsx의 `marketIndices` state에서 props로 전달, 60초 폴링)

### HoldingsAnalysisPage (`activeTab === 'analysis'`)
스토어: `useNavigationStore`, `usePortfolioStore`
- **에러 표시**: 페이지 상단에 `ErrorBanner` (portfolioStore.error + retry로 fetchHoldings)
- **추가 폼 레이블 (초보자 친화)**:
  - "내가 산 평균 가격 (원)" (placeholder "예: 70000") + 힌트 "여러 번 나눠 샀다면 평균을 입력해요. 예: 10만원에 5주, 11만원에 5주 → 105,000원"
  - "보유 주식 수 (주)" (placeholder "예: 10") + 힌트 "증권사 앱 → 보유 종목에서 확인할 수 있어요"
  - 인라인 편집 폼도 동일 레이블 사용
- 카드 표시는 "평균 매수가 (1주당)"
- "보유종목/관심종목" 상단 탭 전환
  - 보유종목 탭: 추가/수정/삭제, 요약 통계, 인라인 편집
  - 관심종목 탭: `WatchlistContent` 컴포넌트 마운트
- **sma_available + holding_opinion 조합 해석 (필수)**:
  - `sma_available === false` → 항상 "분석 중" 뱃지 (slate) + "이평선 데이터를 수집 중이에요." 표시. `holding_opinion` 값이 무엇이든(서버는 `'보유'`를 기본값으로 반환) 무시.
  - `sma_available === true` → `holding_opinion` 뱃지를 실제 신호로 표시 (FRONTEND_UX.md 참조).
  - **3rd party 클라이언트도 동일 규칙**: 두 필드를 함께 검사. `sma_available=false` 상태에서 `holding_opinion='보유'`를 "보유 신호"로 해석 금지.
- **수익률 [?] 도움말**: 종목 카드 수익률 헤더에 `HelpCircle` 아이콘 → 클릭 시 인라인 팝오버로 계산식과 예시 표시 (`수익률 = (현재가 - 평단가) ÷ 평단가 × 100`)
- 수익률 6구간 메시지: ≥20% 🎉 / ≥10% / ≥0% / ≥-3% / ≥-7% / <-7% 🔴 (극단 구간에 "종목 보기 →" 링크)
- **holding_opinion 뱃지·이유 분리 (17차 5-2)**: 이전에는 뱃지 안에 긴 이유 텍스트가 인라인으로 삽입되어 모바일에서 줄바꿈이 지저분했음. 뱃지는 `[주의 필요]`/`[관망]`/`[추가 검토]`/`[보유]` 대괄호 라벨로 축약하고, 이유 텍스트는 별도 `<p>` 줄로 분리. cautionLike 면책은 그 아래 italic 줄로 이동.
- **포트폴리오 집중도 경고**: 종목 비중(`stock.value`)이 **>50%**이면 카드 테두리를 yellow로 강조하고 상단에 "⚠️ [종목명] 비중이 N%예요. 한 종목에 집중되면 이 종목 하락 시 손실이 커져요. 분산 투자를 검토해보세요." 안내 표시
- **첫 종목 추가 인라인 가이드 카드** (`onboarding_first_stock_guided` 키): `holdings.length === 0`일 때 종목 추가 성공 시 토스트 대신 인라인 가이드 카드 1회 노출. 카드 본문: "🎉 첫 종목을 추가했어요!" + "지금 할 수 있는 것" 체크리스트 (분석 보기 / [?] 도움말 / 추천 탭 둘러보기). 닫으면 키 설정 후 일반 토스트로 전환
- Empty State (보유종목): 📊 + "종목 추가하기" / "추천 종목 보기"
- Empty State (관심종목): WatchlistContent 내 👀 처리
- 온보딩 진입: `consumePendingFocus() === 'add-holding-search'` → 자동으로 종목 추가 폼 노출
- 컴포넌트 의존: `StockSearchInput`, `WatchlistContent`

### RecommendationsPage (`activeTab === 'recommendations'`)
스토어: `useNavigationStore`
- 추천 종목 그리드, 카테고리 탭 필터링, 요약 통계, source 배지, 새로고침 버튼
- 면책 고지: 페이지 상단 안내형 문구
- 스크리너 결과 상단: "업종마다 기준이 달라 직접 확인이 필요해요" 안내
- 모바일 진입점: 페이지 하단 `md:hidden` "전체 종목 보기" → MajorStocksPage
- **빈 상태 (14차 + 16차 5-3 개선, 17차 버그-3 KST 수정)**: 서버 `syncAllStocks`가 완료되기 전에는 `market_opinion='긍정적'` 종목이 없어 리스트가 비어 있을 수 있다. KST hour 산출은 `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false })` — `getTimezoneOffset()` 기반 계산은 클라이언트 시간대에 따라 어긋났음. 현재 시간 기준 3분기:
  - 오전 8시 전: "오늘 분석은 오전 8시부터 시작해요. 약 N시간 후 결과가 나와요."
  - 오전 8~10시: "지금 데이터를 분석 중이에요. 97종목 분석이 끝날 때까지 10~15분 정도 걸려요."
  - 이후: "지금 매력적인 종목이 없어요. 오늘 시장 상황에서는 긍정적인 종목이 없어요. 내일 다시 확인해보세요."
- **요약 통계 — 평균 점수 (15차)**: algorithm 추천은 `score=50` placeholder이므로 mixed 평균이 왜곡됨. `recommendations.filter(r => r.source === 'manual')`만 평균 계산 + 카드 라벨을 "전문가 선정 평균 점수"로 변경. manual이 0개면 `—` 표시.
- API: `stockApi.getRecommendations()` / 컴포넌트: `RecommendedStockCard`

### WatchlistPage (`activeTab === 'watchlist'` — PC 사이드바 전용)
- 페이지 헤더 + `WatchlistContent` 마운트 (얇은 wrapper, ~20줄)
- 모바일에서는 HoldingsAnalysisPage 탭으로 접근

### ScreenerPage (`activeTab === 'screener'` — PC 사이드바 전용)
스토어: `useNavigationStore`
- 프리셋 4종 (각각 `caveat` 함정 안내 포함):
  - 💎 저평가 우량주 (`PER < 15 + ROE > 10%`) → "금융·통신·자동차 업종이 많이 포함될 수 있어요. 이 업종은 원래 PER이 낮아 단순 저평가로 보기 어려워요."
  - 🛡️ 안전한 자산주 (`PBR ≤ 1`) → "자산 대비 저평가지만 사업이 부진한 경우도 많아요. ROE를 함께 확인해보세요."
  - 🚀 고수익 성장주 (`ROE ≥ 20%`) → "일시적 호황으로 ROE가 높을 수 있어요. 최근 분기 실적도 함께 봐주세요."
  - 💰 소액 투자 (`주가 ≤ 10만원`) → "주가가 낮다고 좋은 종목은 아니에요. 시가총액과 사업 내용을 꼭 확인하세요."
- **결과 상단 안내** (yellow 카드): "📌 아래 종목들은 조건에 맞는 참고 목록이에요. 업종마다 정상 지표 범위가 달라 직접 확인이 필요해요. 투자 결정은 본인이 하세요." + 활성 프리셋의 `caveat` 함정 안내가 그 아래 표시됨
- **반응형 결과 레이아웃 (16차 5-4)**: `md:hidden` 카드 묶음(종목명 + 현재가 + PER/PBR/ROE 3열 그리드 + 의견 뱃지) / `hidden md:block` 5컬럼 테이블. 모바일에서 가로 스크롤 없이 한 화면에 표시.
- **모바일 카드 지표 힌트 (17차 5-5)**: PER/PBR/ROE 레이블 옆에 `(낮을수록↓)`/`(1이하↓)`/`(높을수록↑)` 힌트 추가 — PC 테이블에만 있던 해석 정보를 모바일에도 동일하게 노출. 모바일이 오히려 초보자 비중이 높음.
- PER 음수 종목: '적자' 뱃지 + "바이오·성장주의 경우 R&D 투자로 일시 적자가 많아요" 맥락 안내 (StockDetailView도 동일)
- API: `stockApi.screener(filters)`

### MajorStocksPage (`activeTab === 'major'`)
- 8개 섹터별 종목 그룹 표시
- **카드에 등락률 표시 (16차 5-5)**: 주가 아래에 `▲ +1.2%` 또는 `▼ -0.8%` 표시. placeholder 체크는 `['0', '0.00', '+0.00', '-0.00']` 집합으로 숨김 (17차 버그-5, 부동소수점 -0.00 방어). 서버 `stock/service.js`에서 최근 2거래일 종가로 실제 계산 + ON CONFLICT UPDATE에도 반영 (17차 버그-2).
- **기준 안내 (17차 5-3)**: 페이지 헤더 하단에 "※ ▲/▼ 등락률은 전일 종가 대비 변동분이에요." 노출 — 초보자는 기간 기준을 모름.
- **종목 삭제 확인 모달**: 삭제 버튼 클릭 시 즉시 삭제 대신 확인 모달 표시 — "{종목명}을(를) 삭제할까요? 이 종목에 연결된 보유 내역, 관심 종목, 알림이 모두 사라져요. 이 작업은 되돌릴 수 없어요." [취소] / [삭제할게요]. cascade 삭제 위험을 사용자에게 명시
- 페이지 상단 ErrorBanner (`error` + retry)
- API: `stockApi.getAllStocks()`, `deleteStock()`

### SettingsPage (`activeTab === 'settings'`)
- 종목 수동 추가, API 상태 정보, DB 상태, 버전 정보

---

## 컴포넌트 (9개)

### StockDetailView
Props: `stock: StockSummary`, `onBack`, `onAdd`, `onUpdate?`

**데이터 로딩 2단계**:
- Phase 1 (await): 가격, 변동성, 기술지표 — 실패 시 catch + 로딩 종료
- Phase 2 (fire-and-forget): 뉴스(null 초기값 → 스켈레톤), 재무, 섹터 비교 — 각 `.catch(() => {})`, 실패 시 빈 값 유지

**주요 기능**:
- 차트: 라인(기본) / 캔들 토글. SMA5/SMA20 오버레이. 일봉/주봉/월봉 전환. 라인 모드에서 "파란선 위에 있으면 좋은 신호예요"
- 거래량 바차트 (상승=초록, 하락=빨강)
- 투자자 매매동향: 레이블 "개인 투자자 (일반인)", "외국인 투자자 (해외)", "기관 투자자 (회사·펀드)". 차트 하단: "외국인·기관이 함께 매수하면 긍정적 신호로 보는 경우가 많아요. 단기 흐름만으로 판단하지 마세요"
- 기술지표 (RSI/MACD/볼린저밴드) + 도움말 텍스트 기본 노출
- **지표 가용성 폴백** (`*_available === false`): 종합 지표 패널 하단에 "⏳ 일부 지표는 데이터 수집 중이에요" 슬레이트 카드 표시. 각 미계산 지표(RSI 15일 / MACD 26일 / Bollinger 20일)별로 "최소 N일 데이터가 필요해요. 현재 {history_days}일치 수집됨, 약 {N - history_days}일 후 표시돼요." 안내. 에러가 아닌 정보성 톤(slate)
- PER/PBR/ROE/RSI/MACD/볼린저/투자자동향 각 영역에 `[?]` 버튼 → `HelpBottomSheet`
- PER/PBR/ROE 컨텍스트 설명 병기 (적자 표시, 업종 대비 저렴/고평가 해석). **업종별 PER 힌트**: PER 카드 하단에 카테고리별 보조 안내 — IT "PER 20~40배도 정상", 금융 "5~15배가 일반적", 바이오 "R&D로 일시 적자 많음", 에너지·소재 "원자재에 따라 출렁임"
- `ScoringBreakdownPanel`: 10점 스코어 4영역 게이지 바 + 만점대비 비율(80/60/25%)
- **섹터 비교 백분위**: 섹터 비교 테이블 위에 "📊 이 종목의 업종 내 위치" 박스 — PER/PBR/ROE 각각 백분위 계산해서 "업종 내 상위 25% (✓ 우수한 편)" / "하위 25% (주의 필요)" 4단계로 해석. 단순 평균 비교보다 직관적
- 재무제표: "(단위: 억 원)" + 1조 이상 "X조 Y,YYY억" 포맷팅
- 추천 적정가: "알고리즘 추정 적정가(N원) 대비 현재가 괴리 +N%" + "※ 이 수치는 실제 수익률이 아니에요"
- 보유: holding_opinion 기반 수정 폼 / 비보유: 추가 폼. 추가 완료 시 토스트 + "보러가기" 액션 (첫 종목은 인라인 가이드 카드)
- 갱신 시각: `getDataFreshnessLabel()` (장중/장외 자동 판단)
- API: `getCurrentPrice`, `getVolatility`, `getIndicators`, `getNews`, `getFinancials`, `getSectorComparison`, `getChartData`, `refreshStock`

### ScoringBreakdownPanel
Props: `breakdown: ScoringBreakdown`

종합점수 /10 → **즉시 그 아래** 면책 문구: "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요." (패널 상단 배치, 스코어 보기 전 맥락 이해).
**임계값 검증 전 amber 경고 배너 (17차 P4-보완)**: 면책 문구 바로 아래에 "⚠️ 이 점수 기준은 실증 검증 전이에요. 과거 데이터로 최적화하기 전 임시 기준이니 참고용으로만 봐주세요." 고정 노출 — 7/4점 임계값이 Phase 4 백테스팅 전 임시값이므로 앱스토어 심사/사용자 오해 방지.
4영역 게이지 바 + `value/max` 점수 텍스트 병기 (색각이상 대응) + 한국어 설명.
`per_negative` / `low_confidence` 경고 플래그.

### StockSearchInput
Props: `placeholder?`, `onSelect`, `resetKey?`, `className?`

디바운스 검색 (250ms), 드롭다운 결과에 `market_opinion` 뱃지 표시, 외부 클릭 닫기, resetKey로 초기화. API: `stockApi.searchStocks()`

### RecommendedStockCard
Props: `stock: Recommendation`, `onDetailClick`

종목명/코드, 현재가 → 적정가 카드.
**점수 뱃지**: `source === 'manual' && score > 0`인 경우에만 표시 (전문가 선정 점수). algorithm 추천은 score 필드가 placeholder(50)이라 의미 없으므로 숨김 — 대신 카드 하단 source 뱃지("알고리즘")로 종류만 구분. 뱃지에 `?` 기호 + `title` 툴팁 "편집팀이 매긴 종목 추천 점수예요. 100점 만점으로, 높을수록 매력적이라고 판단한 종목이에요." (17차 5-4).
**상승여력 표현**: 명령조 "상승여력 +N%" 대신 **"적정가 대비 현재가 괴리 +N%"** 로 표기 + "※ 이 수치는 실제 수익률이 아니에요" 면책 병기. 애널리스트 목표가 기준일 때는 "애널리스트 목표가는 통상 6~12개월 기준으로, 갱신 시점에 따라 현재 시세와 차이가 있을 수 있어요" 추가 안내.

`source` 뱃지 + 탭/클릭 시 accordion 펼침:
- manual: reason 텍스트 + "전문가가 직접 분석하여 선정한 종목이에요. 투자 결정은 본인이 하세요."
- algorithm: reason 텍스트 + "10가지 지표를 자동 분석한 결과예요. 과거 성과가 미래를 보장하지 않아요."

fairPrice 라벨: "적정가 (애널리스트)" vs "적정가 (추정)".

### HelpBottomSheet
Props: `termKey: HelpTermKey | null`, `onClose`

8개 용어(PER/PBR/ROE/RSI/MACD/Bollinger/SupplyDemand/SMA) 바텀시트. 모바일: 하단, PC: 중앙. 외부 클릭/X 버튼으로 닫기.

**콘텐츠 4단계 작성 기준**:
1. 정의: 한 문장 (초등학생 수준)
2. 높으면/낮으면: 의미
3. 이 앱에서는?: 블루 박스 강조 — 앱의 어느 화면과 연결되는지
4. 예시 숫자: italic 한 줄

### WatchlistContent
Props: `onDetailClick`

WatchlistPage + HoldingsAnalysisPage 관심종목 탭이 공유. `useWatchlistStore`로 상태 관리. 종목 검색/추가/삭제, `market_opinion` 뱃지, Empty State (👀).

### ErrorBanner
Props: `error: string | null`, `kind?: 'network' | 'server' | 'unknown'`, `onRetry?: () => void`, `autoRetryMs?: number`

페이지/위젯의 에러 상태를 통일 표시. `error`가 null이면 미렌더. `kind`별 헤드라인이 다르고, `onRetry`가 있으면 우측에 [다시 시도] 버튼 (44x44px). 사용처: DashboardPage(historyError), HoldingsAnalysisPage(portfolioStore.error), MajorStocksPage(error).

**`autoRetryMs` (14차)**: 지정 시 N ms 후 한 번만 `onRetry()`를 자동 호출하고 "잠시 후 자동으로 다시 시도해요..." 문구를 표시한다. 동일 error 메시지당 `useRef` 기반 1회 가드로 무한 루프를 방지한다. Neon 무료 플랜 sleep 해제(1~3초)/Render 콜드 스타트 구간에서 사용자 수동 클릭 없이 복구되도록 돕는 용도. DashboardPage는 `autoRetryMs={3000}` 기본 적용.

### NavButton
Props: `active`, `onClick`, `icon`, `label` — 활성 스타일링, 화살표 인디케이터

### StatCard
Props: `title`, `value`, `change?`, `positive?`, `icon`, `subtitle?`, `tooltip?: { label: string; text: string }`
- subtitle로 "투자금액 기준 가중 평균" 등 표시
- `tooltip` props가 있으면 카드 하단에 별도 라인으로 `label` + ℹ️ 아이콘 표시. 클릭 시 absolute 팝오버로 `text` 표시 + "알겠어요" 닫기 버튼. 사용자가 두 수치(예: 내 수익률 vs KOSPI)를 직접 비교하지 않도록 시각적으로 분리

---

## API 클라이언트 (stockApi.ts)

**Base URL**: `http://localhost:3001/api` → 프로덕션: 환경변수 `VITE_API_BASE_URL`

| 함수 | HTTP | 경로 |
|------|------|------|
| getCurrentPrice(code) | GET | /stock/{code} |
| getAllStocks() | GET | /stocks |
| addStock(code) | POST | /stocks |
| deleteStock(code) | DELETE | /stocks/{code} |
| searchStocks(query) | GET | /search?q= |
| getHoldings() | GET | /holdings (`holding_opinion`+`sma_available` 포함) |
| addHolding(stock) | POST | /holdings |
| updateHolding(stock) | PUT | /holdings/{code} |
| deleteHolding(code) | DELETE | /holdings/{code} |
| getHoldingsHistory() | GET | /holdings/history |
| getRecommendations() | GET | /recommendations (`source` 포함) |
| getVolatility(code) | GET | /stock/{code}/volatility |
| getIndicators(code) | GET | /stock/{code}/indicators |
| getChartData(code, tf) | GET | /stock/{code}/chart/{tf} |
| getFinancials(code) | GET | /stock/{code}/financials |
| getNews(code) | GET | /stock/{code}/news |
| getSectorComparison(cat) | GET | /sector/{cat}/compare |
| screener(filters) | GET | /screener |
| refreshStock(code) | POST | /stock/{code}/refresh |
| getAlerts() | GET | /alerts |
| getUnreadAlertCount() | GET | /alerts/unread-count |
| markAlertsRead() | POST | /alerts/read |
| deleteAlert(id) | DELETE | /alerts/{id} |
| getMarketIndices() | GET | /market/indices |
| getWatchlist() | GET | /watchlist |
| addToWatchlist(code) | POST | /watchlist |
| removeFromWatchlist(code) | DELETE | /watchlist/{code} |

---

## 타입 정의 (`src/types/stock.ts`)

```typescript
type MarketOpinion  = '긍정적' | '중립적' | '부정적';  // DB 저장, 공용
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';  // 런타임 계산, 개인화
// 혼용 금지: 타입 시스템으로 강제할 것
```

| 인터페이스 | 용도 | 주요 필드 |
|-----------|------|----------|
| Stock | 종목 기본 | code, name, category, price, change, per, pbr, roe, target_price, **market_opinion** |
| Holding | 보유종목 | code, name, value(비중), avgPrice, currentPrice, quantity, **holding_opinion**, **market_opinion**, **sma_available**, **last_updated?** (서버 ISO 8601) |
| UpdateHoldingPayload | 보유종목 수정 | code, avgPrice, quantity? — `PUT /api/holdings/:code` |
| AddHoldingPayload | 보유종목 추가 | code, avgPrice, quantity |
| Recommendation | 추천종목 | code, name, category, reason, score, fairPrice, currentPrice, analysis, advice, **market_opinion**, **source** |
| ScoringBreakdown | 스코어링 상세 | valuation, technical, supplyDemand, trend, total, detail, **per_negative?**, **low_confidence?** |
| StockDetail | 종목 상세 | Stock + history[], investorData[], analysis, tossUrl, scoringBreakdown? (14차에 `chartPath` 제거) |
| StockSummary | 종목 요약 | code, name, category, price, **market_opinion**, avgPrice? |
| HistoryEntry | 가격 히스토리 | date, price, open, high, low, volume |
| InvestorEntry | 투자자 동향 | date, institution, foreign, individual |
| ChartDataPoint | 차트 데이터 | price, OHLC, volume, sma5, sma20 |
| TechnicalIndicators | 기술지표 | rsi, macd, bollinger, summary, **rsi_available**?, **macd_available**?, **bollinger_available**?, **history_days**? |
| Alert | 알림 | id, code, name, type, **source?** ('holding'/'watchlist'), message, read, created_at |
| MarketIndex | 시장지수 | symbol, value, change, changeRate, positive |
| WatchlistItem | 관심종목 | code, name, category, price, **market_opinion**, added_at |
| NewsItem | 뉴스 | title, url, date, source |
| FinancialData | 재무제표 | periods[], financials[] |
| SectorComparison | 섹터비교 | category, averages, **medians**, stocks[] |

---

## App.tsx 진입 흐름

### 서버 연결 스플래시 (`/api/health` 게이트)
앱 진입 시 다른 UI를 차단하고 `/api/health`를 호출. 응답 상태(`healthState`):
- `'checking'`: "데이터를 불러오는 중이에요..." 스피너 (진입 직후)
- `'ok'`: 정상 본 UI 진입. holdings/marketIndices fetching 시작
- `'timeout'`: 10초 AbortController 만료. "서버가 깨어나는 중이에요. 약 30초 후 다시 시도를 눌러주세요. (무료 서버 특성상 첫 접속 시 시간이 걸릴 수 있어요.)" + [다시 시도] 버튼 (14차에 Render 콜드 스타트 대응으로 구체화)

`healthState !== 'ok'`인 동안 fetchHoldings/fetchUnreadCount/fetchIndices 모두 보류 — 빈 화면 노출 방지.

### 데이터 신선도 경고 배너 (`syncWarning`, 14차)
`/api/health` 응답의 `lastSync`를 검사해 본 UI 상단(메인 영역 바로 위)에 얇은 amber 경고 배너를 조건부로 표시:
- `lastSync == null` (첫 sync 전): "아직 데이터를 수집 중이에요. 잠시 기다려 주세요."
- `lastSync`가 24h 이상 경과: "데이터가 오늘 갱신되지 않았어요. 최신 시세가 아닐 수 있어요."
- 그 외: 배너 숨김

`VITE_API_BASE_URL` 환경변수로 base URL 변경 가능.

## 네비게이션 구조 (App.tsx)

> **15차**: PC 사이드바 하단의 "Premium Plan" + "구독 관리" 카드를 제거. 실제 구독 기능은 Phase 5에서 도입 예정이며, 그 전까지 비활성 버튼이 사용자 혼란을 유발하므로 카드 자체를 숨김.

```
PC/태블릿 (md: 이상):
  좌측 고정 사이드바(w-68) + 우측 메인 콘텐츠
  사이드바: 대시보드/포트폴리오/추천/관심종목/스크리너/주요종목/설정

모바일 (md: 미만):
  사이드바 숨김 + 하단 탭바 5개 (fixed bottom-0 md:hidden)
  탭: 대시보드 / 포트폴리오 / 추천 / 알림(미읽은 뱃지) / 설정
  관심종목·스크리너·주요종목은 각 페이지 내부 링크로 접근
```

**검색바 (App.tsx)**:
- 디바운스 300ms, 결과 드롭다운에 `market_opinion` 뱃지 표시
- **빈 검색 결과 안내 (14차 보강)**: `searchQuery.length >= 2 && results.length === 0 && !isSearching`이면 빈 드롭다운 대신 안내 카드 — "'{검색어}' 종목을 찾을 수 없어요. 현재 97개 주요 종목만 지원해요." + 2개 버튼: `[전체 종목 보기 →]` (MajorStocksPage) / `[종목코드로 추가 →]` (SettingsPage 수동 등록 경로)

**헤더 알림 패널 반응형**:
- PC: 헤더 우측 드롭다운 (`absolute top-full right-0`, max-h-96 스크롤)
- 모바일: 전체 화면 모달 (`fixed inset-0`, backdrop 포함) — 내부 스크롤 ↔ 페이지 스크롤 충돌 회피
- 모바일 탭바 "알림" 탭도 동일 상태 `showAlerts` 토글 (별도 페이지 아님)
- **첫 진입 1회 안내 카드** (`onboarding_alerts_explained`): 패널 상단에 "📬 알림은 어떻게 동작하나요?" 박스 — 보유·관심 종목 가격 변화, 하루 1회 갱신 (실시간 아님), 동일 종목당 일 2건 제한, **SMA 관련 알림은 보유 종목에만 발송** (14차 추가), 본인 판단 강조. [확인했어요] → 키 설정 후 카드 닫힘
- **알림 출처 뱃지 (14차 + 15차)**: `alert.source === 'holding'` → blue `[보유 중]`, `=== 'watchlist'` → purple `[관심 종목]`, **`undefined` (레거시 알림)** → slate `[알림]` 폴백 (15차 5-3). 과거 source 컬럼이 없던 시기의 알림이 뱃지 없이 표시되어 출처 혼란이 생기는 문제 해소.
- **알림 시각 포맷 (14차)**: `new Date(alert.created_at).toLocaleString('ko-KR')` (초까지 지저분하게 표시) → `getDataFreshnessShort(alert.created_at)` ("3분 전" / "2시간 전" / "어제" 형태)로 변경.
- 각 알림 항목: `[지금 확인하기]`(종목 상세 이동 + 패널 닫기) / `[나중에 볼게요]`(패널만 닫기). 우측 휴지통은 stopPropagation으로 단건 삭제 전용.

**상세뷰 네비게이션**: `goBack()` → `previousTab`으로 복귀. 보유종목 진입 → analysis 탭.

---

## 업종 카테고리 (8개)
기술/IT, 바이오/헬스케어, 자동차/모빌리티, 에너지/소재, 금융/지주, 소비재/서비스, 엔터테인먼트/미디어, 조선/기계/방산
