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
│   ├── server.js             # 컴포지션 루트 (~80줄, 5개 도메인 라우터 마운트)
│   ├── index.js              # 진입점 래퍼
│   ├── db/
│   │   ├── connection.js     # DB 연결
│   │   ├── schema.js         # 8개 테이블 + 인덱스
│   │   └── migrate.js        # 11개 마이그레이션
│   ├── helpers/
│   │   ├── cache.js          # getCached/setCache/invalidateCache
│   │   └── deviceId.js       # getDeviceId/requireDeviceId
│   ├── scrapers/
│   │   ├── naver.js          # 네이버 증권 스크래핑 (EUC-KR)
│   │   └── toss.js           # 토스증권 Puppeteer 캡처
│   ├── domains/
│   │   ├── analysis/
│   │   │   ├── scoring.js    # 스코어링 함수 + calculateHoldingOpinion + median
│   │   │   ├── indicators.js # calculateIndicators (RSI/MACD/볼린저)
│   │   │   └── router.js     # 분석 라우터 (7 endpoints)
│   │   ├── alert/
│   │   │   ├── service.js    # generateAlerts + ALERT_COOLDOWNS
│   │   │   └── router.js     # 알림 라우터 (4 endpoints)
│   │   ├── portfolio/
│   │   │   ├── service.js    # recalcWeights
│   │   │   └── router.js     # 포트폴리오 라우터 (5 endpoints, computeSMA helper)
│   │   ├── watchlist/
│   │   │   └── router.js     # 관심종목 라우터 (3 endpoints)
│   │   └── stock/
│   │       ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │       ├── data.js       # topStocks (97개) + initialRecommendations (20개)
│   │       └── router.js     # 종목 라우터 (9 endpoints)
│   └── scheduler.js          # setupScheduler + setupCleanup
├── src/
│   ├── App.tsx               # 반응형 레이아웃 + 투자 면책 모달
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── storage/deviceId.ts   # DeviceIdStorage 인터페이스 + Web 구현체
│   ├── stores/
│   │   ├── useNavigationStore.ts  # activeTab, selectedStock
│   │   ├── usePortfolioStore.ts   # holdings, isLoading, error
│   │   ├── useAlertStore.ts       # alerts, unreadCount
│   │   ├── useWatchlistStore.ts   # items (관심종목)
│   │   └── useToastStore.ts       # toasts
│   ├── types/stock.ts        # MarketOpinion / HoldingOpinion / UpdateHoldingPayload
│   ├── pages/                # 7개 페이지 (lazy loading)
│   ├── components/           # 8개 (ScoringBreakdownPanel, WatchlistContent, HelpBottomSheet 포함)
│   └── utils/dataFreshness.ts # getDataFreshnessLabel/Short (장중·장외 자동 판단)
├── docs/
│   ├── BACKEND.md            # 백엔드 상세
│   ├── FRONTEND.md           # 프론트엔드 상세
│   └── AI.md                 # AI 활용 내역
└── package.json
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
- **초보자 UX** (구체 명세는 `docs/FRONTEND.md` 참조):
  - **온보딩**: 면책 모달(거래 미지원 명시) → "내 주식 추가" 안내(건너뛰기/직접 추가). "직접 추가" 시 `pendingFocus`로 HoldingsAnalysisPage 검색 폼 자동 노출. 대시보드 빈 포트폴리오는 재방문 시에만 CTA 카드 노출.
  - **Empty State**: 포트폴리오(📊), 관심종목(👀), 알림(🔔) 각각 전용 UI.
  - **데이터 표시**: 재무지표는 업종 **중앙값** 기준, 스코어 해석은 만점대비 비율(80/60/25%). 데이터 갱신 라벨 "N분 전 (HH:MM, 장중/전일 종가)" KST 고정. 검색 드롭다운에 market_opinion 뱃지.
  - **종목 상세**: Phase1(가격+지표) await → Phase2(뉴스+재무+섹터) 지연 + 스켈레톤. PER/PBR/ROE/RSI/MACD/볼린저/투자자 매매동향에 [?] 버튼 → HelpBottomSheet 8개 용어 설명. 차트 라인/캔들 토글.
  - **포트폴리오 의견**: holding_opinion 구체적 이유 + "상세 보기 →" 링크. SMA5 부족 시 "분석 중" 뱃지 (`sma_available` 기반). 매도/추가매수 뱃지 하단에 "거래는 증권사 앱에서 직접 진행해 주세요" 안내. 수익률 6구간 메시지 + 극단 구간(≥20%, ≤-7%)에 "종목 보기 →" 링크.
  - **수익률 카드**: subtitle에 `₩원금 → ₩평가액 (가중 평균)` 절대 금액 병기.
  - **추천**: source 뱃지(전문가/알고리즘) + 탭/클릭 accordion (reason + 신뢰도 설명). 추천 카드 하단 "투자는 증권사 앱에서 직접 진행해 주세요" 안내.
  - **스코어 패널**: 게이지 바 + value/max 점수 텍스트 병기 (색각이상 대응) + "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요" 면책.
  - **알림**: 패널은 헤더 드롭다운(모바일 탭바도 동일 패널 토글). 각 항목에 `[지금 확인하기]`(종목 상세 이동) / `[나중에 볼게요]`(패널 닫기) 두 버튼. 휴지통은 stopPropagation.
  - **스크리너 프리셋**: 조건 요약(`PER < 15 + ROE > 10%`) 표시.
  - **모바일 진입점**: 대시보드/추천 페이지 하단에 "전체 종목 보기"(MajorStocksPage 진입).
  - **알려진 제약**: dataFreshness 공휴일 별도 처리 안 함 (광복절 등 평일 휴장일 "장중 데이터" 오표시 가능).

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

