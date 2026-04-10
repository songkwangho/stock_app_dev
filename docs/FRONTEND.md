# Frontend Documentation

## 개요
- **프레임워크**: React 19 + TypeScript
- **번들러**: Vite 7
- **스타일**: Tailwind CSS v4 (다크 테마)
- **차트**: Recharts v3.7
- **상태관리**: Zustand v5 (도메인별 스토어 분리)
- **아이콘**: Lucide React
- **HTTP**: Axios (X-Device-Id 헤더 자동 첨부)
- **모바일 배포**: Capacitor (iOS/Android 앱 래핑 예정)

---

## 사용자 식별 (device_id)

### 개요
로그인 없이 기기별 UUID로 개인 데이터를 서버에서 분리한다.
환경별 저장소가 달라지므로 `DeviceIdStorage` 인터페이스로 추상화한다.

### DeviceIdStorage 인터페이스 (`src/storage/deviceId.ts`)
```typescript
interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}

// Web 환경 (현재)
class WebDeviceIdStorage implements DeviceIdStorage {
  get() { return localStorage.getItem('device_id'); }
  set(id: string) { localStorage.setItem('device_id', id); }
}

// Capacitor 환경 (앱 배포 시 교체)
// import { Preferences } from '@capacitor/preferences';
// class CapacitorDeviceIdStorage implements DeviceIdStorage { ... }

function getDeviceId(storage: DeviceIdStorage = new WebDeviceIdStorage()): string {
  let id = storage.get();
  if (!id) {
    id = crypto.randomUUID();
    storage.set(id);
  }
  return id;
}
```

### Axios 인터셉터 (`src/api/stockApi.ts`)
```typescript
axios.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});
```

> **Capacitor 전환 시**: `WebDeviceIdStorage` → `CapacitorDeviceIdStorage`로 구현체만 교체하면 되며, `getDeviceId()` 호출부는 변경 없음.

---

## 상태관리 (Zustand — 5개 스토어)
도메인별 4개 + Toast 1개. 컴포넌트는 필요한 스토어만 import (관심사 분리). `navigateTo`는 `useNavigationStore`에서만 호출 (App.tsx에서 props로 내려주지 않음).

### useNavigationStore (`src/stores/useNavigationStore.ts`)
**관심사**: UI 탐색 상태 (도메인 데이터 없음)

```typescript
interface NavigationState {
  activeTab: string;
  selectedStock: StockSummary | null;
  previousTab: string;        // 상세뷰 뒤로가기 시 복귀 탭
  pendingFocus: string | null; // 페이지 진입 시 자동 트리거할 포커스 식별자
}

interface NavigationActions {
  navigateTo(tab: string, options?: { focus?: string }): void; // 탭 이동 + selectedStock 초기화 + pendingFocus 설정
  handleDetailClick(stock: StockSummary): void;                // 종목 선택 + detail 탭 이동
  goBack(): void;                                              // previousTab으로 복귀
  consumePendingFocus(): string | null;                        // pendingFocus 읽고 즉시 비움
}
```
> **pendingFocus 패턴**: 현재는 온보딩 "직접 추가할게요" → HoldingsAnalysisPage 검색 폼 자동 노출 케이스 한 곳에서만 사용한다(`'add-holding-search'`). 일반화 여지는 있으나(예: 알림 → 종목 상세 진입 시 특정 섹션 스크롤), 사용처가 늘어나기 전까지는 이 단순 형태를 유지한다.

### usePortfolioStore (`src/stores/usePortfolioStore.ts`)
**관심사**: 보유종목 도메인 상태

```typescript
interface PortfolioState {
  holdings: Holding[];
  isLoading: boolean;
  error: string | null;
}

interface PortfolioActions {
  fetchHoldings(): Promise<void>;
  addHolding(stock: AddHoldingPayload): Promise<void>;
  updateHolding(stock: UpdateHoldingPayload): Promise<void>;
  deleteHolding(code: string): Promise<void>;
}
```

### useAlertStore (`src/stores/useAlertStore.ts`)
**관심사**: 알림 상태

```typescript
interface AlertState {
  alerts: Alert[];
  unreadCount: number;
}

interface AlertActions {
  fetchAlerts(): Promise<void>;
  fetchUnreadCount(): Promise<void>;
  markAllRead(): Promise<void>;
  deleteAlert(id: number): Promise<void>;
}
```

