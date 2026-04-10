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

## 상태관리 (Zustand — 도메인별 3개 스토어 + Toast)

### useNavigationStore (`src/stores/useNavigationStore.ts`)
**관심사**: UI 탐색 상태 (도메인 데이터 없음)

```typescript
interface NavigationState {
  activeTab: string;
  selectedStock: StockSummary | null;
  previousTab: string;  // 상세뷰 뒤로가기 시 복귀 탭
}

interface NavigationActions {
  navigateTo(tab: string): void;           // 탭 이동 + selectedStock 초기화
  handleDetailClick(stock: StockSummary): void; // 종목 선택 + detail 탭 이동
  goBack(): void;                          // previousTab으로 복귀
}
```

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

### 스토어 사용 원칙
- 컴포넌트는 필요한 스토어만 import (관심사 분리)
- Props drilling 대신 컴포넌트에서 직접 스토어 구독
- `navigateTo`는 `useNavigationStore`에서만 호출 (App.tsx에서 props로 내려주지 않음)

---

## 페이지 구조 (7개, 전부 lazy loading)

### DashboardPage
- **경로**: `activeTab === 'dashboard'`
- **스토어**: `useNavigationStore`, `usePortfolioStore`
- **기능**: 포트폴리오 요약 (총자산, 수익률, 종목수), 수익률 추이 AreaChart (20일), 자산배분 PieChart, 보유종목 리스트 (읽기전용, "포트폴리오 관리" 링크로 analysis 페이지 이동)
- **API 호출**: `stockApi.getHoldingsHistory()`

### HoldingsAnalysisPage (내 포트폴리오)
- **경로**: `activeTab === 'analysis'`
- **스토어**: `useNavigationStore`, `usePortfolioStore`
- **기능**: 보유종목 추가/수정/삭제 전체 관리, 요약 통계 (종목수, 투자금, 평가액, 수익률), StockSearchInput으로 종목 검색 후 추가, 인라인 편집 (평단가/수량/비중), 삭제 확인 다이얼로그, 토스트 알림
- **표시**:
  - `holding_opinion` 뱃지 + 구체적 이유 텍스트:
    - 매도(손절): "평단가 대비 -8.2% 손실. 손절 기준(-7%) 초과"
    - 매도(이탈): "5일선·20일선 모두 이탈. 하락세가 강해요"
    - 관망: "5일선 아래지만 20일선이 지지 중. 조금 기다려봐요"
    - 추가매수: "5일선 근처에서 지지받고 있어요"
    - 보유: "5일선 위, 이평선 정배열. 상승 흐름 유지 중"
  - `market_opinion` 뱃지 (시장: 긍정적/중립적/부정적)
  - 수익률 6구간 메시지 (색상별 구분):
    ≥20% "목표 수익 달성! 익절 고려" / ≥10% "잘 하고 계세요!" / ≥0% "소폭 수익 중" /
    ≥-3% "소폭 손실, 여유를" / ≥-7% "손절 기준 근접" / <-7% "손절 기준 도달"
- **컴포넌트 의존**: `StockSearchInput`

### RecommendationsPage (유망 종목 추천)
- **경로**: `activeTab === 'recommendations'`
- **스토어**: `useNavigationStore`
- **기능**: 추천 종목 그리드, 카테고리 탭 필터링, 요약 통계 (추천수, 섹터수, 평균점수), `source` 배지 표시 ('수동 추천' / '알고리즘'), 새로고침 버튼
- **API 호출**: `stockApi.getRecommendations()`
- **컴포넌트 의존**: `RecommendedStockCard`

### WatchlistPage (관심종목)
- **경로**: `activeTab === 'watchlist'`
- **스토어**: `useNavigationStore`
- **기능**: 관심종목 추가/삭제, 카드 그리드 (카테고리, 가격, market_opinion)
- **API 호출**: `stockApi.getWatchlist()`, `addToWatchlist()`, `removeFromWatchlist()`
- **컴포넌트 의존**: `StockSearchInput`

### ScreenerPage (종목 스크리너)
- **경로**: `activeTab === 'screener'`
- **스토어**: `useNavigationStore`
- **기능**: 프리셋 필터 4종 (저평가 우량주, 안전한 자산주, 고수익 성장주, 소액 투자), 고급 필터 (PER/PBR/ROE/가격/업종), 결과 테이블 (PER/PBR/ROE 색상 강조)
- **표시**: PER 음수 종목에 '적자' 뱃지 표시, `low_confidence` 플래그 시 섹터 비교 수치에 주의 표시
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

## 컴포넌트 (6개)