---

## 분석 알고리즘

### HoldingOpinion (런타임, `calculateHoldingOpinion`)
1. 손절(-7%) → 매도 (SMA 불필요)
2. SMA5 null → 보유 (판단 불가)
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
- 합산 ≥7 긍정적, ≥4 중립적, <4 부정적

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

## API (28개, 5개 도메인 라우터에 분리)
- **stock** (9): `/api/stock/:code`, `/api/stock/:code/refresh`, `/api/stocks` (GET/POST/DELETE), `/api/search`, `/api/recommendations`, `/api/market/indices`, `/api/health`
- **portfolio** (5): `/api/holdings` (GET/POST), `/api/holdings/:code` (PUT/DELETE), `/api/holdings/history`
- **analysis** (7): `/api/stock/:code/{indicators,volatility,financials,news,chart/:tf}`, `/api/screener`, `/api/sector/:cat/compare`
- **alert** (4): `/api/alerts` (GET/DELETE), `/api/alerts/unread-count`, `/api/alerts/read`
- **watchlist** (3): `/api/watchlist` (GET/POST/DELETE)

> **마운트 순서 주의**: server.js는 `analysisRouter`를 `stockRouter`보다 먼저 마운트해야 한다 — `/api/stock/:code/indicators` 같은 specific path가 `/api/stock/:code` generic 핸들러에 가로채이지 않도록.

---

## 로드맵

### Phase 1 - 구조 안정화 ✅
Opinion 분리, DeviceIdStorage, Zustand 3개 스토어, 알림 쿨다운, PER/PEG 엣지케이스, CORS+Rate limit

