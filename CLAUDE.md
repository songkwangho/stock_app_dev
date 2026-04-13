# Stock Analyzer - Claude Code 개발 가이드

## 프로젝트 개요
한국 주식 분석 및 포트폴리오 관리 애플리케이션. Capacitor 기반 iOS/Android 앱으로 배포 예정.
공식 데이터 API + 보조 스크래핑을 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
로그인 없이 기기별 익명 식별자(device_id)로 개인 데이터를 분리하여 관리한다.

> **배포 전략**: React(Vite) → Capacitor 래핑 → App Store/Play Store

---

## 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + Recharts v3.7 + Zustand v5
- **모바일 래핑**: Capacitor (iOS/Android 배포 시)
- **백엔드**: Node.js + Express + **PostgreSQL (pg Pool)** + express-rate-limit (14차 Step 1~14 완료, `DATABASE_URL` 환경변수로 Neon 연결)
- **데이터 소스**: 네이버 증권 (보조 스크래핑) → KIS/KRX 공식 API 전환 예정 (Puppeteer/Toss 캡처는 14차에서 제거)

---

## 프로젝트 구조
```
stock_app_dev/
├── server/
│   ├── server.js             # 컴포지션 루트 (~80줄, 6개 도메인 라우터 마운트)
│   ├── index.js              # 진입점 래퍼
│   ├── db/
│   │   ├── connection.js     # pg.Pool + query()/withTransaction() 헬퍼 (14차)
│   │   ├── schema.js         # 8개 테이블 PG DDL — TIMESTAMPTZ/BIGSERIAL/NUMERIC, eps/category/alerts.source 내재화, ON DELETE CASCADE
│   │   └── migrate.js        # information_schema 기반 컬럼 검증 (신규 DB는 사실상 no-op)
│   ├── helpers/
│   │   ├── cache.js          # getCached/setCache/invalidateCache
│   │   ├── deviceId.js       # getDeviceId/requireDeviceId
│   │   ├── sma.js            # async computeSMA(pool, code) — 도메인 간 의존성 회피용 공유 유틸
│   │   └── queryBuilder.js   # buildSetClause/buildWhereClause — PG 동적 플레이스홀더 ($1, $2…) 유틸
│   ├── scrapers/
│   │   └── naver.js          # 네이버 증권 스크래핑 (EUC-KR) — 14차에서 toss.js 제거
│   ├── domains/
│   │   ├── analysis/
│   │   │   ├── scoring.js    # 스코어링 3개 async + calculateHoldingOpinion/Trend 동기 + median
│   │   │   ├── indicators.js # async calculateIndicators (RSI/MACD/볼린저 + *_available 플래그)
│   │   │   └── router.js     # 분석 라우터 7 endpoints — 모두 async (screener는 queryBuilder 사용)
│   │   ├── alert/
│   │   │   ├── service.js    # async generateAlerts + ALERT_COOLDOWNS (KST SQL `AT TIME ZONE 'Asia/Seoul'::date`) + source 태깅
│   │   │   └── router.js     # 알림 라우터 4 endpoints — async
│   │   ├── portfolio/
│   │   │   ├── service.js    # async recalcWeights (withTransaction)
│   │   │   └── router.js     # 포트폴리오 라우터 5 endpoints async — PUT은 buildSetClause 사용
│   │   ├── watchlist/
│   │   │   └── router.js     # 관심종목 라우터 3 endpoints async
│   │   ├── stock/
│   │   │   ├── service.js    # async getStockData + syncAllStocks(BATCH_SIZE=3, Neon 풀 대응) + scheduleDaily8AM
│   │   │   ├── data.js       # async registerInitialData(pool): topStocks(97) + initialRecommendations(20)
│   │   │   └── router.js     # 종목 라우터 7 endpoints async — DELETE는 ON DELETE CASCADE 의존
│   │   └── system/
│   │       └── router.js     # 시스템 라우터 2 endpoints async (health, market/indices)
│   └── scheduler.js          # setupScheduler + setupCleanup(pool) — async, 시드 보존 가드 포함
├── src/
│   ├── App.tsx               # 반응형 레이아웃 + 투자 면책 모달
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── storage/deviceId.ts   # DeviceIdStorage 인터페이스 + Web 구현체
│   ├── stores/
│   │   ├── useNavigationStore.ts  # activeTab, selectedStock, pendingFocus
│   │   ├── usePortfolioStore.ts   # holdings, isLoading, error
│   │   ├── useAlertStore.ts       # alerts, unreadCount
│   │   ├── useWatchlistStore.ts   # items, TTL 캐시
│   │   └── useToastStore.ts       # toasts
│   ├── types/stock.ts        # MarketOpinion / HoldingOpinion / UpdateHoldingPayload
│   ├── pages/                # 7개 페이지 (lazy loading)
│   ├── components/           # 9개 (ScoringBreakdownPanel, WatchlistContent, HelpBottomSheet, ErrorBanner 포함)
│   └── utils/dataFreshness.ts # getDataFreshnessLabel/Short + parseServerDate (KST 고정)
├── scripts/
│   └── backfill-history.js   # 97종목 × N일 장기 데이터 적재 + 체크포인트 (16차 스켈레톤)
└── docs/
    ├── BACKEND.md            # 백엔드 상세 (DB 스키마, API, 알고리즘)
    ├── FRONTEND.md           # 프론트엔드 구조 (스토어, 페이지, 컴포넌트, 타입)
    ├── FRONTEND_UX.md        # UX 원칙 (온보딩, 면책, 디자인 시스템, 초보자 안내)
    ├── AI.md                 # AI 활용 내역 + 기술 부채
    └── SKILL_KOREAN_STOCK_APP.md  # 도메인 지식 (주식 지표, 섹터별 특성, 면책 표현)
```