### useWatchlistStore (`src/stores/useWatchlistStore.ts`)
**관심사**: 관심종목 상태 (WatchlistPage + HoldingsAnalysisPage 탭이 공유)

```typescript
interface WatchlistState {
  items: WatchlistItem[];
  isLoading: boolean;
  lastFetched: number;  // TTL 캐시 타임스탬프
}

interface WatchlistActions {
  fetchWatchlist(force?: boolean): Promise<void>;  // TTL 30초 이내 재호출 스킵
  addToWatchlist(code: string): Promise<void>;     // 내부적으로 force 호출
  removeFromWatchlist(code: string): Promise<void>; // optimistic + 실패 시 즉시 롤백 + 토스트
}
```
> **중복 호출 방지**: WatchlistPage와 HoldingsAnalysisPage 탭이 동시에 마운트될 때
> 30초 TTL로 두 번째 호출을 스킵 (불필요한 API 호출 방지). add/remove 시에만 강제 갱신.
> **삭제 실패 처리**: optimistic update로 즉시 항목을 제거한 뒤, API 실패 시 이전 배열로 되돌리고
> `useToastStore.addToast('관심종목 삭제에 실패했어요. 다시 시도해 주세요.', 'error')`로 사용자에게 알린다.
> 단순 재출현은 사용자에게 혼란을 주므로, 반드시 토스트와 함께 롤백한다.

### 스토어 사용 원칙
- 컴포넌트는 필요한 스토어만 import (관심사 분리)
- Props drilling 대신 컴포넌트에서 직접 스토어 구독
- `navigateTo`는 `useNavigationStore`에서만 호출 (App.tsx에서 props로 내려주지 않음)

---

## 페이지 구조 (7개, 전부 lazy loading)

### DashboardPage
- **경로**: `activeTab === 'dashboard'`
- **스토어**: `useNavigationStore`, `usePortfolioStore`
- **기능**: 포트폴리오 요약 (총자산, 수익률, 종목수), 수익률 추이 AreaChart (20일), 자산배분 PieChart, 보유종목 리스트 (읽기전용)
- **빈 포트폴리오 CTA**: 온보딩 완료 후 재방문 시에만 "종목 추가하기/추천 종목 둘러보기" 카드 표시
- **데이터 갱신 시각**: 상단에 `getDataFreshnessShort()` 기반 "마지막 업데이트: N분 전"
- **수익률 카드**: "투자금액 기준 가중 평균" subtitle 표시
- **전체 종목 보기 카드**: 페이지 하단에 MajorStocksPage 진입 카드 (모바일 사용자 접근성 보완)
- **API 호출**: `stockApi.getHoldingsHistory()`

### HoldingsAnalysisPage (내 종목 관리)
- **경로**: `activeTab === 'analysis'`
- **스토어**: `useNavigationStore`, `usePortfolioStore`
- **기능**: "보유종목/관심종목" 상단 탭 전환 (모바일 관심종목 접근 경로)
  - 보유종목 탭: 추가/수정/삭제, 요약 통계, 인라인 편집
  - 관심종목 탭: `WatchlistContent` 컴포넌트 마운트
- **표시**:
  - **sma_available === false** → "분석 중" 뱃지 (slate, 중립) + "이평선 데이터를 수집 중이에요. 잠시 후 다시 확인해보세요."
  - **sma_available === true** → `holding_opinion` 뱃지 + 구체적 이유 + "상세 보기 →":
    - 매도(손절): "평단가 대비 -8.2% 손실. 손절 기준(-7%) 초과"
    - 매도(이탈): "5일선·20일선 모두 이탈. 하락세가 강해요"
    - 관망: "5일선 아래지만 20일선이 지지 중. 조금 기다려봐요"
    - 추가매수: "5일선 근처에서 지지받고 있어요"
    - 보유: "5일선 위, 이평선 정배열. 상승 흐름 유지 중"
  - `market_opinion` 뱃지 (시장: 긍정적/중립적/부정적)
  - 수익률 6구간 메시지 (색상별 구분, 안내형):
    ≥20% "목표 수익 달성! 🎉" + "일부 팔아볼까요? [종목 보기 →]"
    ≥10% "잘 하고 계세요! 추세를 유지해 보세요"
    ≥0% "소폭 수익 중이에요. 지켜보세요"
    ≥-3% "소폭 손실이에요. 주식은 단기 등락이 있어요. 조금 더 지켜볼까요?"
    ≥-7% "손실이 커지고 있어요. 손절 기준(-7%)에 근접했어요"
    <-7% "손실이 커지고 있어요 🔴" + "지금 확인해보세요 [종목 보기 →]"
