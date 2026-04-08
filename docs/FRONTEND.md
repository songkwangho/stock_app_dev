# Frontend Documentation

## 개요
- **프레임워크**: React 19 + TypeScript
- **번들러**: Vite 7
- **스타일**: Tailwind CSS v4 (다크 테마)
- **차트**: Recharts v3.7
- **상태관리**: Zustand v5
- **아이콘**: Lucide React
- **HTTP**: Axios (X-Device-Id 헤더 자동 첨부)

---

## 사용자 식별 (device_id)

### 개요
로그인 없이 기기별 UUID로 개인 데이터를 서버에서 분리한다.

### 구현 (src/api/stockApi.ts)
- **생성**: 앱 최초 실행 시 `crypto.randomUUID()` 로 UUID v4 생성
- **저장**: `localStorage.setItem('device_id', uuid)`
- **전송**: Axios 인스턴스에 request interceptor 추가, 모든 요청에 `X-Device-Id` 헤더 자동 첨부
- **함수**: `getDeviceId()` — localStorage에서 읽되, 없으면 생성 후 저장하여 반환

### 코드 패턴
```typescript
function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}

axios.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});
```

---

## 페이지 구조 (7개, 전부 lazy loading)

### DashboardPage
- **경로**: `activeTab === 'dashboard'`
- **Props**: `holdings`, `onNavigate`, `onDetailClick`
- **기능**: 포트폴리오 요약 (총자산, 수익률, 종목수), 수익률 추이 AreaChart (20일), 자산배분 PieChart, 보유종목 리스트 (읽기전용, "포트폴리오 관리" 링크로 analysis 페이지 이동)
- **API 호출**: `stockApi.getHoldingsHistory()`

### HoldingsAnalysisPage (내 포트폴리오)
- **경로**: `activeTab === 'analysis'`
- **Props**: `holdings`, `onAdd`, `onUpdate`, `onDelete`, `onDetailClick`
- **기능**: 보유종목 추가/수정/삭제 전체 관리, 요약 통계 (종목수, 투자금, 평가액, 수익률), StockSearchInput으로 종목 검색 후 추가, 인라인 편집 (평단가/수량/비중), 삭제 확인 다이얼로그, 토스트 알림
- **컴포넌트 의존**: `StockSearchInput`

### RecommendationsPage (유망 종목 추천)
- **경로**: `activeTab === 'recommendations'`
- **Props**: `onDetailClick`
- **기능**: 추천 종목 그리드, 카테고리 탭 필터링, 요약 통계 (추천수, 섹터수, 평균점수), 새로고침 버튼
- **API 호출**: `stockApi.getRecommendations()`
- **컴포넌트 의존**: `RecommendedStockCard`

### WatchlistPage (관심종목)
- **경로**: `activeTab === 'watchlist'`
- **Props**: `onDetailClick`
- **기능**: 관심종목 추가/삭제, 카드 그리드 (카테고리, 가격, 의견)
- **API 호출**: `stockApi.getWatchlist()`, `addToWatchlist()`, `removeFromWatchlist()`
- **컴포넌트 의존**: `StockSearchInput`

### ScreenerPage (종목 스크리너)
- **경로**: `activeTab === 'screener'`
- **Props**: `onDetailClick`
- **기능**: 프리셋 필터 4종 (저평가 우량주, 안전한 자산주, 고수익 성장주, 소액 투자), 고급 필터 (PER/PBR/ROE/가격/업종), 결과 테이블 (PER/PBR/ROE 색상 강조)
- **API 호출**: `stockApi.screener(filters)`

### MajorStocksPage (주요 종목 현황)
- **경로**: `activeTab === 'major'`
- **Props**: `onDetailClick`
- **기능**: 8개 섹터별 종목 그룹 표시, 종목 삭제 기능
- **API 호출**: `stockApi.getAllStocks()`, `deleteStock()`