### StockDetailView (종목 상세 분석)
- **Props**: `stock: StockSummary`, `onBack`, `onAdd`, `onUpdate?`
- **기능**:
  - 차트 타입 토글: 라인 차트(기본, 초보자 친화) / 캔들 차트 전환 버튼
  - SMA5/SMA20 이평선 오버레이, 일봉/주봉/월봉 전환
  - 라인 차트 모드에서 초보자용 설명: "파란선 위에 있으면 좋은 신호예요"
  - 거래량 바차트 (상승=초록, 하락=빨강)
  - 투자자 매매동향 (기관/외국인/개인)
  - 기술지표 (RSI, MACD, 볼린저밴드) + 도움말 텍스트 기본 노출
  - PER/PBR/ROE/목표가 지표 카드 — 각각 컨텍스트 설명 병기:
    - PER: 적자 표시, 업종 대비 저렴/적정/고평가 해석
    - PBR: 자산 대비 저평가/적정/비싼 편 해석
    - ROE: "자기자본으로 N%를 벌었어요" + 우량 기업 판단
    - 목표가: 현재가 대비 상승여력 % 표시
  - `ScoringBreakdownPanel`: 10점 스코어를 4개 영역 게이지 바 + 한국어 해석으로 시각화
  - 분기 재무제표 테이블, 섹터 내 비교 테이블, 최근 뉴스 10건
  - 보유종목: `holding_opinion` 기반 수정 폼 / 비보유: 추가 폼
  - 의견 요약: `holding_opinion`(보유 시) + `market_opinion` 구분 표시
  - 데이터 새로고침 버튼
- **API 호출**: `getCurrentPrice`, `getVolatility`, `getIndicators`, `getNews`, `getFinancials`, `getSectorComparison`, `getChartData`, `refreshStock`

### ScoringBreakdownPanel (스코어 시각화)
- **Props**: `breakdown: ScoringBreakdown`
- **기능**: 종합점수 /10 표시, 밸류에이션/기술지표/수급/추세 각각 게이지 바 + 한국어 설명, `per_negative`/`low_confidence` 경고 플래그

### StockSearchInput (종목 검색)
- **Props**: `placeholder?`, `onSelect`, `resetKey?`, `className?`
- **기능**: 디바운스 검색 (250ms), 드롭다운 결과, 외부 클릭 닫기, resetKey로 초기화
- **API 호출**: `stockApi.searchStocks()`

### RecommendedStockCard (추천 종목 카드)
- **Props**: `stock: Recommendation`, `onDetailClick`
- **기능**: 종목명/코드, 점수 뱃지, 현재가→적정가 (상승여력%), 추천 사유
  - `source` 뱃지: '전문가 선정'(manual) / '알고리즘' + 호버 시 신뢰도 설명 tooltip
  - `market_opinion` 뱃지
  - fairPrice 라벨에 출처 표기: "적정가 (애널리스트)" vs "적정가 (추정)"

### NavButton (사이드바 네비게이션)
- **Props**: `active`, `onClick`, `icon`, `label`
- **기능**: 활성 상태 스타일링, 화살표 인디케이터

### StatCard (통계 카드)
- **Props**: `title`, `value`, `change?`, `positive?`, `icon`
- **기능**: 제목/값/변동률 표시, 아이콘 배경

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
| Holding | 보유종목 | code, name, value(비중), avgPrice, currentPrice, quantity, **holding_opinion**, **market_opinion** |
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
  - 알림 아이콘 + 우선순위별 좌측 강조 border, 아이콘 + 한국어 라벨
- 유저 프로필 → 클릭 시 analysis 페이지 이동

### 상세뷰 네비게이션
- `useNavigationStore.goBack()` 호출 → `previousTab`으로 복귀
- 보유종목에서 진입 → 뒤로가기 시 analysis 탭
- 그 외 → 이전 탭으로 복귀

---

## 투자 면책 고지 (3곳)
1. **첫 실행 모달** — `localStorage('disclaimer_accepted')` 1회. 원금 손실 위험 강조
2. **추천 페이지 상단** — "아래 종목들은 알고리즘 분석 결과로, 투자를 권유하지 않습니다." 상시 표시
3. **종목 상세 의견 하단** — "이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다."

## 데이터 표시 원칙
- **갱신 시각**: 대시보드("N분 전"), 종목 상세("N분/시간/일 전 업데이트") — `last_updated` 기반
- **재무지표 비교 기준**: 업종 **중앙값**(medians) 기준. 스코어링 알고리즘과 동일 기준 사용
- **스코어링 해석**: 영역 점수 기반 4단계 텍스트 (≥2.5 매우 좋음 / ≥1.5 적정 / ≥0.5 약함 / 그 외 부정적)

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
  전문가 선정 (manual): bg-purple-500/10 text-purple-400 + tooltip "전문가가 직접 선정한 종목이에요"
  알고리즘:             bg-blue-500/10 text-blue-400 + tooltip "10가지 지표로 자동 분석한 종목이에요"

알림 뱃지 (ALERT_TYPE_LABELS):
  sell_signal:  🔴 매도 신호    (priority: high, border-l-red-500/50)
  sma5_break:   📉 단기 하락    (priority: medium)
  sma5_touch:   💡 매수 타이밍  (priority: medium)
  target_near:  🎯 목표가 근접  (priority: high, border-l-red-500/50)
  undervalued:  💎 저평가 신호  (priority: low)
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