- **Empty State (보유종목 탭)**: 📊 + "종목 추가하기" / "추천 종목 보기" 보조 버튼
- **Empty State (관심종목 탭)**: WatchlistContent 내 👀 + 안내 (별도 디자인)
- **온보딩 진입**: `consumePendingFocus() === 'add-holding-search'`이면 자동으로 종목 추가 폼 노출
- **컴포넌트 의존**: `StockSearchInput`, `WatchlistContent`

### RecommendationsPage (유망 종목 추천)
- **경로**: `activeTab === 'recommendations'`
- **스토어**: `useNavigationStore`
- **기능**: 추천 종목 그리드, 카테고리 탭 필터링, 요약 통계 (추천수, 섹터수, 평균점수), `source` 배지 ('전문가 선정' / '알고리즘'), 새로고침 버튼
- **면책 고지**: 페이지 상단 안내형 문구 ("알고리즘이 분석한 참고 정보예요...")
- **모바일 진입점**: 페이지 하단 `md:hidden` "전체 종목 보기" 버튼 → MajorStocksPage 이동
- **API 호출**: `stockApi.getRecommendations()`
- **컴포넌트 의존**: `RecommendedStockCard`

### WatchlistPage (관심종목 — PC 사이드바 전용)
- **경로**: `activeTab === 'watchlist'` (PC 사이드바에서만 접근, 모바일은 HoldingsAnalysisPage 탭으로 접근)
- **기능**: 페이지 헤더 + `WatchlistContent` 컴포넌트 마운트 (얇은 wrapper, ~20줄)
- **컴포넌트 의존**: `WatchlistContent`

### ScreenerPage (종목 스크리너 — PC 사이드바 전용)
- **경로**: `activeTab === 'screener'`
- **스토어**: `useNavigationStore`
- **기능**: 프리셋 필터 4종 (조건 요약 + 설명):
  - 💎 저평가 우량주 (`PER < 15 + ROE > 10%`) → 싸면서 잘 버는 기업
  - 🛡️ 안전한 자산주 (`PBR ≤ 1`) → 자산 대비 저평가
  - 🚀 고수익 성장주 (`ROE ≥ 20%`) → 돈을 아주 잘 버는 기업
  - 💰 소액 투자 (`주가 ≤ 10만원`) → 적은 금액으로 시작
- 고급 필터 (PER/PBR/ROE/가격/업종), 결과 테이블 (PER/PBR/ROE 색상 강조)
- PER 음수 종목에 '적자' 뱃지 표시
- **API 호출**: `stockApi.screener(filters)`

### MajorStocksPage (주요 종목 현황)
- **경로**: `activeTab === 'major'`
- **스토어**: `useNavigationStore`
- **기능**: 8개 섹터별 종목 그룹 표시, 종목 삭제 기능
- **API 호출**: `stockApi.getAllStocks()`, `deleteStock()`

### SettingsPage (설정)
- **경로**: `activeTab === 'settings'`
- **기능**: 종목 수동 추가, API 상태 정보, DB 상태, 버전 정보

---

## 컴포넌트 (8개)

### StockDetailView (종목 상세 분석)
- **Props**: `stock: StockSummary`, `onBack`, `onAdd`, `onUpdate?`
- **데이터 로딩**: 2단계 우선순위 분리
  - Phase 1 (await): 가격, 변동성, 기술지표 — 실패 시 catch에서 콘솔 로그 + 로딩 종료
  - Phase 2 (fire-and-forget): 뉴스(스켈레톤), 재무, 섹터 비교
  - **Phase 2 에러 처리**: 각 호출에 `.catch(() => {})` 적용. 실패 시 조용히 빈 값 유지 (에러 UI 표시 안 함, 재시도 없음)
  - 뉴스는 `null` 초기값으로 로딩/없음 구분 → 로딩 중 스켈레톤, 빈 배열이면 미표시