### Phase 2 - 인프라 전환 (진행 중, 우선순위 순)
- [x] 백엔드 도메인 분리, PUT /api/holdings, 수급 감쇠, 면책 고지, 온보딩, WatchlistContent/Store, sma_available, 검색 인덱스 검증
- [x] **라우트 분리 완료** (9차): server.js → domains/*/router.js (알림→관심종목→포트폴리오→분석→종목 순)
  - 각 라우터는 `import db from '../../db/connection.js'`로 DB 직접 import
  - server.js: 891줄 → ~80줄 (컴포지션 루트, 라우트 정의 없음)
  - 마운트 순서 주의: `analysisRouter`를 `stockRouter`보다 먼저 마운트 (specific path가 generic path를 가로채지 않도록)
1. [ ] **HMAC 서명** + 마이그레이션 전략 (실사용자 0~수 명 → B안 강제 재등록 권장) — **다음 우선순위**
   - **HMAC 폴백 모드 설계 (사전 작업)**: 서버 미연결 시 허용/차단 기능 목록을 명확히 분리.
     - 읽기 가능: 캐시된 holdings 표시, 추천 캐시, 종목 상세 캐시, 알림 로컬 표시
     - 차단: 신규 종목 추가/수정/삭제, 관심종목 변경, 알림 읽음 처리, 포트폴리오 동기화
   - 서버 다운 시 로컬 UUID만으로 읽기 전용 모드 동작
2. [ ] **PostgreSQL 전환 사전 작업**: `syncAllStocks()` 비동기 재작성 범위 사전 산정
   - 현재 better-sqlite3는 동기식이므로 `for...of` 직렬 처리 가능. PostgreSQL 전환 시 `pg`(비동기) 기반으로 재작성 필요
   - 영향 범위: `getStockData()`, `recalcWeights()`, 포트폴리오/관심종목 컨텍스트의 모든 트랜잭션 호출부
3. [ ] SQLite → PostgreSQL 전환 (HMAC + sync 재작성 완료 후 착수)
4. [ ] KIS/KRX 평가 (별도 조사 태스크, 우선순위: 시나리오 B 먼저 PoC)
   - 시나리오 B (우선): KRX 전일 데이터 + 실시간은 네이버 유지 — 가장 안정적, 라이선스 명확
   - 시나리오 A: KIS 전환 + 네이버 보조 유지
   - 시나리오 C: 두 API 동시 도입 (KIS 실시간 + KRX 마스터)
- **검색 API 인덱스**: stocks/stock_analysis 모두 PK(자동 인덱스), 97종목 규모 풀스캔 무시 가능. 1000+ 시 FTS 검토

### Phase 3 - 앱 배포 (P2-2 HMAC 완료 후 착수)
- [ ] Capacitor 설정 + `@capacitor/preferences`로 device_id 저장 교체 (HMAC 서명 적용된 device_id)
- [ ] `@capacitor/network` + `usePortfolioStore` 오프라인 폴백 흐름 설계 (캐시 로드 → 오프라인 배너, 에러 미설정)
- [ ] Push 파이프라인 (PostgreSQL 전환 이후 착수, 비동기 전환 후 구현)
  - **Push 빈도 제어 정책**: 동일 종목당 하루 최대 N건(N=2 권장), 우선순위 high(sell_signal/target_near) 최우선, low는 야간 묶음 배송
- [ ] **프로덕션 빌드 크기 확인**: `npm run build` → 번들 분석 (rollup-plugin-visualizer), 초기 진입 청크 < 250KB gzip 목표
- [ ] 실제 디바이스(iOS/Android) 성능 테스트 — 기준: **시작 3초 / Phase1 2초 / 탭 300ms**
- [ ] **앱스토어 심사 사전 조사**: 유사 국내 앱(증권사 정보 앱) 심사 통과 사례 조사 → 앱 분류 전략(Finance vs. News/Reference) 결정
- [ ] 앱스토어 심사: "매도 신호"/"추가매수" → 중립적 표현 대안 미리 확정 + 법률 검토
- [ ] App Store / Play Store 배포

### Phase 4 - 품질 향상
- **선행 조건** (Phase 2 완료 여부와 무관하게 즉시 착수):
  - [x] stock_history 무기한 보관 + 임계값 주석 (적용 완료)
  - [ ] **장기 데이터 적재 스크립트 (즉시 작성·실행 시작)**: 97종목 × 3년 ≈ 72,750건, 종목당 1초 딜레이, 하루 20~30종목 분할 실행, 실패 시 재시도 로직. Phase 4 백테스팅에 반드시 필요한 데이터이므로 다른 작업과 병렬로 진행
- [ ] 백테스팅 모듈 + 스코어 임계값 최적화 + 수급 금액 가중치

---

## 문서 참조
- 백엔드: `docs/BACKEND.md` / 프론트엔드: `docs/FRONTEND.md` / AI: `docs/AI.md`
