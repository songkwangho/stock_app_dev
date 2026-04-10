# Stock Analyzer - Claude Code 개발 가이드

## 프로젝트 개요
한국 주식 분석 및 포트폴리오 관리 애플리케이션. Capacitor 기반 iOS/Android 앱으로 배포 예정.
공식 데이터 API + 보조 스크래핑을 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
로그인 없이 기기별 익명 식별자(device_id)로 개인 데이터를 분리하여 관리한다.

> **배포 전략**: React(Vite) → Capacitor 래핑 → App Store/Play Store
> Recharts, Tailwind CSS 등 웹 기반 스택을 그대로 유지하면서 네이티브 앱 배포가 가능하다.

---

## 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + Recharts v3.7 + Zustand v5
- **모바일 래핑**: Capacitor (iOS/Android 배포 시)
- **백엔드**: Node.js + Express + SQLite3 (better-sqlite3) + express-rate-limit → PostgreSQL 전환 예정
- **데이터 소스 (우선순위)**:
  1. 공식 API: 한국투자증권 Open API(KIS), KRX 정보데이터시스템 (핵심 가격/재무 데이터)
  2. 보조 스크래핑: 네이버 증권 (뉴스, 재무제표 세부 등 공식 API 미제공 항목만)
  3. 캡처: 토스증권 Puppeteer (차트 이미지, 추후 자체 차트로 대체 예정)

---

## 프로젝트 구조
```
stock_app_dev/
├── server/
│   ├── server.js             # Express 라우트 28개 + recalcWeights (~900줄)
│   ├── index.js              # 진입점 래퍼
│   ├── db/
│   │   ├── connection.js     # DB 연결 (better-sqlite3)
│   │   ├── schema.js         # 8개 테이블 CREATE + 인덱스
│   │   └── migrate.js        # 11개 마이그레이션 블록
│   ├── helpers/
│   │   ├── cache.js          # getCached/setCache/invalidateCache
│   │   └── deviceId.js       # getDeviceId/requireDeviceId
│   ├── scrapers/
│   │   ├── naver.js          # 네이버 증권 스크래핑 (EUC-KR 단일화)
│   │   └── toss.js           # 토스증권 Puppeteer 차트 캡처
│   ├── domains/
│   │   ├── analysis/
│   │   │   ├── scoring.js    # 5개 스코어링 함수 + calculateHoldingOpinion + median
│   │   │   └── indicators.js # calculateIndicators (RSI/MACD/볼린저)
│   │   ├── alert/
│   │   │   └── service.js    # generateAlerts + ALERT_COOLDOWNS
│   │   └── stock/
│   │       ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │       └── data.js       # topStocks (97개) + initialRecommendations (20개)
│   └── scheduler.js          # setupScheduler + setupCleanup
├── stocks.db                 # SQLite 데이터베이스 (개발 환경)
├── public/charts/            # 토스증권 차트 캡처 이미지
├── src/
│   ├── App.tsx               # 메인 레이아웃 + 반응형 네비게이션
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── storage/
│   │   └── deviceId.ts       # DeviceIdStorage 인터페이스 + Web 구현체
│   ├── stores/
│   │   ├── useNavigationStore.ts  # activeTab, selectedStock (UI 상태)
│   │   ├── usePortfolioStore.ts   # holdings, isLoading, error (포트폴리오)
│   │   ├── useAlertStore.ts       # alerts, unreadCount
│   │   ├── useToastStore.ts       # toasts (글로벌 토스트 알림)
│   │   └── useStockStore.ts       # 레거시 re-export (3개 스토어 호환)
│   ├── types/stock.ts        # TypeScript 인터페이스 (MarketOpinion/HoldingOpinion)
│   ├── pages/                # 페이지 컴포넌트 (7개, lazy loading)
│   └── components/           # 공용 컴포넌트 (6개, ScoringBreakdownPanel 포함)
├── docs/
│   ├── AI.md                 # AI 활용 내역
│   ├── BACKEND.md            # 백엔드 상세 문서
│   └── FRONTEND.md           # 프론트엔드 상세 문서
└── package.json
```