- **기능**:
  - 차트 타입 토글: 라인 차트(기본, 초보자 친화) / 캔들 차트 전환 버튼
  - SMA5/SMA20 이평선 오버레이, 일봉/주봉/월봉 전환
  - 라인 차트 모드에서 초보자용 설명: "파란선 위에 있으면 좋은 신호예요"
  - 거래량 바차트 (상승=초록, 하락=빨강)
  - 투자자 매매동향 (기관/외국인/개인)
  - 기술지표 (RSI, MACD, 볼린저밴드) + 도움말 텍스트 기본 노출
  - PER/PBR/ROE 카드 + 기술지표 (RSI/MACD/볼린저밴드) + 투자자 매매동향: 각 영역에 [?] 버튼 → `HelpBottomSheet`로 8개 용어 설명 (PER/PBR/ROE/RSI/MACD/Bollinger/SupplyDemand/SMA)
  - PER/PBR/ROE/목표가 컨텍스트 설명 병기 (적자/저렴/적정/고평가, 우량 기업 판단 등)
  - `ScoringBreakdownPanel`: 10점 스코어 4개 영역 게이지 바 + 만점대비 비율(80/60/25%) 해석
  - 섹터 비교: 업종 **중앙값** 기준 (스코어링과 동일 기준)
  - 분기 재무제표 테이블 (단위: 억 원, 1조 이상은 "X조 Y,YYY억" 자동 포맷팅), 최근 뉴스 10건
  - 투자자 매매동향 차트 레이블: "개인 투자자 (일반인)", "외국인 투자자 (해외)", "기관 투자자 (회사·펀드)" — 초보자 친화 부연 설명 + 차트 하단 "외국인·기관이 함께 매수하면 긍정적 신호로 보는 경우가 많아요. 단기 흐름만으로 판단하지 마세요" 안내
  - 보유종목: `holding_opinion` 기반 수정 폼 / 비보유: 추가 폼
  - 의견 요약 섹션 하단: 면책 문구 ("이 분석은 참고용이며...")
  - 종목 코드 옆 데이터 갱신 시각: `getDataFreshnessLabel()` (장중/장외 자동 판단)
  - 데이터 새로고침 버튼
- **API 호출**: `getCurrentPrice`, `getVolatility`, `getIndicators`, `getNews`, `getFinancials`, `getSectorComparison`, `getChartData`, `refreshStock`

### ScoringBreakdownPanel (스코어 시각화)
- **Props**: `breakdown: ScoringBreakdown`
- **기능**: 종합점수 /10 표시 + **즉시 그 아래에** "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요." 면책 문구 (스코어를 보기 전 맥락 이해를 위해 패널 상단 배치). 밸류에이션/기술지표/수급/추세 각각 게이지 바 + `value/max` 점수 텍스트 병기 (색각이상 사용자 대응) + 한국어 설명. `per_negative`/`low_confidence` 경고 플래그.

### StockSearchInput (종목 검색)
- **Props**: `placeholder?`, `onSelect`, `resetKey?`, `className?`
- **기능**: 디바운스 검색 (250ms), 드롭다운 결과, 외부 클릭 닫기, resetKey로 초기화
- **API 호출**: `stockApi.searchStocks()`

### RecommendedStockCard (추천 종목 카드)
- **Props**: `stock: Recommendation`, `onDetailClick`
- **기능**: 종목명/코드, 점수 뱃지, 현재가→적정가 (상승여력%), 추천 사유
  - `source` 뱃지: '전문가 선정'(manual) / '알고리즘' + 탭/클릭 시 accordion 펼침
  - **accordion 콘텐츠**: `reason` 텍스트(추천 사유) + source별 신뢰도 설명 (정보 활용도 향상)
  - `market_opinion` 뱃지
  - fairPrice 라벨에 출처 표기: "적정가 (애널리스트)" vs "적정가 (추정)"

### HelpBottomSheet (용어 설명 바텀시트)
- **Props**: `termKey: HelpTermKey | null`, `onClose`
- **기능**: 8개 용어(PER/PBR/ROE/RSI/MACD/Bollinger/SupplyDemand/SMA) 설명을 바텀시트로 표시. 모바일은 하단, PC는 중앙. 외부 클릭/X 버튼으로 닫기
- **콘텐츠 작성 기준 (4단계)**:
  1. **정의**: 한 문장으로 (초등학생도 이해 가능한 수준)
  2. **높으면/낮으면**: 이 지표가 크거나 작을 때 의미
  3. **이 앱에서는?**: 이 앱의 어느 부분에서 이 개념이 쓰이는지 (블루 박스 강조)
  4. **예시 숫자**: italic 텍스트로 한 줄 (예: "PER 10배 = 지금 주가로 10년치 이익을 산 셈")
  > 교과서적 정의에 그치지 않고 "이 앱에서 어떻게 쓰이는지"를 명시해 초보자가 자신이 보고 있는 화면과 즉시 연결할 수 있도록 한다.

