# Stock Analyzer - Claude Code 개발 가이드

## 프로젝트 개요
한국 주식 분석 및 포트폴리오 관리 애플리케이션. Capacitor 기반 iOS/Android 앱으로 배포 예정.
공식 데이터 API + 보조 스크래핑을 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
로그인 없이 기기별 익명 식별자(device_id)로 개인 데이터를 분리하여 관리한다.

> **배포 전략**: React(Vite) → Capacitor 래핑 → App Store/Play Store
> Recharts, Tailwind CSS 등 웹 기반 스택을 그대로 유지하면서 네이티브 앱 배포가 가능하다.

---

## 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts v3.7 + Zustand v5
- **모바일 래핑**: Capacitor (iOS/Android 배포 시)
- **백엔드**: Node.js + Express + SQLite3 (better-sqlite3) → PostgreSQL 전환 예정
- **데이터 소스 (우선순위)**:
  1. 공식 API: 한국투자증권 Open API(KIS), KRX 정보데이터시스템 (핵심 가격/재무 데이터)
  2. 보조 스크래핑: 네이버 증권 (뉴스, 재무제표 세부 등 공식 API 미제공 항목만)
  3. 캡처: 토스증권 Puppeteer (차트 이미지, 추후 자체 차트로 대체 예정)

---

## 프로젝트 구조
```
stock_app_dev/
├── server/
│   ├── index.js              # Express 앱 조립 + 미들웨어 등록
│   ├── db/
│   │   ├── schema.js         # 테이블 정의 + 초기화
│   │   └── migrate.js        # 마이그레이션 (ALTER TABLE 안전 처리)
│   ├── domains/
│   │   ├── stock/            # 종목 데이터 CRUD + 스크래핑 연동
│   │   ├── portfolio/        # holdings + 수익률 계산
│   │   ├── analysis/         # 기술지표 + 스코어링 알고리즘
│   │   ├── alert/            # 알림 생성 + 관리
│   │   └── watchlist/        # 관심종목
│   ├── scrapers/
│   │   ├── naver.js          # 네이버 증권 스크래핑 (EUC-KR 처리 단일화)
│   │   └── toss.js           # 토스증권 Puppeteer 캡처
│   └── scheduler.js          # syncAllStocks + cleanupOldData 스케줄링
├── stocks.db                 # SQLite 데이터베이스 (개발 환경)
├── public/charts/            # 토스증권 차트 캡처 이미지
├── src/
│   ├── App.tsx               # 메인 레이아웃 + 네비게이션
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── storage/
│   │   └── deviceId.ts       # DeviceIdStorage 인터페이스 + 구현체 (Web/Capacitor)
│   ├── stores/
│   │   ├── useNavigationStore.ts  # activeTab, selectedStock (UI 상태)
│   │   ├── usePortfolioStore.ts   # holdings (포트폴리오 도메인)
│   │   └── useAlertStore.ts       # alerts, unreadCount
│   ├── types/stock.ts        # TypeScript 인터페이스
│   ├── pages/                # 페이지 컴포넌트 (7개, lazy loading)
│   └── components/           # 공용 컴포넌트 (5개)
├── docs/
│   ├── AI.md                 # AI 활용 내역
│   ├── BACKEND.md            # 백엔드 상세 문서
│   └── FRONTEND.md           # 프론트엔드 상세 문서
└── package.json
```

> **현재 상태**: `server/server.js` 단일 파일로 구현되어 있음.
> 위 구조는 목표 구조이며, 리팩토링을 통해 단계적으로 전환한다.

---

