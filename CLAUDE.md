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
- **백엔드**: Node.js + Express + SQLite3 (better-sqlite3) + express-rate-limit → PostgreSQL 전환 예정
- **데이터 소스**: 네이버 증권 (보조 스크래핑) + 토스증권 Puppeteer (차트 캡처) → KIS/KRX 공식 API 전환 예정

---

## 프로젝트 구조
```
stock_app_dev/
├── server/
│   ├── server.js             # 컴포지션 루트 (~80줄, 6개 도메인 라우터 마운트)
│   ├── index.js              # 진입점 래퍼
│   ├── db/
│   │   ├── connection.js     # DB 연결
│   │   ├── schema.js         # 8개 테이블 + 인덱스
│   │   └── migrate.js        # 11개 마이그레이션
│   ├── helpers/
│   │   ├── cache.js          # getCached/setCache/invalidateCache
│   │   ├── deviceId.js       # getDeviceId/requireDeviceId
│   │   └── sma.js            # computeSMA(db, code) — 도메인 간 의존성 회피용 공유 유틸
│   ├── scrapers/
│   │   ├── naver.js          # 네이버 증권 스크래핑 (EUC-KR)
│   │   └── toss.js           # 토스증권 Puppeteer 캡처
│   ├── domains/
│   │   ├── analysis/
│   │   │   ├── scoring.js    # 스코어링 + calculateHoldingOpinion + median
│   │   │   ├── indicators.js # calculateIndicators (RSI/MACD/볼린저 + *_available 플래그)
│   │   │   └── router.js     # 분석 라우터 (7 endpoints)
│   │   ├── alert/
│   │   │   ├── service.js    # generateAlerts + ALERT_COOLDOWNS (메시지는 중립적 표현)
│   │   │   └── router.js     # 알림 라우터 (4 endpoints)
│   │   ├── portfolio/
│   │   │   ├── service.js    # recalcWeights
│   │   │   └── router.js     # 포트폴리오 라우터 (5 endpoints, helpers/sma.js 사용)
│   │   ├── watchlist/
│   │   │   └── router.js     # 관심종목 라우터 (3 endpoints)
│   │   ├── stock/
│   │   │   ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │   │   ├── data.js       # topStocks (97개) + initialRecommendations (20개)
│   │   │   └── router.js     # 종목 라우터 (7 endpoints)
│   │   └── system/
│   │       └── router.js     # 시스템 라우터 (health, market/indices — 2 endpoints)
│   └── scheduler.js          # setupScheduler + setupCleanup (시드 보존 가드 포함)
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
│   ├── components/           # 8개 (ScoringBreakdownPanel, WatchlistContent, HelpBottomSheet 포함)
│   └── utils/dataFreshness.ts # getDataFreshnessLabel/Short + parseServerDate (KST 고정)
├── scripts/
│   └── backfill-history.js   # 장기 데이터 적재 스크립트 (Phase 4 선행)
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
node server/server.js    # Express 백엔드 (포트 3001)
npm run build            # TypeScript 체크 + 프로덕션 빌드
```

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
| holding_stocks | device_id+code | 포트폴리오 (개인) |
| stock_history | code+date | 일일 OHLCV |
| stock_analysis | code | market_opinion + 분석 텍스트 |
| recommended_stocks | code | 추천 + source 구분 |
| investor_history | code+date | 투자자 매매 히스토리 |
| alerts | id | 알림 (개인) |
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

### Phase 2 - 백엔드 안정화 (잔여 작업)
- [x] 백엔드 도메인 분리, PUT /api/holdings, 수급 감쇠, 면책 고지, 온보딩, WatchlistContent/Store, sma_available
- [x] **라우트 분리** (9차): server.js 891줄 → 80줄 + 5개 라우터
- [x] **10차**: system 라우터 분리, cleanupOldData 시드 보존 가드, 알림 메시지 중립화
- [x] **11차**: `computeSMA` → `helpers/sma.js` 재이동, 알림 일일 빈도 가드(2건), sma5_break/touch 경계 수정, 지표 `*_available` 플래그
- [x] **12차**: StockDetailView 첫 종목 추가 시 가이드 카드 라우팅, 알림 패널 첫 진입 안내(`onboarding_alerts_explained`), 섹터 비교 백분위, 지표 가용성 폴백 UI, 빈 검색 결과 안내, 수익률 계산식 [?], KOSPI ℹ️ 툴팁
1. [ ] **PostgreSQL 전환 사전 작업** (HMAC보다 먼저): better-sqlite3 사용 패턴 전수 조사 → `syncAllStocks()` 비동기 재작성 범위 산정
2. [ ] **장기 데이터 적재 스크립트 즉시 작성**: `scripts/backfill-history.js` (Phase 4 백테스팅 사전 조건). 다른 작업과 병행. 97종목 × 3년 ≈ 72,750건, 종목당 1초 딜레이, 하루 20~30종목 분할, 체크포인트
3. [ ] KIS/KRX 평가 (시나리오 B 우선)

