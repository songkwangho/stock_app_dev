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
│   ├── server.js             # Express 라우트 28개 (~880줄)
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
│   │   │   └── indicators.js # calculateIndicators (RSI/MACD/볼린저)
│   │   ├── alert/
│   │   │   └── service.js    # generateAlerts + ALERT_COOLDOWNS
│   │   ├── portfolio/
│   │   │   └── service.js    # recalcWeights
│   │   └── stock/
│   │       ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │       └── data.js       # topStocks (97개) + initialRecommendations (20개)
│   └── scheduler.js          # setupScheduler + setupCleanup
├── src/
│   ├── App.tsx               # 반응형 레이아웃 + 투자 면책 모달
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── storage/deviceId.ts   # DeviceIdStorage 인터페이스 + Web 구현체
│   ├── stores/
│   │   ├── useNavigationStore.ts  # activeTab, selectedStock
│   │   ├── usePortfolioStore.ts   # holdings, isLoading, error
│   │   ├── useAlertStore.ts       # alerts, unreadCount
│   │   └── useToastStore.ts       # toasts
│   ├── types/stock.ts        # MarketOpinion / HoldingOpinion 타입
│   ├── pages/                # 7개 페이지 (lazy loading)
│   └── components/           # 6개 (ScoringBreakdownPanel 포함)
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
  - 관심종목·스크리너·주요종목은 PC 사이드바에만 노출
- **초보자 UX**:
  - 재무지표 업종 **중앙값** 기준 비교 (스코어링과 동일 기준)
  - 스코어 게이지 시각화 (영역별 점수 기반 한국어 해석)
  - 차트 라인/캔들 토글, 알림 아이콘+우선순위, 데이터 갱신 시각("N분 전")
  - holding_opinion 구체적 이유 (손절%/이평선 상태)
  - 수익률 6구간 메시지 (목표수익달성~손절도달)
  - 추천 source 신뢰도 설명 + fairPrice 출처
  - 투자 면책 고지 3곳 (첫 실행 모달 / 추천 페이지 상단 / 종목 상세 하단)

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

## API (28개)
종목(6), 포트폴리오(5: GET/POST/PUT/DELETE + history), 추천(1), 분석(6: indicators/volatility/financials/news/chart/screener), 섹터(1: compare+medians), 알림(4), 관심종목(3), 기타(2: indices/health)

---

## 로드맵

### Phase 1 - 구조 안정화 ✅
Opinion 분리, DeviceIdStorage, Zustand 3개 스토어, 알림 쿨다운, PER/PEG 엣지케이스, CORS+Rate limit

### Phase 2 - 인프라 전환 (진행 중, 우선순위 순)
- [x] 백엔드 도메인 분리 (db/, scrapers/, helpers/, domains/, scheduler)
- [x] getStockData+syncAllStocks → domains/stock/service.js
- [x] recalcWeights → domains/portfolio/service.js
- [x] PUT /api/holdings/:code, 수급 가중 감쇠, 투자 면책 고지
1. [ ] server.js 라우트 → domains/*/router.js 분리 — 완료 후 다음 단계로
2. [ ] device_id HMAC 서명 + 기존 device_id 마이그레이션 전략 수립
3. [ ] SQLite → PostgreSQL 전환 — 라우트 분리 완료 후 착수
4. [ ] KIS/KRX 공식 API 이관 — KIS(이용약관 검토) / KRX(전일 데이터 허용 여부) 분리 평가

### Phase 3 - 앱 배포
- [ ] Capacitor 설정 + `@capacitor/preferences`로 device_id 저장 교체
- [ ] Push + 배치 알림 단일 파이프라인 설계 (이중 발송 방지)
- [ ] 오프라인 모드 배너 + 타임스탬프 UI 필수 구현
- [ ] 앱스토어 심사 문서: 투자 면책 조항 전략 수립
- [ ] App Store / Play Store 배포

### Phase 4 - 품질 향상
- **선행 조건** (즉시):
  - [x] stock_history 무기한 보관 정책 확인 (cleanupOldData는 stock_history 미삭제 — 이미 적용됨)
  - [ ] 장기 데이터 초기 적재 스크립트 준비 (백테스팅용 과거 OHLCV 대량 수집)
- [ ] 백테스팅 모듈: stock_history 기반 과거 시점 스코어 재계산 → 실제 수익률 비교
- [ ] 스코어 임계값(7점/4점) 데이터 기반 최적화
- [ ] 수급 스코어에 순매수 금액 가중치 추가

---

## 문서 참조
- 백엔드: `docs/BACKEND.md` / 프론트엔드: `docs/FRONTEND.md` / AI: `docs/AI.md`