## 개발 명령어
```bash
npm run dev           # Vite 프론트엔드 dev server
node server/index.js  # Express 백엔드 (포트 3001)
npm run build         # TypeScript 체크 + 프로덕션 빌드
npm run lint          # ESLint 검사
npx cap sync          # Capacitor 앱 동기화 (앱 빌드 시)
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

### 사용자 식별 (device_id 방식)
- 로그인 없음. 기기 기반 익명 식별자로 개인 데이터 분리
- **프론트**: `DeviceIdStorage` 인터페이스를 통해 환경별 구현체를 교체 가능하게 추상화
  - Web: `localStorage` 기반
  - Capacitor 앱: `@capacitor/preferences` 기반 (`AsyncStorage`)
  - Axios 인터셉터로 모든 요청에 `X-Device-Id` 헤더 자동 첨부
- **백엔드**: `getDeviceId(req)` 헬퍼로 헤더에서 추출. device_id 없는 요청은 400 반환
  - 개인 데이터 테이블: `holding_stocks`, `watchlist`, `alerts`
  - 공용 데이터 테이블: `stocks`, `stock_history`, `stock_analysis`, `recommended_stocks`, `investor_history`
- **보안**: device_id에 HMAC 서명 추가 예정 (서버 시크릿 기반, 위변조 탐지)

### 백엔드 원칙
- 도메인별 파일 분리 구조 (`server/domains/`) — 단일 파일 지양
- better-sqlite3 동기 API 사용 (트랜잭션 활용). PostgreSQL 전환 시 비동기 패턴으로 교체
- 네이버 스크래핑은 보조 용도에만 사용. EUC-KR 인코딩 처리는 `scrapers/naver.js`에 단일화
- 캐시 TTL 10분, 배치 처리 5개씩
- 알림 쿨다운: 매도 48h / 추가매수 24h / 목표가 12h (단순 24h 중복 방지 대체)

### 데이터 흐름
1. 서버 시작 시 `syncAllStocks()` → 전체 종목 가격/지표 갱신
2. 매일 오전 8시 자동 동기화 스케줄 (`scheduler.js`)
3. 프론트에서 종목 상세 조회 시 캐시 우선, 만료 시 실시간 데이터 수집
4. 분석 결과는 두 가지 opinion으로 명확히 분리하여 저장/반환:
   - `market_opinion`: 비보유 기준 10점 스코어링 결과 → `stock_analysis` 테이블 저장 (공용)
   - `holding_opinion`: 평단가 기반 5단계 판단 → API 응답 시 런타임 계산 (개인화, DB 미저장)

### Opinion 분리 원칙 (중요)
- `stock_analysis.opinion` 컬럼은 `market_opinion` 전용 (비보유 기준, 공용)
- 보유 종목 조회 API(`GET /api/holdings`)는 `holding_opinion` 필드를 별도로 계산하여 반환
- 프론트에서 두 opinion을 혼용하지 않도록 타입 레벨에서 강제:
  ```typescript
  type MarketOpinion  = '긍정적' | '중립적' | '부정적';
  type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';
  ```

---

## 분석 알고리즘 요약 (10점 만점 통합 스코어링)

### 보유 종목 (HoldingOpinion - 런타임 계산)
5단계 우선순위 판단 (평단가 필요, DB 미저장):
1. 손절: 현재가 ≤ 평단가 × 0.93 (-7%) → **매도**
2. 이중 이탈: 가격 < SMA5 AND 가격 < SMA20 → **매도**
3. 단기 이탈 + 중기 지지: 가격 < SMA5 AND 가격 ≥ SMA20 → **관망**
4. 5일선 근접(100~101%): 가격 ≈ SMA5 → **추가매수**
5. 정배열 유지: 가격 > SMA5 AND SMA5 > SMA20 → **보유**

### 비보유 종목 (MarketOpinion - DB 저장)
밸류에이션(0~3) + 기술지표(0~3) + 수급(0~2) + 추세(0~2) = **10점 만점**
- 7점 이상: 긍정적 / 4점 이상: 중립적 / 4점 미만: 부정적

**밸류에이션 엣지케이스 처리 (필수)**:
- PER 음수(적자 기업): PER 스코어 0점 처리 + `per_negative: true` 플래그 반환
- PEG 분모(EPS 성장률) ≤ 0: PEG 무효 처리 → 밸류에이션 2점 만점으로 재정규화
- 섹터 내 종목 수 < 5: 섹터 중앙값 신뢰도 낮음 경고 플래그

**기술지표**: RSI(14) + MACD(12,26,9) + 볼린저밴드(20,2) + 거래량(20일 평균 대비)
**수급**: 외국인/기관 연속 순매수 일수 (향후 순매수 금액 가중치 추가 예정)
**추세**: SMA5/SMA20 배열 상태

---

## DB 테이블 (8개)
| 테이블 | PK | device_id | 용도 |
|--------|-----|-----------|------|
| stocks | code | - | 종목 기본정보 + 재무지표 + EPS (공용) |
| holding_stocks | device_id+code | O | 포트폴리오 보유종목 (개인) |
| stock_history | code+date | - | 일일 OHLCV 히스토리 (공용) |
| stock_analysis | code | - | 비보유 기준 market_opinion + 분석 텍스트 (공용) |
| recommended_stocks | code | - | 수동 추천 종목 (공용) |
| investor_history | code+date | - | 투자자(외국인/기관) 매매 히스토리 (공용) |
| alerts | id | O | 알림 (개인) |
| watchlist | device_id+code | O | 관심종목 (개인) |

> `stock_analysis.opinion`은 `MarketOpinion` 전용. 보유 종목의 `HoldingOpinion`은 런타임 계산값이므로 DB에 저장하지 않는다.

---

## API 엔드포인트 요약 (23개)
- 종목: GET/POST/DELETE `/api/stocks`, GET `/api/stock/:code`, POST `/api/stock/:code/refresh`
- 포트폴리오: GET/POST/DELETE `/api/holdings`, GET `/api/holdings/history` (device_id 필터, `holding_opinion` 포함 반환)
- 추천: GET `/api/recommendations`
- 분석: GET `/api/stock/:code/indicators`, `/volatility`, `/financials`, `/news`, `/chart/:timeframe`
- 스크리너: GET `/api/screener`
- 섹터: GET `/api/sector/:category/compare`
- 알림: GET/DELETE `/api/alerts`, GET `/api/alerts/unread-count`, POST `/api/alerts/read` (device_id 필터)
- 관심종목: GET/POST/DELETE `/api/watchlist` (device_id 필터)
- 시장: GET `/api/market/indices`
- 검색: GET `/api/search`

---

## 로드맵 (우선순위 순)

### Phase 1 - 구조 안정화 (현재 → 배포 가능 상태)
- [ ] 백엔드 도메인별 파일 분리 리팩토링 (`server/domains/`)
- [ ] Opinion 분리: `market_opinion` / `holding_opinion` 타입·컬럼·API 분리
- [ ] `DeviceIdStorage` 인터페이스 추상화 (Web/Capacitor 구현체)
- [ ] 프론트 Zustand 스토어 3개로 분리 (`useNavigationStore`, `usePortfolioStore`, `useAlertStore`)
- [ ] 알림 쿨다운 type별 차별화 (48h/24h/12h)
- [ ] PER 음수 / PEG 무효 엣지케이스 처리

### Phase 2 - 인프라 전환
- [ ] HTTPS + CORS 화이트리스트 + Rate limiting per device_id 적용
- [ ] device_id HMAC 서명 (보안 강화)
- [ ] SQLite → PostgreSQL 전환 (다수 사용자 대비, 비동기 pg 패턴)
- [ ] 공식 데이터 API 이관 (KIS Open API / KRX) — 스크래핑 의존도 최소화

### Phase 3 - 앱 배포
- [ ] Capacitor 설정 + `@capacitor/preferences`로 device_id 저장 교체
- [ ] 오프라인 캐시 (마지막 조회 데이터 로컬 저장, 네트워크 없어도 포트폴리오 조회 가능)
- [ ] FCM/APNs Push Notification 연동 (현재 배치 기반 알림 대체)
- [ ] App Store / Play Store 배포

### Phase 4 - 품질 향상
- [ ] 백테스팅 모듈: `stock_history` 기반 과거 시점 스코어 재계산 → 실제 수익률 비교
- [ ] 스코어 임계값(7점/4점) 데이터 기반 최적화
- [ ] 수급 스코어에 순매수 금액 가중치 추가

---

## 영역별 문서 참조
- 백엔드 작업 시: `docs/BACKEND.md` 참조
- 프론트엔드 작업 시: `docs/FRONTEND.md` 참조
- AI 활용 내역: `docs/AI.md` 참조
