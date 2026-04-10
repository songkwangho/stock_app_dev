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
- 수익률 카드 subtitle: `₩원금 → ₩평가액 (가중 평균) · 오늘 KOSPI ±N%` — App.tsx에서 `marketIndices` props로 KOSPI 변동률을 받아 시장 대비 맥락을 함께 표시 (당일 변동률 비교, 정밀 백테스팅은 Phase 4)
- 페이지 하단: "전체 종목 보기" 카드 → MajorStocksPage (모바일 접근성)
- API: `stockApi.getHoldingsHistory()` (KOSPI 데이터는 App.tsx의 `marketIndices` state에서 props로 전달)

### HoldingsAnalysisPage (`activeTab === 'analysis'`)
스토어: `useNavigationStore`, `usePortfolioStore`
- "보유종목/관심종목" 상단 탭 전환
  - 보유종목 탭: 추가/수정/삭제, 요약 통계, 인라인 편집
  - 관심종목 탭: `WatchlistContent` 컴포넌트 마운트
- `sma_available === false` → "분석 중" 뱃지 (slate) + "이평선 데이터를 수집 중이에요."
- `sma_available === true` → `holding_opinion` 뱃지 (표시 라벨은 FRONTEND_UX.md 참조) + 이유 텍스트 + "상세 보기 →"
- 수익률 6구간 메시지: ≥20% 🎉 / ≥10% / ≥0% / ≥-3% / ≥-7% / <-7% 🔴 (극단 구간에 "종목 보기 →" 링크)
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
- PER 음수 종목: '적자' 뱃지 + "바이오·성장주의 경우 R&D 투자로 일시 적자가 많아요" 맥락 안내 (StockDetailView도 동일)
- API: `stockApi.screener(filters)`

### MajorStocksPage (`activeTab === 'major'`)
- 8개 섹터별 종목 그룹 표시, 종목 삭제
- API: `stockApi.getAllStocks()`, `deleteStock()`

### SettingsPage (`activeTab === 'settings'`)
- 종목 수동 추가, API 상태 정보, DB 상태, 버전 정보

---

## 컴포넌트 (8개)

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
- PER/PBR/ROE/RSI/MACD/볼린저/투자자동향 각 영역에 `[?]` 버튼 → `HelpBottomSheet`
- PER/PBR/ROE 컨텍스트 설명 병기 (적자 표시, 업종 대비 저렴/고평가 해석). **업종별 PER 힌트**: PER 카드 하단에 카테고리별 보조 안내 — IT "PER 20~40배도 정상", 금융 "5~15배가 일반적", 바이오 "R&D로 일시 적자 많음", 에너지·소재 "원자재에 따라 출렁임"
- `ScoringBreakdownPanel`: 10점 스코어 4영역 게이지 바 + 만점대비 비율(80/60/25%)
- 재무제표: "(단위: 억 원)" + 1조 이상 "X조 Y,YYY억" 포맷팅
- 추천 적정가: "알고리즘 추정 적정가(N원) 대비 현재가 괴리 +N%" + "※ 이 수치는 실제 수익률이 아니에요"
- 보유: holding_opinion 기반 수정 폼 / 비보유: 추가 폼. 추가 완료 시 토스트 + "보러가기" 액션 (첫 종목은 인라인 가이드 카드)
- 갱신 시각: `getDataFreshnessLabel()` (장중/장외 자동 판단)
- API: `getCurrentPrice`, `getVolatility`, `getIndicators`, `getNews`, `getFinancials`, `getSectorComparison`, `getChartData`, `refreshStock`

### ScoringBreakdownPanel
Props: `breakdown: ScoringBreakdown`

종합점수 /10 → **즉시 그 아래** 면책 문구: "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요." (패널 상단 배치, 스코어 보기 전 맥락 이해).
4영역 게이지 바 + `value/max` 점수 텍스트 병기 (색각이상 대응) + 한국어 설명.
`per_negative` / `low_confidence` 경고 플래그.

### StockSearchInput
Props: `placeholder?`, `onSelect`, `resetKey?`, `className?`