### WatchlistContent (관심종목 공유 컴포넌트)
- **Props**: `onDetailClick`
- **기능**: WatchlistPage와 HoldingsAnalysisPage 관심종목 탭이 공유. `useWatchlistStore`로 상태 관리. 종목 검색/추가/삭제, market_opinion 뱃지, Empty State

### NavButton (사이드바 네비게이션)
- **Props**: `active`, `onClick`, `icon`, `label`
- **기능**: 활성 상태 스타일링, 화살표 인디케이터

### StatCard (통계 카드)
- **Props**: `title`, `value`, `change?`, `positive?`, `icon`, `subtitle?`
- **기능**: 제목/값/변동률 표시, 아이콘 배경, 선택적 subtitle (예: "투자금액 기준 가중 평균")

---

## API 클라이언트 (stockApi.ts)

**Base URL**: `http://localhost:3001/api`
> 프로덕션 배포 시 환경변수(`VITE_API_BASE_URL`)로 교체 필요

### 함수 목록
| 함수 | HTTP | 경로 |
|------|------|------|
| getCurrentPrice(code) | GET | /stock/{code} |
| getAllStocks() | GET | /stocks |
| addStock(code) | POST | /stocks |
| deleteStock(code) | DELETE | /stocks/{code} |
| searchStocks(query) | GET | /search?q= |
| getHoldings() | GET | /holdings (`holding_opinion` 포함) |
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

### Opinion 타입 분리 (필수)
```typescript
// 비보유 기준 10점 스코어링 결과 (공용, DB 저장)
type MarketOpinion = '긍정적' | '중립적' | '부정적';

// 평단가 기반 5단계 판단 (개인화, 런타임 계산)
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';
```

> **혼용 금지**: `HoldingOpinion` 값('보유'/'관망' 등)을 `MarketOpinion` 필드에 넣거나 반대로 사용하면 안 됨. 타입 시스템으로 강제할 것.

### 핵심 인터페이스
| 인터페이스 | 용도 | 주요 필드 |
|-----------|------|----------|
| Stock | 종목 기본 | code, name, category, price, change, per, pbr, roe, target_price, **market_opinion** |
| Holding | 보유종목 | code, name, value(비중), avgPrice, currentPrice, quantity, **holding_opinion**, **market_opinion**, **sma_available** |
| UpdateHoldingPayload | 보유종목 부분 수정 | code, avgPrice, quantity? — `PUT /api/holdings/:code` 호출 시 사용 |
| Recommendation | 추천종목 | code, name, category, reason, score, fairPrice, currentPrice, 재무지표, analysis, advice, **market_opinion**, **source** |
| ScoringBreakdown | 스코어링 상세 | valuation, technical, supplyDemand, trend, total, detail, **per_negative?**, **low_confidence?** |
| StockDetail | 종목 상세 | Stock + history[], investorData[], analysis, tossUrl, chartPath, scoringBreakdown? |
| StockSummary | 종목 요약 | code, name, category, price, **market_opinion**, avgPrice? |
| HistoryEntry | 가격 히스토리 | date, price, open, high, low, volume |
| InvestorEntry | 투자자 동향 | date, institution, foreign, individual |
| ChartDataPoint | 차트 데이터 | price, OHLC, volume, sma5, sma20 |
| TechnicalIndicators | 기술지표 | rsi, macd, bollinger, summary |
| Alert | 알림 | id, code, name, type, message, read, created_at |
| MarketIndex | 시장지수 | symbol, value, change, changeRate, positive |
| WatchlistItem | 관심종목 | code, name, category, price, **market_opinion**, added_at |
| NewsItem | 뉴스 | title, url, date, source |
| FinancialData | 재무제표 | periods[], financials[] |
| SectorComparison | 섹터비교 | category, averages, **medians**, stocks[] (perVsAvg, pbrVsAvg, roeVsAvg) |

---

## 네비게이션 구조 (App.tsx)

### 반응형 레이아웃 (구현 완료)
```
PC/태블릿 (md: 이상):
  좌측 고정 사이드바(w-68) + 우측 메인 콘텐츠
  aside className="hidden md:flex ..."

모바일 (md: 미만):
  사이드바 숨김 + 하단 탭바 5개
  nav className="fixed bottom-0 md:hidden ..."
  탭: 대시보드 / 포트폴리오 / 추천 / 알림(미읽은 뱃지) / 설정
```