---

## 개발 명령어
```bash
npm run dev              # Vite 프론트엔드 (포트 5173)
DATABASE_URL=postgres://... node server/server.js  # Express 백엔드 (포트 3001)
npm run build            # TypeScript 체크 + 프로덕션 빌드
```

> **PostgreSQL 전환 완료 (14차)**: `DATABASE_URL` 환경변수 필수. Neon 무료 플랜 권장. 서버 기동 순서는 `initSchema → runMigrations → registerInitialData → setupCleanup → setupScheduler → app.listen`. 데이터 마이그레이션(SQLite → Neon)은 별도 스크립트로 수행 예정.

---

## 핵심 규칙

### 코드 작성
- 한국어 UI 텍스트, 영어 코드/변수명. Tailwind 다크 테마 (slate + blue)
- 모든 페이지 lazy loading. API는 `stockApi.ts` 통해서만. 상태는 도메인별 Zustand 스토어
- **반응형**: PC 사이드바(`hidden md:flex`) + 모바일 하단 탭바 5개(`fixed bottom-0 md:hidden`)
  - 모바일 탭: 대시보드 / 포트폴리오 / 추천 / 알림(미읽은 뱃지) / 설정
  - 관심종목: 포트폴리오 페이지 내 "보유종목/관심종목" 탭 전환 (A안 적용)
  - 스크리너·주요종목은 PC 사이드바에만 노출
- **초보자 UX 원칙**: → `docs/FRONTEND_UX.md` 참조
- **주식 도메인 지식**: → `docs/SKILL_KOREAN_STOCK_APP.md` 참조 (지표 해석, 섹터별 특성, 면책 표현)

### device_id
- 로그인 없음. `DeviceIdStorage` 인터페이스로 환경별 교체 (Web: localStorage, Capacitor: 준비됨)
- 백엔드: `requireDeviceId` 미들웨어. 개인 데이터(holdings/watchlist/alerts) 필터링
- 보안: CORS 화이트리스트 + Rate limiting 120req/min. HMAC 서명 예정

### Opinion 분리
```typescript
type MarketOpinion  = '긍정적' | '중립적' | '부정적';  // DB 저장, 공용
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';  // 런타임 계산, 개인화
```
- `stock_analysis.opinion` = MarketOpinion 전용
- GET/POST/PUT `/api/holdings` 응답에 `holding_opinion` 런타임 계산 포함
- UI 표시 라벨: "매도" → "주의 필요", "추가매수" → "추가 검토" (내부 값은 유지)

---

## 분석 알고리즘 요약

### HoldingOpinion (런타임, `calculateHoldingOpinion`)
1. 손절(-7%) → 매도 (SMA 불필요)
2. SMA5 null → 보유 (판단 불가, `sma_available=false`이면 UI는 "분석 중" 뱃지 표시)
3. 이중 이탈(SMA5+SMA20 아래) → 매도
4. 단기이탈+중기지지 → 관망
5. SMA20 null → SMA5만으로 판단 (관망/추가매수/보유)
6. 5일선 근접(100~101%) → 추가매수
7. 정배열 → 보유