디바운스 검색 (250ms), 드롭다운 결과에 `market_opinion` 뱃지 표시, 외부 클릭 닫기, resetKey로 초기화. API: `stockApi.searchStocks()`

### RecommendedStockCard
Props: `stock: Recommendation`, `onDetailClick`

종목명/코드, 점수 뱃지, 현재가 → 적정가 카드.
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

### NavButton
Props: `active`, `onClick`, `icon`, `label` — 활성 스타일링, 화살표 인디케이터

### StatCard
Props: `title`, `value`, `change?`, `positive?`, `icon`, `subtitle?` — subtitle로 "투자금액 기준 가중 평균" 등 표시

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
| Holding | 보유종목 | code, name, value(비중), avgPrice, currentPrice, quantity, **holding_opinion**, **market_opinion**, **sma_available** |
| UpdateHoldingPayload | 보유종목 수정 | code, avgPrice, quantity? — `PUT /api/holdings/:code` |
| AddHoldingPayload | 보유종목 추가 | code, avgPrice, quantity |
| Recommendation | 추천종목 | code, name, category, reason, score, fairPrice, currentPrice, analysis, advice, **market_opinion**, **source** |
| ScoringBreakdown | 스코어링 상세 | valuation, technical, supplyDemand, trend, total, detail, **per_negative?**, **low_confidence?** |
| StockDetail | 종목 상세 | Stock + history[], investorData[], analysis, tossUrl, chartPath, scoringBreakdown? |
| StockSummary | 종목 요약 | code, name, category, price, **market_opinion**, avgPrice? |
| HistoryEntry | 가격 히스토리 | date, price, open, high, low, volume |
| InvestorEntry | 투자자 동향 | date, institution, foreign, individual |
| ChartDataPoint | 차트 데이터 | price, OHLC, volume, sma5, sma20 |
| TechnicalIndicators | 기술지표 | rsi, macd, bollinger, summary, **rsi_available**?, **macd_available**?, **bollinger_available**?, **history_days**? |
| Alert | 알림 | id, code, name, type, message, read, created_at |
| MarketIndex | 시장지수 | symbol, value, change, changeRate, positive |
| WatchlistItem | 관심종목 | code, name, category, price, **market_opinion**, added_at |
| NewsItem | 뉴스 | title, url, date, source |
| FinancialData | 재무제표 | periods[], financials[] |
| SectorComparison | 섹터비교 | category, averages, **medians**, stocks[] |

---

## 네비게이션 구조 (App.tsx)

```
PC/태블릿 (md: 이상):
  좌측 고정 사이드바(w-68) + 우측 메인 콘텐츠
  사이드바: 대시보드/포트폴리오/추천/관심종목/스크리너/주요종목/설정

모바일 (md: 미만):
  사이드바 숨김 + 하단 탭바 5개 (fixed bottom-0 md:hidden)
  탭: 대시보드 / 포트폴리오 / 추천 / 알림(미읽은 뱃지) / 설정
  관심종목·스크리너·주요종목은 각 페이지 내부 링크로 접근
```

**헤더 알림 패널 반응형**:
- PC: 헤더 우측 드롭다운 (`absolute top-full right-0`, max-h-96 스크롤)
- 모바일: 전체 화면 모달 (`fixed inset-0`, backdrop 포함) — 내부 스크롤 ↔ 페이지 스크롤 충돌 회피
- 모바일 탭바 "알림" 탭도 동일 상태 `showAlerts` 토글 (별도 페이지 아님)
- 각 알림 항목: `[지금 확인하기]`(종목 상세 이동 + 패널 닫기) / `[나중에 볼게요]`(패널만 닫기). 우측 휴지통은 stopPropagation으로 단건 삭제 전용.

**상세뷰 네비게이션**: `goBack()` → `previousTab`으로 복귀. 보유종목 진입 → analysis 탭.

---

## 업종 카테고리 (8개)
기술/IT, 바이오/헬스케어, 자동차/모빌리티, 에너지/소재, 금융/지주, 소비재/서비스, 엔터테인먼트/미디어, 조선/기계/방산