### SettingsPage (설정)
- **경로**: `activeTab === 'settings'`
- **Props**: 없음
- **기능**: 종목 수동 추가, API 상태 정보, DB 상태, 버전 정보

---

## 컴포넌트 (5개)

### StockDetailView (종목 상세 분석)
- **Props**: `stock: StockSummary`, `onBack`, `onAdd`, `onUpdate?`
- **기능**:
  - 캔들스틱 차트 (SMA5/SMA20 이평선, 일봉/주봉/월봉 전환)
  - 거래량 바차트 (상승=초록, 하락=빨강)
  - 투자자 매매동향 (기관/외국인/개인)
  - 기술지표 (RSI, MACD, 볼린저밴드) + 도움말 툴팁
  - PER/PBR/ROE/목표가 지표 카드
  - 분기 재무제표 테이블
  - 섹터 내 비교 테이블
  - 최근 뉴스 10건
  - 보유종목: 수정 폼 / 비보유: 추가 폼
  - 의견 요약 + 분석 텍스트 + 토스증권 링크
  - 데이터 새로고침 버튼
- **API 호출**: `getCurrentPrice`, `getVolatility`, `getIndicators`, `getNews`, `getFinancials`, `getSectorComparison`, `getChartData`, `refreshStock`

### StockSearchInput (종목 검색)
- **Props**: `placeholder?`, `onSelect`, `resetKey?`, `className?`
- **기능**: 디바운스 검색 (250ms), 드롭다운 결과, 외부 클릭 닫기, resetKey로 초기화
- **API 호출**: `stockApi.searchStocks()`

### RecommendedStockCard (추천 종목 카드)
- **Props**: `stock: Recommendation`, `onDetailClick`
- **기능**: 종목명/코드, 점수 뱃지, 현재가→적정가 (상승여력%), 추천 사유, 의견 뱃지

### NavButton (사이드바 네비게이션)
- **Props**: `active`, `onClick`, `icon`, `label`
- **기능**: 활성 상태 스타일링, 화살표 인디케이터

### StatCard (통계 카드)
- **Props**: `title`, `value`, `change?`, `positive?`, `icon`
- **기능**: 제목/값/변동률 표시, 아이콘 배경

---

## 상태관리 (Zustand: useStockStore)

### State
```typescript
activeTab: string          // 현재 탭 (dashboard, analysis, recommendations, watchlist, screener, major, settings, detail)
selectedStock: StockSummary | null  // 상세보기 선택 종목
holdings: Holding[]        // 포트폴리오 보유종목
```

### Actions
| 액션 | 설명 |
|------|------|
| `navigateTo(tab)` | 탭 이동 + selectedStock 초기화 |
| `handleDetailClick(stock)` | 종목 선택 + detail 탭 이동 |
| `fetchHoldings()` | API에서 보유종목 로드 (DB→앱 포맷 매핑) |
| `addHolding(stock)` | 보유종목 추가 → fetchHoldings() |
| `updateHolding(stock)` | 보유종목 수정 → fetchHoldings() (add 엔드포인트 UPSERT) |
| `deleteHolding(code)` | 보유종목 삭제 (code 기반) |

### 데이터 매핑 (API → App)
```
weight → value
avg_price → avgPrice
price → currentPrice
```

---

## API 클라이언트 (stockApi.ts)

**Base URL**: `http://localhost:3001/api`

### 함수 목록 (22개)
| 함수 | HTTP | 경로 |
|------|------|------|
| getCurrentPrice(code) | GET | /stock/{code} |
| getAllStocks() | GET | /stocks |
| addStock(code) | POST | /stocks |
| deleteStock(code) | DELETE | /stocks/{code} |
| searchStocks(query) | GET | /search?q= |
| getHoldings() | GET | /holdings |
| addHolding(stock) | POST | /holdings |
| deleteHolding(code) | DELETE | /holdings/{code} |
| getHoldingsHistory() | GET | /holdings/history |
| getRecommendations() | GET | /recommendations |
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