### MarketOpinion (10점, DB 저장)
- **밸류에이션**(0~3): PER/PBR 섹터 중앙값 + PEG. 적자→0점+플래그. PEG 무효→재정규화
- **기술지표**(0~3): RSI(30%, 30~50보정) + MACD(25%) + 볼린저(20%, %B/80) + 거래량(25%)
- **수급**(0~2): 외국인(max1.2)+기관(max0.8), 10일 가중 감쇠(decay=0.8)
- **추세**(0~2): SMA5/SMA20 배열 상태
- 합산 ≥7 긍정적, ≥4 중립적, <4 부정적 (임시 임계값, Phase 4 백테스팅 후 최적화 예정)
- **도메인 한계**: 바이오 섹터는 PER 기반 밸류에이션이 부적합 (적자 기업 多). 섹터별 특성은 `SKILL_KOREAN_STOCK_APP.md` 참조.

---

## DB 테이블 (8개)
| 테이블 | PK | 용도 |
|--------|-----|------|
| stocks | code | 종목 기본정보 + EPS |
| holding_stocks | device_id+code | 포트폴리오 (개인) — `avg_price`는 NUMERIC(14,2) (16차 설계-A: 분할 매수 평균 소수점 보존) |
| stock_history | code+date | 일일 OHLCV |
| stock_analysis | code | market_opinion + 분석 텍스트 |
| recommended_stocks | code | 추천 + source 구분 |
| investor_history | code+date | 투자자 매매 히스토리 |
| alerts | id | 알림 (개인, `source` 컬럼으로 holding/watchlist 구분) |
| watchlist | device_id+code | 관심종목 (개인) |

## API (28개, 6개 도메인 라우터에 분리)
- **stock** (7): `/api/stock/:code`, `/api/stock/:code/refresh`, `/api/stocks` (GET/POST/DELETE), `/api/search`, `/api/recommendations`
- **portfolio** (5): `/api/holdings` (GET/POST), `/api/holdings/:code` (PUT/DELETE), `/api/holdings/history`
- **analysis** (7): `/api/stock/:code/{indicators,volatility,financials,news,chart/:tf}`, `/api/screener`, `/api/sector/:cat/compare`
- **alert** (4): `/api/alerts` (GET/DELETE), `/api/alerts/unread-count`, `/api/alerts/read`
- **watchlist** (3): `/api/watchlist` (GET/POST/DELETE)
- **system** (2): `/api/health`, `/api/market/indices`

> **마운트 순서**: `'/api'`에 직접 마운트되는 라우터는 specific path를 먼저. system → analysis → stock 순 마운트. `/api/stock/:code/indicators`가 `/api/stock/:code`에 가로채이지 않도록.

---

## 로드맵

### Phase 1 - 구조 안정화 ✅
Opinion 분리, DeviceIdStorage, Zustand 스토어, 알림 쿨다운, PER/PEG 엣지케이스, CORS+Rate limit