### 사이드바 메뉴 순서 (PC)
1. 대시보드 (`dashboard`) - LayoutDashboard
2. 내 포트폴리오 (`analysis`) - TrendingUp
3. 유망 종목 추천 (`recommendations`) - Star
4. 관심종목 (`watchlist`) - Eye
5. 종목 스크리너 (`screener`) - Filter
6. 주요 종목 현황 (`major`) - Layers
7. 설정 (`settings`) - Settings

### 모바일 하단 탭바 (5개)
대시보드 / 포트폴리오 / 추천 / 알림(미읽은 수 뱃지) / 설정
> 관심종목·스크리너·주요종목은 PC 사이드바에만 노출
> 스크리너, 주요 종목은 모바일에서 하단 탭에 미포함 (각 페이지 내부 링크로 접근)

### 헤더 구성
- 시장지수 (KOSPI/KOSDAQ)
- 글로벌 검색바 (디바운스 300ms, 모바일에서 full-width)
- 알림 벨 (미읽은 수 뱃지) — `useAlertStore.unreadCount`
  - **반응형 패널**: PC(`md:` 이상)은 헤더 우측 드롭다운(`md:absolute md:right-0`, max-h-96 스크롤). 모바일은 전체 화면 모달(`fixed inset-0`, backdrop 포함). 모바일 헤더 드롭다운의 내부 스크롤 ↔ 페이지 스크롤 충돌을 회피하기 위함. 모바일 하단 탭바의 "알림" 탭도 동일 상태 `showAlerts`를 토글한다 (별도 페이지 아님).
  - 알림 아이콘 + 우선순위별 좌측 강조 border, 아이콘 + 한국어 라벨 (중립적 표현 — `ALERT_TYPE_LABELS` 참조)
  - **각 알림 항목**: 메시지 본문 + 두 개의 액션 버튼 — `[지금 확인하기]`(파란 버튼, 클릭 시 종목 상세 이동 + 패널 닫기) / `[나중에 볼게요]`(텍스트 버튼, 클릭 시 패널만 닫기). 우측 상단 휴지통 버튼은 `stopPropagation`로 알림 단건 삭제 전용.
- 유저 프로필 → 클릭 시 analysis 페이지 이동

### 상세뷰 네비게이션
- `useNavigationStore.goBack()` 호출 → `previousTab`으로 복귀
- 보유종목에서 진입 → 뒤로가기 시 analysis 탭
- 그 외 → 이전 탭으로 복귀

---

## 온보딩 플로우 (첫 실행 시)

**플로우**:
1. **면책 모달** (`disclaimer_accepted`): 원금 손실 위험 + "이 앱은 정보 제공 도구로, 실제 주식 거래는 지원하지 않아요" 강조 → [확인했습니다]
2. **온보딩 스텝** (`onboarding_done`): "내 주식을 추가해볼게요" → [건너뛰기] / [직접 추가할게요]
   - [직접 추가할게요] 클릭 시: `navigateTo('analysis', { focus: 'add-holding-search' })` 호출
   - HoldingsAnalysisPage가 마운트 시 `useNavigationStore.consumePendingFocus()` 검사 → 자동으로 종목 추가 폼 노출
3. **첫 종목 추가 직후 인라인 가이드** (`onboarding_first_stock_guided`): 종목 추가 성공 시 `holdings.length === 0`이고 키가 없으면 토스트 대신 인라인 가이드 카드 1회 표시. "🎉 첫 종목을 추가했어요! [종목 분석 보기 →] [나중에 볼게요]". 키 설정 후에는 일반 토스트(`보러가기` 액션)로 전환.
4. **대시보드 도착**: 빈 포트폴리오 CTA 카드는 `onboarding_done` 설정된 **재방문** 시에만 표시 (중복 방지)

**localStorage 키 (3개)**:
- `disclaimer_accepted` — 면책 모달 확인 여부
- `onboarding_done` — 온보딩 스텝 완료 여부 (스킵 포함)
- `onboarding_first_stock_guided` — 첫 종목 추가 후 가이드 카드 노출 완료 여부