> **HMAC 서명은 Phase 5로 이동** (배포 후 유료 구독 도입 시점). 사용자 0~수 명 단계에서는 device_id만으로 충분하며, 구독 검증과 함께 도입하는 것이 ROI가 높음.

### Phase 3 - 빠른 웹앱 배포 (Capacitor 앞당기지 않음)
빠른 사용자 확보가 우선. 웹앱 → 2~4주 운영 → Capacitor 순.
1. [ ] **Recharts lazy import 먼저 적용** → 번들 측정 (`npm run build` + visualizer). 초기 진입 청크 < 250KB gzip 목표. Recharts vendor 청크가 117KB gzip이라 lazy 적용 필수
2. [ ] **Vercel + Render 웹앱 배포** (~7.25$/월): Vercel(프론트) + Render(백엔드 + SQLite Persistent Disk). API Base URL 환경변수화(`VITE_API_BASE_URL`)
3. [ ] 웹앱 2~4주 운영 (피드백 수집 + 핵심 흐름 검증)
4. [x] **앱스토어 카테고리**: "Utilities" 결정 (Finance 심사 리스크 회피). 심사 노트에 "정보 제공 도구, 거래 기능 없음" 강조
5. [ ] Capacitor 설정 (웹앱 검증 후 착수): `@capacitor/preferences`, `@capacitor/network` 오프라인 폴백
6. [ ] Push 파이프라인 — generateAlerts에 일 N건 가드는 이미 적용. **알림 본문에 "하루 1회 갱신 기반" 명시**
7. [ ] 실제 디바이스 성능 테스트 (시작 3초 / Phase1 2초 / 탭 300ms)

### Phase 4 - 데이터 누적·백테스팅 (Phase 3과 동시 병행)
- [ ] **`scripts/backfill-history.js` 실행** (Phase 2-2에서 작성한 스크립트) → 97종목 × 3년 데이터 누적
- [ ] 백테스팅 모듈 + 스코어 임계값 최적화 + 수급 금액 가중치
  - **결과 UI에 "과거 성과가 미래 수익을 보장하지 않습니다" 면책 필수**
- [ ] **섹터별 스코어링 가중치 구현**: 카테고리 파라미터 추가. 바이오는 밸류에이션 가중치 ↓ + 수급·추세 가중치 ↑. 금융은 PBR 가중치 ↑. 도메인 한계(`SKILL_KOREAN_STOCK_APP.md` 5장) 해소

### Phase 5 - 프리미엄 구독 (사용자 50명 달성 후)
사용자 검증 후 수익화. 이 시점에서 device_id 보안 강화도 함께 도입.
- [ ] **device_subscriptions 테이블** + `requirePremium` 미들웨어
- [ ] **Claude Haiku AI 분석 리포트**: `POST /api/stock/:code/ai-report` (프리미엄 전용). 종목 데이터를 컨텍스트로 LLM이 자연어 분석 생성
- [ ] **Toss Payments 구독 연동** (월 3,900원). 결제 콜백 → device_subscriptions 갱신
- [ ] **HMAC 서명 + 구독 검증 동시 도입**: 무료 device_id는 기존대로, 프리미엄은 HMAC 검증. B안 강제 재등록은 이 시점에 진행 + 사용자 안내 화면 ("데이터를 이전할 수 없어요. 다시 입력해 주세요" + 재입력 가이드, 이전 device_id의 holdings 카운트만 노출)

---

## 문서 참조
| 파일 | 내용 |
|------|------|
| `docs/BACKEND.md` | DB 스키마, API 엔드포인트, 알고리즘 상세, 스케줄링 |
| `docs/FRONTEND.md` | 스토어 인터페이스, 페이지/컴포넌트 명세, API 함수, 타입 정의 |
| `docs/FRONTEND_UX.md` | 온보딩, 면책 고지, 데이터 표시 원칙, 디자인 시스템, 뱃지 스타일 |
| `docs/AI.md` | AI 기여 내역, 기술 부채 테이블 |
| `docs/SKILL_KOREAN_STOCK_APP.md` | 주식 지표 해석, 섹터별 특성, 면책 표현 가이드 |