---

## 개발 명령어
```bash
npm run dev              # Vite 프론트엔드 dev server (포트 5173)
node server/server.js    # Express 백엔드 (포트 3001)
npm run build            # TypeScript 체크 + 프로덕션 빌드
npm run lint             # ESLint 검사
npx cap sync             # Capacitor 앱 동기화 (앱 빌드 시)
```

---

## 핵심 규칙

### 코드 작성 원칙
- 한국어 UI 텍스트, 영어 코드/변수명
- Tailwind CSS 다크 테마 (slate 계열 배경, blue 액센트)
- 모든 페이지는 lazy loading (React.lazy + Suspense)
- API 통신은 `stockApi.ts`를 통해서만 수행
- 상태관리는 도메인별 Zustand 스토어를 통해서만 수행
  - UI 네비게이션: `useNavigationStore`
  - 포트폴리오: `usePortfolioStore`
  - 알림: `useAlertStore`
- **반응형 레이아웃**: PC 사이드바(`hidden md:flex`) + 모바일 하단 탭바(`fixed bottom-0 md:hidden`)
- **초보자 UX 원칙**:
  - PER/PBR/ROE 등 재무지표에 항상 한국어 컨텍스트 설명 병기
  - `ScoringBreakdownPanel`로 10점 스코어를 게이지 바 + 한국어 해석으로 시각화
  - 차트는 기본 라인 차트, 토글로 캔들 차트 전환 가능
  - 알림 메시지에 아이콘 + 우선순위 강조, 수익률에 상황별 격려 메시지
  - `holding_opinion` 뱃지에 이유(평단가 대비 %, 이평선 상태) 표시
  - 추천 카드에 `source` 뱃지 + 신뢰도 설명 + fairPrice 출처 라벨

### 사용자 식별 (device_id 방식)
- 로그인 없음. 기기 기반 익명 식별자로 개인 데이터 분리
- **프론트**: `DeviceIdStorage` 인터페이스 (Web: `localStorage`, Capacitor: 주석 준비)
- **백엔드**: `getDeviceId(req)` 헬퍼. device_id 없는 요청은 400 반환
- **보안**: CORS 화이트리스트 + Rate limiting 120req/min per device_id

### 백엔드 원칙
- 도메인별 파일 분리 완료 (`db/`, `helpers/`, `scrapers/`, `domains/`, `scheduler.js`)
- `server.js`에는 라우트 핸들러만 잔존 (~900줄)
- better-sqlite3 동기 API. 캐시 TTL 10분, 배치 처리 5개씩
- 알림 쿨다운: `sell_signal` 48h / `sma5_break`·`sma5_touch`·`undervalued` 24h / `target_near` 12h

### Opinion 분리 원칙
- `stock_analysis.opinion` 컬럼은 `market_opinion` 전용 (비보유 기준, 공용)
- 보유 종목 API(`GET/POST/PUT /api/holdings`)는 `holding_opinion`을 런타임 계산하여 반환
- 프론트에서 두 opinion을 혼용하지 않도록 타입으로 강제:
  ```typescript
  type MarketOpinion  = '긍정적' | '중립적' | '부정적';
  type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';
  ```

---

## 분석 알고리즘 요약 (10점 만점 통합 스코어링)

### 보유 종목 (HoldingOpinion - 런타임 계산)
`calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)`:
1. 손절: 현재가 ≤ 평단가 × 0.93 (-7%) → **매도** (SMA 불필요)
2. SMA5 데이터 없음 → **보유** (판단 불가)
3. 이중 이탈: 가격 < SMA5 AND 가격 < SMA20 → **매도**
4. 단기 이탈 + 중기 지지: 가격 < SMA5 AND 가격 ≥ SMA20 → **관망**
5. SMA20 없으면: 가격 < SMA5 → **관망**, SMA5 근접 → **추가매수**, 그 외 → **보유**
6. 5일선 근접(100~101%) → **추가매수**
7. 정배열 유지 → **보유**