## 투자 면책 고지 (7곳)
1. **첫 실행 모달** — `localStorage('disclaimer_accepted')` 1회. 원금 손실 위험 + **"이 앱은 정보 제공 도구로, 실제 주식 거래는 지원하지 않아요. 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요."** 강조
2. **추천 페이지 상단** — "알고리즘이 분석한 참고 정보예요. 투자 결정은 항상 본인이 직접 판단해주세요." (안내형)
3. **종목 상세 종합의견 박스 하단** — "알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요." + market_opinion 뱃지에 📊 힌트 아이콘 병기
4. **종목 상세 분석 영역 하단** — "이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다."
5. **추천 카드 하단** — "투자 참고용이며 투자 권유가 아니에요. 실제 매수는 증권사 앱에서 직접 진행해 주세요."
6. **HoldingsAnalysisPage "주의 필요"/"추가 검토" 뱃지 하단** — "이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요." (italic)
7. **ScoringBreakdownPanel 상단** — 종합점수 바로 아래에 "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요." (스코어를 보기 전에 맥락을 먼저 이해하도록 패널 상단 배치)

## 데이터 표시 원칙
- **갱신 시각**: `src/utils/dataFreshness.ts`의 공용 함수
  - `getDataFreshnessLabel(lastUpdated: string)`: "N분 전 (HH:MM, 장중 데이터/전일 종가)" — 종목 상세
  - `getDataFreshnessShort(lastUpdated: string)`: "N분 전" — 대시보드
  - **lastUpdated 입력 형식**: SQLite `CURRENT_TIMESTAMP` (UTC `"YYYY-MM-DD HH:MM:SS"`) 또는 ISO 8601 (`Z` 포함). 두 함수 모두 내부의 `parseServerDate()`를 통해 SQLite 형식을 명시적으로 UTC로 해석한다 (그렇지 않으면 `new Date()`가 로컬 시간대로 해석해 KST와 9시간 오차 발생). KST와의 변환은 `Asia/Seoul` 타임존을 명시적으로 사용.
  - 장 운영시간(KST 평일 9~16시) 자동 판단. **클라이언트 시간대와 무관** (KST 고정 변환)
  - **알려진 제약**: 공휴일(광복절 등)에는 평일 휴장이지만 "장중 데이터"로 오표시 가능. 향후 공휴일 캘린더 통합 시 해소
- **재무지표 비교 기준**: 업종 **중앙값**(medians) 기준. 스코어링 알고리즘과 동일 기준 사용
- **스코어링 해석**: `ScoringBreakdownPanel`에서 만점대비 비율 4단계 (≥80% / ≥60% / ≥25% / 그 외)
  - 밸류에이션(만점3): 2.4 / 1.8 / 0.75 / 그 외
  - 수급(만점2): 1.6 / 1.2 / 0.5 / 그 외

---

## UI 디자인 시스템

### 대상 사용자
- **주식 투자 초보자** (전문 용어에 익숙하지 않음)
- **스마트폰** 주 사용 환경 (Capacitor 앱 배포 예정)

### 접근성 원칙 (필수 준수)
1. **최소 폰트 사이즈**: `text-xs`(12px) 이상. `text-[9px]`, `text-[10px]`, `text-[11px]` 사용 금지
2. **터치 타겟**: 모든 버튼/탭/아이콘 최소 44x44px (`min-w-[44px] min-h-[44px]` 또는 `p-3` 이상)
3. **hover 의존 금지**: 삭제 버튼, 도움말 등 모바일에서도 항상 접근 가능하도록 표시
4. **용어 설명 기본 노출**: PER, PBR, ROE 등 전문 용어는 항상 한줄 설명 병기
   - 예: "PER 12배 (낮을수록 저평가)", "PER — (적자 기업)"
   - 도움말 아이콘 뒤에 숨기지 않음 — 기본 표시
5. **색상+텍스트 병기**: 의견 뱃지 등 색상만으로 구분하지 않고 텍스트 보조
6. **테이블 → 카드 전환**: 가로 스크롤 필요한 테이블은 모바일에서 카드형 레이아웃
7. **아이콘 전용 버튼 금지**: 아이콘 옆에 반드시 텍스트 레이블 병기 (삭제, 수정 등)