### Phase 2 - 백엔드 안정화 + PostgreSQL 전환 (이번 단계부터 착수)
- [x] **9~13차** (구조 안정화, 압축 요약): 백엔드 도메인 분리(9차, server.js 891→80줄 + 6개 라우터), system 라우터 + cleanupOldData 시드 보존(10차), `computeSMA`→`helpers/sma.js` + 알림 일일 2건 가드 + 지표 `*_available`(11차), 첫 종목 가이드 카드 라우팅 + 섹터 비교 백분위 + KOSPI ℹ️(12차), ErrorBanner 공통 + 차트 동적 색상 + 삭제 확인 모달 + health 스플래시(13차). 세부 내역은 `docs/AI.md` 참조.
- [x] **14차 (PostgreSQL 전환 완료)**: `pg` 기반 `connection.js` (pg.Pool + query/withTransaction), `schema.js` PG DDL (TIMESTAMPTZ/BIGSERIAL/NUMERIC, eps/category/source 내재화 — PG-1 해소), `migrate.js` information_schema 기반 (멀티스테이트먼트 제거 — PG-2 해소), `helpers/queryBuilder.js` 동적 플레이스홀더 (PG-4/5 해소), `sma.js`/scoring 3개/indicators async, `generateAlerts` async + KST SQL + `source` 태깅(holding/watchlist), `getStockData` async + `withTransaction` 2곳 교체 (PG-3 해소), 라우터 6개 × 28 엔드포인트 `await query()` 전환, `BATCH_SIZE` 5→3, `ON DELETE CASCADE` 의존 (stock/router DELETE 단순화), **Puppeteer 제거** (`scrapers/toss.js` 삭제 + `chart_path` 컬럼 제거 + StockDetailView 캡처 UI 제거), `server.js` top-level await 초기화, `scheduler.js`(pool) 주입, `advice` 문구 중립화 (`buildFallback`에서 market_opinion '중립적' 기본값 보정). **UI/UX 7건**: 알림 `source` 뱃지, 차트 "오늘" 라벨, 빈 차트 CTA, 빈 검색→SettingsPage, `ErrorBanner.autoRetryMs`, health `lastSync` 경고 배너, 알림 `created_at` 짧은 포맷.
- [x] **15차 (PG 후속 버그 수정 + UI/UX 6건)**: `portfolio/router.js`에서 `calculateHoldingOpinion`에 캐스팅 전 string 값이 전달되던 버그 수정 (버그-3) — `avgPriceNum`/`priceNum` 변수로 미리 캐스팅. `stock/router.js` `/recommendations`의 97종목 동시 `Promise.all` → `RECOMMEND_BATCH_SIZE=3` 직렬 배치 처리로 Neon 풀(max=5) 경합 회피 (버그-5). `migrate.js`에 `stock_analysis` + `alerts.source` 검증 컬럼 추가 (버그-1). `Holding` 타입에 `last_updated?: string` 추가, `DashboardPage`에서 강제 캐스팅(`as unknown as`) 제거 (버그-2). `dataFreshness.ts` 주석 PostgreSQL 기준으로 갱신 (불일치-4). **UI/UX 6건**: 보유종목 카드에 "평단 → 현재" 표시 (5-1), 추천 평균 점수를 `source='manual'` 항목만으로 한정 + 라벨 "전문가 선정 평균 점수" (5-2), 알림 패널 `source` 미설정(레거시) 시 slate `[알림]` 폴백 뱃지 (5-3), DashboardPage 차트에 `cost`(투자원금) 회색 파선 Line + Legend로 수익/손실 구간 시각화 (5-4), `holdings.length === 1`일 때 PieChart 대신 단일 종목 카드 + 분산 권유 박스 (5-5), 사이드바 "Premium Plan" 카드 제거 — Phase 5 전까지 비활성 버튼 노출이 사용자 혼란 유발 (5-6).
- [x] **16차 (배포 직전 차단 버그 + UI/UX 7건)**: **서버 코드**: `portfolio/router.js` POST/PUT 블록에 pg NUMERIC 캐스팅 이유 주석 보강 (버그-A). `stock/router.js` `/recommendations` 정렬을 `manual` (score 기준 정렬) / `algorithm` (score=50 placeholder라 순서 미정) 분리 조합으로 변경 (버그-B). `DashboardPage` 차트 `AreaChart`에 `Line`을 섞던 비공식 패턴을 `ComposedChart`로 교체 (버그-C). `scheduler.js`에 `initialSyncWithRetry()` — 첫 `syncAllStocks` 실패 시 30초 후 1회 backoff (Neon sleep 해제 대응, 버그-D). `server.js` `ALLOWED_ORIGINS`에 `process.env.FRONTEND_URL` 콤마 구분 주입 — 배포 직후 Vercel CORS 차단 해소 (버그-E). `schema.js` `holding_stocks.avg_price` `INTEGER` → `NUMERIC(14,2)` — 분할 매수 평균 소수점 손실 제거 (설계-A). `stock/service.js`에서 `change`/`change_rate`를 최근 2거래일 종가로 실제 계산 (이전 `"0"`/`"0.00"` 하드코딩 → MajorStocksPage 등락률 기반, 5-5 선행). **신규 파일**: `scripts/backfill-history.js` 스켈레톤 — 97종목 × N일 네이버 fchart 배치 적재, `--days/--resume/--limit/--offset` 옵션, `scripts/.backfill-state.json` 체크포인트, 종목 간 1초 딜레이. **UI/UX**: HoldingsAnalysisPage "손절 기준(-7%)" 문구 순화 — "손실이 나고 있어요. 시장 상황을 지켜봐요" / "해당 종목의 분석을 다시 확인해보세요 🔴" (5-1). DashboardPage Y축/툴팁 `formatKoreanWon()` — `₩Nk` → `₩N만` / `₩N.N억` (5-2). RecommendationsPage 빈 상태를 KST 현재 시간으로 분기 — 오전 8시 전/분석 중/오늘 없음 3가지 메시지 (5-3). ScreenerPage 결과를 `md:hidden` 카드 + `hidden md:block` 테이블로 분리 — 모바일 가로 스크롤 제거 (5-4). MajorStocksPage 카드에 ▲/▼ 등락률 표시, `"0.00"` placeholder는 숨김 (5-5). StockDetailView 라인 차트 상단 안내를 "💡 이평선(이동평균선) 보는 법" 2줄로 확장 — 파란선/노란선 의미 + 정배열 해석 (5-6). App.tsx 알림 "지금 확인하기"/"나중에 볼게요" 버튼 `min-h-[44px]`로 HIG 터치 타겟 확보 (5-7).
- [x] **17차 (배포 직전 마무리 + UI/UX 6건)**: **버그 수정**: `stock/service.js` INSERT ... ON CONFLICT에 `change`/`change_rate` 누락 → UPDATE 절에 추가 (버그-2, 16차 5-5 완성). `migrate.js`에 `holding_stocks.avg_price` INTEGER→NUMERIC(14,2) ALTER 추가 — 기존 DB에 16차 설계-A를 소급 적용 (설계-1). `RecommendationsPage` KST 시간 계산 `getTimezoneOffset()` 오류를 `Intl.DateTimeFormat(timeZone: 'Asia/Seoul')`로 교체 — Render(UTC) 환경에서도 정확한 hour 산출 (버그-3). `DashboardPage` `formatKoreanWon` 선언을 import 블록 사이에서 이후로 이동 (버그-1, import/first 린트). `MajorStocksPage` 등락률 placeholder 체크에 `'0'`/`'-0.00'` 추가 (버그-5, 부동소수점 -0.00 방어). **UI/UX**: `ScoringBreakdownPanel` 상단에 "⚠️ 이 점수 기준은 실증 검증 전이에요" amber 경고 배너 고정 노출 (P4-보완, 앱스토어 심사 리스크 완화). DashboardPage 차트 상단에 "💡 평가금액(실선)이 투자원금(파선) 위면 수익 / 아래면 손실" 해석 힌트 (5-1). HoldingsAnalysisPage holding_opinion 뱃지와 이유 텍스트를 줄 분리 — 뱃지는 `[주의 필요]` 형태 대괄호 라벨, 이유는 아래 별도 줄로 이동 (5-2). MajorStocksPage 상단에 "※ ▲/▼ 등락률은 전일 종가 대비" 기준 명시 (5-3). `RecommendedStockCard` 편집팀 점수 뱃지에 `?` 기호 + `title` 툴팁으로 "편집팀이 매긴 종목 추천 점수" 설명 (5-4). `ScreenerPage` 모바일 카드 PER/PBR/ROE 레이블에 `(낮을수록↓)`/`(1이하↓)`/`(높을수록↑)` 힌트 추가 — PC 테이블 수준 정보 노출 (5-5).
1. [ ] **SQLite → Neon 데이터 마이그레이션 스크립트** (다음 세션): `stocks.db` 덤프 → PG 임포트 + `migrate.js` 검증. 현재는 빈 스키마로만 기동 가능.
2. [x] **`scripts/backfill-history.js` 스켈레톤 작성** (16차). 실제 실행(97종목 × 3년)은 다음 세션 — `DATABASE_URL` 연결 후 `node scripts/backfill-history.js --days 1095` 한 번 실행하면 `scripts/.backfill-state.json`에 체크포인트 기록됨.
3. [x] **CORS `ALLOWED_ORIGINS` 환경변수화** (16차 버그-E): `process.env.FRONTEND_URL`을 콤마로 분해해 자동 포함.
4. [ ] KIS/KRX 평가 (시나리오 B 우선) — 장기로 이동