## 타입 정의 (src/types/stock.ts)

### 핵심 인터페이스
| 인터페이스 | 용도 | 주요 필드 |
|-----------|------|----------|
| Stock | 종목 기본 | code, name, category, price, change, per, pbr, roe, target_price, opinion |
| Holding | 보유종목 | code, name, value(비중), avgPrice, currentPrice, quantity |
| Recommendation | 추천종목 | code, name, category, reason, score, fairPrice, currentPrice, 재무지표, analysis, advice |
| ScoringBreakdown | 스코어링 상세 | valuation, technical, supplyDemand, trend, total, detail |
| StockDetail | 종목 상세 | Stock + history[], investorData[], analysis, tossUrl, chartPath, scoringBreakdown? |
| StockSummary | 종목 요약 | code, name, category, price, opinion, avgPrice? |
| HistoryEntry | 가격 히스토리 | date, price, open, high, low, volume |
| InvestorEntry | 투자자 동향 | date, institution, foreign, individual |
| ChartDataPoint | 차트 데이터 | price, OHLC, volume, sma5, sma20 |
| TechnicalIndicators | 기술지표 | rsi, macd, bollinger, summary |
| Alert | 알림 | id, code, name, type, message, read, created_at |
| MarketIndex | 시장지수 | symbol, value, change, changeRate, positive |
| WatchlistItem | 관심종목 | code, name, category, price, opinion, added_at |
| NewsItem | 뉴스 | title, url, date, source |
| FinancialData | 재무제표 | periods[], financials[] |
| SectorComparison | 섹터비교 | category, averages, stocks[] (perVsAvg, pbrVsAvg, roeVsAvg) |

---

## 네비게이션 구조 (App.tsx)

### 사이드바 메뉴 순서
1. 대시보드 (`dashboard`) - LayoutDashboard
2. 내 포트폴리오 (`analysis`) - TrendingUp
3. 유망 종목 추천 (`recommendations`) - Star
4. 관심종목 (`watchlist`) - Eye
5. 종목 스크리너 (`screener`) - Filter
6. 주요 종목 현황 (`major`) - Layers
7. 설정 (`settings`) - Settings

### 헤더 구성
- 시장지수 (KOSPI/KOSDAQ)
- 글로벌 검색바 (디바운스 300ms)
- 알림 벨 (미읽은 수 뱃지)
- 유저 프로필 → 클릭 시 analysis 페이지 이동

### 상세뷰 네비게이션
- 보유종목에서 진입 → 뒤로가기 시 analysis 탭
- 그 외 → 이전 탭으로 복귀

---

## UI 디자인 시스템

### 대상 사용자
- **주식 투자 초보자** (전문 용어에 익숙하지 않음)
- **스마트폰** 주 사용 환경

### 접근성 원칙 (필수 준수)
1. **최소 폰트 사이즈**: `text-xs`(12px) 이상. `text-[9px]`, `text-[10px]`, `text-[11px]` 사용 금지
2. **터치 타겟**: 모든 버튼/탭/아이콘 최소 44x44px (`min-w-[44px] min-h-[44px]` 또는 `p-3` 이상)
3. **hover 의존 금지**: 삭제 버튼, 도움말 등 모바일에서도 항상 접근 가능하도록 표시
4. **용어 설명 기본 노출**: PER, PBR, ROE 등 전문 용어는 항상 한줄 설명 병기
   - 예: "PER 12배 (낮을수록 저평가)"
   - 도움말 아이콘 뒤에 숨기지 않음 — 기본 표시
5. **색상+텍스트 병기**: 의견 뱃지 등 색상만으로 구분하지 않고 텍스트 보조
6. **테이블 → 카드 전환**: 가로 스크롤 필요한 테이블은 모바일에서 카드형 레이아웃
7. **아이콘 전용 버튼 금지**: 아이콘 옆에 반드시 텍스트 레이블 병기 (삭제, 수정 등)

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