### 비보유 종목 (MarketOpinion - DB 저장)
밸류에이션(0~3) + 기술지표(0~3) + 수급(0~2) + 추세(0~2) = **10점 만점**
- 7점 이상: 긍정적 / 4점 이상: 중립적 / 4점 미만: 부정적

**밸류에이션**: PER/PBR 섹터 중앙값 비교 + PEG. 적자 기업 0점+플래그. PEG 무효 시 재정규화.
**기술지표**: RSI(14, 30~50 보정) + MACD + 볼린저밴드(%B/80) + 거래량. 가중합산 × 3.
**수급**: 외국인/기관 10일 가중 감쇠(decay=0.8). 최대 1.2+0.8=2.0.
**추세**: SMA5/SMA20 배열 상태 (0~2점).

---

## DB 테이블 (8개)
| 테이블 | PK | device_id | 용도 |
|--------|-----|-----------|------|
| stocks | code | - | 종목 기본정보 + 재무지표 + EPS |
| holding_stocks | device_id+code | O | 포트폴리오 보유종목 |
| stock_history | code+date | - | 일일 OHLCV 히스토리 |
| stock_analysis | code | - | market_opinion + 분석 텍스트 |
| recommended_stocks | code | - | 추천 종목 + source 구분 |
| investor_history | code+date | - | 투자자 매매 히스토리 |
| alerts | id | O | 알림 |
| watchlist | device_id+code | O | 관심종목 |

---

## API 엔드포인트 (28개)
- 종목: GET/POST/DELETE `/api/stocks`, GET `/api/stock/:code`, POST `/api/stock/:code/refresh`
- 포트폴리오: GET/POST `/api/holdings`, PUT/DELETE `/api/holdings/:code`, GET `/api/holdings/history`
- 추천: GET `/api/recommendations`
- 분석: GET `/api/stock/:code/indicators`, `/volatility`, `/financials`, `/news`, `/chart/:timeframe`
- 스크리너: GET `/api/screener`
- 섹터: GET `/api/sector/:category/compare` (medians 포함)
- 알림: GET/DELETE `/api/alerts`, GET `/api/alerts/unread-count`, POST `/api/alerts/read`
- 관심종목: GET/POST/DELETE `/api/watchlist`
- 기타: GET `/api/market/indices`, GET `/api/search`, GET `/api/health`

---

## 로드맵

### Phase 1 - 구조 안정화 ✅
- [x] Opinion 분리, DeviceIdStorage, Zustand 3개 스토어, 알림 쿨다운, PER/PEG 엣지케이스, CORS+Rate limit

### Phase 2 - 인프라 전환 ✅ (진행 중)
- [x] 백엔드 도메인 분리: `db/`, `scrapers/`, `helpers/`, `domains/`, `scheduler.js`
- [x] `getStockData` + `syncAllStocks` → `domains/stock/service.js` 추출
- [x] PUT /api/holdings/:code 부분 업데이트 엔드포인트
- [x] 수급 스코어 가중 감쇠 알고리즘
- [ ] HTTPS + device_id HMAC 서명
- [ ] SQLite → PostgreSQL 전환
- [ ] 공식 데이터 API 이관 (KIS Open API / KRX)

### Phase 3 - 앱 배포
- [ ] Capacitor 설정 + 오프라인 캐시 + Push Notification + 스토어 배포

### Phase 4 - 품질 향상
- [ ] 백테스팅 모듈 + 스코어 임계값 최적화 + 수급 금액 가중치

---

## 영역별 문서 참조
- 백엔드 작업 시: `docs/BACKEND.md` 참조
- 프론트엔드 작업 시: `docs/FRONTEND.md` 참조
- AI 활용 내역: `docs/AI.md` 참조