> **HMAC 서명은 Phase 5로 이동** (유료 구독 도입 시점). 사용자 0~수 명 단계에서는 device_id만으로 충분.

### Phase 3 - 빠른 웹앱 배포 (PostgreSQL 전환 완료, 배포 단계)
PG 전환 완료 → 데이터 마이그레이션 → Recharts lazy → Vercel + Render 배포 → 2~4주 운영 → Capacitor.

**배포 직전 체크리스트 (P3-1)**:
- [ ] `VITE_API_BASE_URL` Vercel 환경변수에 Render API URL 설정
- [ ] `DATABASE_URL` Render에 Neon connection string 설정
- [ ] `NODE_ENV=production` Render에 설정 (pg `ssl: { rejectUnauthorized: false }` 활성화)
- [ ] `FRONTEND_URL` Render에 Vercel 배포 URL 설정 → CORS `ALLOWED_ORIGINS` 자동 포함 (16차 완료)
- [ ] `npm run build` TypeScript 오류 없음 확인
- [ ] Recharts lazy import 적용 + 번들 측정 (< 250KB gzip 목표)
- [ ] Neon 데이터 마이그레이션 (기존 SQLite 데이터)
- [ ] Render 메모리 모니터링 512MB 한도 확인 (Puppeteer 제거 후 Axios만 → 여유 있음)
- [ ] Neon sleep 해제 실측 → `connectionTimeoutMillis` 5초가 충분한지 검토