### Opinion 뱃지 스타일 가이드
```
MarketOpinion (시장 기준):
  긍정적: bg-emerald-500/10 text-emerald-400 border-emerald-500/20
  중립적: bg-slate-500/10 text-slate-400 border-slate-500/20
  부정적: bg-red-500/10 text-red-400 border-red-500/20

HoldingOpinion (보유 기준, 별도 뱃지):
  보유:     bg-blue-500/10 text-blue-400
  추가매수: bg-emerald-500/10 text-emerald-400
  관망:     bg-yellow-500/10 text-yellow-400
  매도:     bg-red-500/10 text-red-400

추천 source 뱃지:
  전문가 선정 (manual): bg-purple-500/10 text-purple-400 + 탭/클릭 시 accordion 펼침
                       (accordion 콘텐츠: reason 텍스트 + "전문가가 직접 분석하여 선정한 종목이에요. 투자 결정은 본인이 하세요.")
  알고리즘:             bg-blue-500/10 text-blue-400 + 탭/클릭 시 accordion 펼침
                       (accordion 콘텐츠: reason 텍스트 + "10가지 지표를 자동 분석한 결과예요. 과거 성과가 미래를 보장하지 않아요.")

알림 뱃지 (ALERT_TYPE_LABELS — 중립적 표현으로 통일, code 상수는 그대로):
  sell_signal:  🔴 가격 하락 경고     (priority: high, border-l-red-500/50)
  sma5_break:   📉 단기 하락 알림     (priority: medium)
  sma5_touch:   💡 가격 지지 알림     (priority: medium)
  target_near:  🎯 목표가 근접 알림   (priority: high, border-l-red-500/50)
  undervalued:  💎 저평가 분석 결과   (priority: low)

HoldingOpinion 표시 라벨 (badge에서만 변환, 내부 값은 알고리즘과 호환):
  보유          → "보유"      (그대로)
  추가매수      → "추가 검토" (명령어 → 검토 권유)
  관망          → "관망"      (그대로)
  매도          → "주의 필요" (명령어 → 상태 설명)
  ※ 매도/추가 검토 뱃지 하단에는 "이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요." italic 안내 추가
```

### 컬러 팔레트 (다크 테마)
| 용도 | 클래스 |
|------|--------|
| 배경 (깊은) | `bg-slate-950` |
| 배경 (카드) | `bg-slate-900/50` |
| 테두리 | `border-slate-800` |
| 주요 액센트 | `blue-600`, `blue-500`, `blue-400` |
| 상승/긍정 | `emerald-500`, `emerald-400` |
| 하락/부정 | `red-500`, `red-400` |
| 텍스트 계층 | `slate-50` > `slate-300` > `slate-400` > `slate-600` |

### 공통 패턴
```
카드:     bg-slate-900/50 border border-slate-800 rounded-3xl p-6
버튼:     bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold px-4 py-3
인풋:     bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-blue-500
뱃지:     text-xs font-bold px-2.5 py-1 rounded-lg bg-{color}-500/10 text-{color}-400
호버:     hover:border-blue-500/30, hover:text-blue-400
애니메이션: animate-in, fade-in, slide-in-from-bottom-4, animate-spin
```

### 반응형 그리드
```
grid-cols-1 md:grid-cols-2 lg:grid-cols-3  (카드 그리드)
grid-cols-2 md:grid-cols-4                  (통계 카드 — 모바일 2열)
grid-cols-2 lg:grid-cols-4                  (스크리너 프리셋)
```

### 사이드바
- 고정 너비: `w-68`
- 배경: `bg-slate-950/80 backdrop-blur-2xl`
- 구분선: `border-r border-slate-800/60`

---

## 업종 카테고리 (8개)
1. 기술/IT
2. 바이오/헬스케어
3. 자동차/모빌리티
4. 에너지/소재
5. 금융/지주
6. 소비재/서비스
7. 엔터테인먼트/미디어
8. 조선/기계/방산

---

## Capacitor 전환 체크리스트 (Phase 3)
- [ ] `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` 설치
- [ ] `@capacitor/preferences` 설치 → `CapacitorDeviceIdStorage` 구현체 작성
- [ ] `DeviceIdStorage` 구현체 환경별 분기 (`import.meta.env.VITE_PLATFORM`)
- [ ] API Base URL 환경변수화 (`VITE_API_BASE_URL`)
- [ ] `npx cap init` → `npx cap add ios` / `npx cap add android`
- [ ] `npm run build && npx cap sync` 빌드 파이프라인 확인
- [ ] 오프라인 캐시: `@capacitor/preferences`에 마지막 holdings 데이터 저장
- [ ] Push Notification: `@capacitor/push-notifications` + FCM/APNs 설정
