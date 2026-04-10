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
- **초보자 UX**:
  - 온보딩 2단계: 면책 모달 → "내 주식 추가" 안내 (건너뛰기/직접 추가)
  - 대시보드: 빈 포트폴리오 시 CTA 카드 ("종목 추가하기/추천 종목 둘러보기")
  - Empty State: 포트폴리오(📊), 관심종목(👀), 알림(🔔) 각각 전용 UI
  - 재무지표 업종 **중앙값** 기준, 스코어 해석 만점대비 비율(80%/60%/25%) 기반
  - 차트 라인/캔들 토글, 알림 아이콘+우선순위
  - 데이터 갱신: "N분 전 (HH:MM, 장중 데이터/전일 종가)" 장중/장외 구분
  - holding_opinion 구체적 이유 + 행동유도 "상세 보기 →" 링크
  - 수익률 6구간 + 극단 구간(≥20%, ≤-7%)에 "종목 분석 →" 링크
  - 추천 source: 탭/클릭 accordion 인라인 설명. 면책 문구 안내형
  - 상세뷰: Phase1(가격+지표) → Phase2(뉴스+재무+섹터 지연, 스켈레톤)
  - HelpBottomSheet: PER/PBR/ROE/RSI/MACD/볼린저밴드/투자자 매매동향에 [?] 버튼 → 8개 용어 설명
  - 검색 결과 드롭다운에 market_opinion 뱃지, 대시보드+추천 페이지에 "전체 종목 보기" 진입점
  - 스크리너 프리셋에 조건 요약(`PER < 15 + ROE > 10%`) 표시
  - 대시보드 수익률에 "투자금액 기준 가중 평균" subtitle
  - 알림 항목 탭 시 종목 상세로 이동 (삭제 버튼은 stopPropagation)
  - SMA5 데이터 부족 시 holding_opinion 대신 "분석 중" 뱃지 (`sma_available` 필드 기반)
  - 추천 source accordion에 reason(추천 사유) 함께 표시
  - dataFreshness KST 고정 (사용자 시간대 무관). 알려진 제약: 공휴일은 별도 처리 안 함
  - 온보딩에서 "직접 추가할게요" → HoldingsAnalysisPage 진입 시 검색 폼 자동 노출 (`pendingFocus`)

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
- [x] 백엔드 도메인 분리, PUT /api/holdings, 수급 감쇠, 면책 고지, 온보딩, WatchlistContent/Store, sma_available, 검색 인덱스 검증
1. [ ] 라우트 분리: server.js → domains/*/router.js (순서: 알림→관심종목→포트폴리오→분석→종목)
   - db 인스턴스: 각 router.js가 `import db from '../db/connection.js'`로 직접 import
   - 28개 엔드포인트 검증 체크리스트 작성 (각 라우터 분리 후 수동 검증 + Claude Code smoke test 스크립트)
2. [ ] HMAC 서명 + 마이그레이션 전략 (실사용자 0~수 명 → B안 강제 재등록 권장)
   - 서버 미연결 폴백: 서버 다운 시 로컬 UUID만으로 읽기 전용 모드 동작
3. [ ] SQLite → PostgreSQL 전환 (라우트 분리 완료 후 착수)
4. [ ] KIS/KRX 평가 (별도 조사 태스크, 우선순위: 시나리오 B 먼저 PoC)
   - 시나리오 B (우선): KRX 전일 데이터 + 실시간은 네이버 유지 — 가장 안정적, 라이선스 명확
   - 시나리오 A: KIS 전환 + 네이버 보조 유지
   - 시나리오 C: 두 API 동시 도입 (KIS 실시간 + KRX 마스터)
- **검색 API 인덱스**: stocks/stock_analysis 모두 PK(자동 인덱스), 97종목 규모 풀스캔 무시 가능. 1000+ 시 FTS 검토

### Phase 3 - 앱 배포 (P2-2 HMAC 완료 후 착수)
- [ ] Capacitor 설정 + `@capacitor/preferences`로 device_id 저장 교체 (HMAC 서명 적용된 device_id)
- [ ] `@capacitor/network` + `usePortfolioStore` 오프라인 폴백 흐름 설계 (캐시 로드 → 오프라인 배너, 에러 미설정)
- [ ] Push 파이프라인 (PostgreSQL 전환 이후 착수, 비동기 전환 후 구현)
- [ ] 실제 디바이스(iOS/Android) 성능 테스트 — 기준: **시작 3초 / Phase1 2초 / 탭 300ms**
- [ ] 앱스토어 심사: "매도 신호"/"추가매수" → 중립적 표현 대안 미리 확정 + 법률 검토
- [ ] App Store / Play Store 배포

### Phase 4 - 품질 향상
- **선행 조건** (Phase 2 완료 시점에 작성·실행, Phase 3 전):
  - [x] stock_history 무기한 보관 + 임계값 주석 (적용 완료)
  - [ ] 장기 데이터 적재 스크립트: 97종목 × 3년 ≈ 72,750건, 종목당 1초 딜레이, 하루 20~30종목 분할 실행, 실패 시 재시도 로직
- [ ] 백테스팅 모듈 + 스코어 임계값 최적화 + 수급 금액 가중치

---

## 문서 참조
- 백엔드: `docs/BACKEND.md` / 프론트엔드: `docs/FRONTEND.md` / AI: `docs/AI.md`