1. [ ] **Recharts lazy import** → 번들 측정 (`npm run build` + visualizer). 초기 진입 청크 < 250KB gzip 목표
2. [ ] **Vercel + Render 웹앱 배포** (~$7/월): Vercel(프론트, 무료) + Render Web Service Starter($7) + Neon PostgreSQL(무료). Persistent Disk 불필요 (PG로 전환 완료)
3. [ ] 웹앱 2~4주 운영 (피드백 수집 + 핵심 흐름 검증)
4. [x] **앱스토어 카테고리**: "Utilities" 결정 (Finance 심사 리스크 회피)
5. [ ] Capacitor 설정 (웹앱 검증 후 착수): `@capacitor/preferences`, `@capacitor/network` 오프라인 폴백
6. [ ] Push 파이프라인 — generateAlerts에 일 N건 가드는 이미 적용. **알림 본문에 "하루 1회 갱신 기반" 명시**
7. [ ] 실제 디바이스 성능 테스트 (시작 3초 / Phase1 2초 / 탭 300ms)
8. [x] **Neon sleep 해제 + syncAllStocks 재시도 (P3-3, 16차 버그-D 해소)**: `scheduler.js`에 `initialSyncWithRetry()` 추가 — 첫 시도 실패 시 30초 후 1회 backoff.

### Phase 4 - 데이터 누적·백테스팅 (Phase 3과 동시 병행)
- [ ] **`scripts/backfill-history.js` 실행** (16차에 스켈레톤 작성 완료) → 97종목 × 3년 데이터 누적
- [ ] 백테스팅 모듈 + 스코어 임계값 최적화 + 수급 금액 가중치
  - **결과 UI에 "과거 성과가 미래 수익을 보장하지 않습니다" 면책 필수**
- [ ] **임계값 불확실성 면책 강화 (P4-1)**: 현재 `>=7.0 긍정 / 4.0~7.0 중립 / <4.0 부정`은 백테스팅 검증 전 임시값. Phase 4 완료 전까지 스코어 카드 상단에 "이 임계값은 실증 검증 전이에요. 참고용으로만 봐주세요." 경고 배너 고정 노출 필요.
- [ ] **섹터별 스코어링 가중치 구현 (P4-2)**: 카테고리 파라미터 추가. 바이오는 밸류에이션 가중치 ↓ + 수급·추세 가중치 ↑. 금융은 PBR 가중치 ↑. 도메인 한계(`SKILL_KOREAN_STOCK_APP.md` 5장) 해소. 우선순위: 바이오·금융 먼저 1차 구현.

### Phase 5 - 소셜 로그인 + 프리미엄 구독 (사용자 50명 달성 후)
사용자 검증 후 수익화 + 보안 강화.

**device_id → user_id 마이그레이션 전략 (P5-1)**:
> **확정안: B안 (병합)** — 첫 로그인 시 현재 device_id를 user_id에 연결해 기존 데이터 보존. UX 단절 없음.
> A안(재입력)·C안(선택적 로그인)은 채택하지 않음. 이전 문서에서 "B안 강제 재등록"으로 표기된 부분은 의미가 모호해 정리: "B안 = device→user 병합 + 프리미엄 구독자에게만 HMAC 강제".

**JWT 저장소 (P5-2)**:
> 초기에는 **localStorage + 짧은 만료(1시간)**로 시작. httpOnly cookie는 Capacitor 처리가 복잡해 Phase 5 이후로 미룸. 주기적 refresh 토큰으로 XSS 윈도우 최소화.
> - Access token: 1시간 만료, localStorage
> - Refresh token: 14일 만료, localStorage (탈취 시 1시간 이내 access 만료 + 사용자가 재로그인으로 refresh 무효화 가능)
> - 서버: `/api/auth/refresh` 엔드포인트 + `users.refresh_token_hash` 컬럼 (회전 시 교체) → 탈취된 refresh 재사용 시 모든 세션 무효화.

**legacy_device_id 재사용 방지 (P5-3)**:
> B안 병합 시 기기 1의 `legacy_device_id`가 탈취/재생성되어 타 user에 연결되면 기기 1 데이터 노출 위험. 병합은 **최초 로그인 시 1회만** 수행 + `users.legacy_device_id`는 UNIQUE 제약 + 이후 같은 device_id로 다른 user가 로그인해도 무시. Phase 5에서 HMAC 서명(device_id + secret)까지 추가.

- [ ] **users 테이블** (PostgreSQL):
  ```sql
  CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    provider        TEXT NOT NULL,           -- 'kakao' | 'google'
    provider_id     TEXT NOT NULL,           -- OAuth 고유 ID
    email           TEXT,
    nickname        TEXT,
    legacy_device_id TEXT,                   -- B안 병합용: 첫 로그인 시 기록
    tier            TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'premium'
    expires_at      TIMESTAMPTZ,
    payment_key     TEXT,                    -- Toss Payments billing key
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_id)
  );
  ```
- [ ] **카카오 OAuth 콜백 라우터** (`/api/auth/kakao`) — 첫 로그인 시 현재 `X-Device-Id`를 `legacy_device_id`로 기록 후 holdings/watchlist/alerts의 `device_id` 컬럼을 user_id로 일괄 업데이트 (B안 병합)
- [ ] **JWT 발급/검증 미들웨어** (`requireAuth`) — `Authorization: Bearer <jwt>` 헤더. 만료 1시간, refresh 토큰 별도
- [ ] **프론트 X-Device-Id → Authorization: Bearer 전환**
- [ ] **구글 OAuth 추가** (+1~2일)
- [ ] `requirePremium` 미들웨어 (`users.tier === 'premium' AND expires_at > NOW()`)
- [ ] **Claude Haiku AI 분석 리포트**: `POST /api/stock/:code/ai-report` (프리미엄 전용). 종목 데이터를 컨텍스트로 LLM이 자연어 분석 생성.
  > **비용 제한 필수 (P5-2 보완)**: Haiku ~6원/회 × 97종목 × 매일 × 30일 = 월 17,460원으로 구독료 3,900원을 초과. 다음 중 하나 필수:
  > ① 월 호출 제한 (예: 사용자당 월 10회) — 가장 직관적
  > ② 종목별 일 1회 캐시 (97종목 공용 캐시 → 월 ~580원) — 가장 저렴
  > ③ 구독료 인상 (월 9,900원)
  > 기본값은 ②캐시 + ①월 10회 개인별 재생성 하이브리드 권장.
- [ ] **Toss Payments 구독 연동** (월 3,900원 기준, AI 비용 모델에 따라 조정). 결제 콜백 → users.tier 갱신
- [ ] **사이드바 "Premium Plan" 카드 복원** (15차에서 제거됨) — 실제 구독 기능 도입 시

### 장기 (사용자 검증 후)
- KIS/KRX API 전환 (Puppeteer는 Phase 2에서 이미 제거된 상태)
- Next.js 전환 검토

---

## 문서 참조
| 파일 | 내용 |
|------|------|
| `docs/BACKEND.md` | DB 스키마, API 엔드포인트, 알고리즘 상세, 스케줄링 |
| `docs/FRONTEND.md` | 스토어 인터페이스, 페이지/컴포넌트 명세, API 함수, 타입 정의 |
| `docs/FRONTEND_UX.md` | 온보딩, 면책 고지, 데이터 표시 원칙, 디자인 시스템, 뱃지 스타일 |
| `docs/AI.md` | AI 기여 내역, 기술 부채 테이블 |
| `docs/SKILL_KOREAN_STOCK_APP.md` | 주식 지표 해석, 섹터별 특성, 면책 표현 가이드 |
