# Stock Analyzer - Claude Code 개발 가이드

## 프로젝트 개요
한국 주식 분석 및 포트폴리오 관리 애플리케이션. 스마트폰 앱으로 배포 예정.
네이버 증권 데이터를 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
로그인 없이 기기별 익명 식별자(device_id)로 개인 데이터를 분리하여 관리한다.

## 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts v3.7 + Zustand v5
- **백엔드**: Node.js + Express + SQLite3 (better-sqlite3)
- **데이터 소스**: 네이버 증권 API + 네이버 증권 웹 스크래핑 + 토스증권 차트 캡처 (Puppeteer)

## 프로젝트 구조
```
stock_app_dev/
├── server/server.js          # Express 백엔드 (단일 파일)
├── stocks.db                 # SQLite 데이터베이스
├── public/charts/            # 토스증권 차트 캡처 이미지
├── src/
│   ├── App.tsx               # 메인 레이아웃 + 네비게이션
│   ├── api/stockApi.ts       # Axios API 클라이언트
│   ├── stores/useStockStore.ts # Zustand 상태관리
│   ├── types/stock.ts        # TypeScript 인터페이스
│   ├── pages/                # 페이지 컴포넌트 (7개)
│   └── components/           # 공용 컴포넌트 (5개)
├── docs/
│   ├── AI.md                 # AI 활용 내역
│   ├── BACKEND.md            # 백엔드 상세 문서
│   └── FRONTEND.md           # 프론트엔드 상세 문서
└── package.json
```

## 개발 명령어
```bash
npm run dev          # Vite 프론트엔드 dev server
node server/server.js # Express 백엔드 (포트 3001)
npm run build        # TypeScript 체크 + 프로덕션 빌드
npm run lint         # ESLint 검사
```

## 핵심 규칙

### 코드 작성 원칙
- 한국어 UI 텍스트, 영어 코드/변수명
- Tailwind CSS 다크 테마 (slate 계열 배경, blue 액센트)
- 모든 페이지는 lazy loading (React.lazy + Suspense)
- API 통신은 stockApi.ts를 통해서만 수행
- 상태관리는 useStockStore (Zustand)를 통해서만 수행

### 사용자 식별 (device_id 방식)
- 로그인 없음. 기기 기반 익명 식별자로 개인 데이터 분리
- 프론트: 최초 실행 시 UUID v4 생성 → localStorage에 저장 → Axios 인터셉터로 모든 요청에 `X-Device-Id` 헤더 자동 첨부
- 백엔드: `getDeviceId(req)` 헬퍼로 헤더에서 추출, 개인 데이터 테이블(holding_stocks, watchlist, alerts)에 device_id 컬럼 추가
- 공용 데이터(stocks, stock_history, stock_analysis, recommended_stocks, investor_history)는 device_id 무관

### 백엔드 원칙
- 단일 파일 구조 (server/server.js)
- better-sqlite3 동기 API 사용 (트랜잭션 활용)
- 네이버 스크래핑 시 EUC-KR 인코딩 처리 필수
- 캐시 TTL 10분, 배치 처리 5개씩

### 데이터 흐름
1. 서버 시작 시 `syncAllStocks()` → 전체 종목 가격/지표 갱신
2. 매일 오전 8시 자동 동기화 스케줄
3. 프론트에서 종목 상세 조회 시 캐시 우선, 만료 시 실시간 스크래핑
4. 분석 결과(opinion)는 stock_analysis 테이블에 저장

### 분석 알고리즘 요약 (10점 만점 통합 스코어링)
- **보유 종목**: 5단계 우선순위 판단
  1. 손절(-7% 평단가 대비) → 매도
  2. 5MA + 20MA 동시 이탈 → 매도
  3. 5MA 이탈 + 20MA 지지 → 관망
  4. 5MA 근접 지지 → 추가매수
  5. 정배열 유지 → 보유
- **비보유 종목**: 밸류에이션(0-3) + 기술지표(0-3) + 수급(0-2) + 추세(0-2) = 10점 만점
  - 7점 이상: 긍정적 / 4점 이상: 중립적 / 4점 미만: 부정적
- **밸류에이션**: PER 섹터 중앙값 비교 + PBR 섹터 비교 + PEG(EPS 성장률 기반)
- **기술지표**: RSI(14) 연속값 + MACD(12,26,9) 강도/방향 + 볼린저밴드(20,2) + 거래량(20일 평균 대비)
- **수급**: 외국인/기관 연속 순매수 일수
- **추세**: 5MA/20MA 배열 상태

## 영역별 문서 참조
- 백엔드 작업 시: `docs/BACKEND.md` 참조
- 프론트엔드 작업 시: `docs/FRONTEND.md` 참조
- AI 활용 내역: `docs/AI.md` 참조

## DB 테이블 (8개)
| 테이블 | PK | device_id | 용도 |
|--------|-----|-----------|------|
| stocks | code | - | 종목 기본정보 + 재무지표 + EPS (공용) |
| holding_stocks | device_id+code | O | 포트폴리오 보유종목 (개인) |
| stock_history | code+date | - | 일일 OHLCV 히스토리 (공용) |
| stock_analysis | code | - | 기술적 분석 결과/의견 (공용) |
| recommended_stocks | code | - | 수동 추천 종목 (공용) |
| investor_history | code+date | - | 투자자(외국인/기관) 매매 히스토리 (공용) |
| alerts | id | O | 알림 (개인) |
| watchlist | device_id+code | O | 관심종목 (개인) |

## API 엔드포인트 요약 (23개)
- 종목: GET/POST/DELETE `/api/stocks`, GET `/api/stock/:code`, POST `/api/stock/:code/refresh`
- 포트폴리오: GET/POST/DELETE `/api/holdings`, GET `/api/holdings/history` (device_id 필터)
- 추천: GET `/api/recommendations`
- 분석: GET `/api/stock/:code/indicators`, `/volatility`, `/financials`, `/news`, `/chart/:timeframe`
- 스크리너: GET `/api/screener`
- 섹터: GET `/api/sector/:category/compare`
- 알림: GET/DELETE `/api/alerts`, GET `/api/alerts/unread-count`, POST `/api/alerts/read` (device_id 필터)
- 관심종목: GET/POST/DELETE `/api/watchlist` (device_id 필터)
- 시장: GET `/api/market/indices`
- 검색: GET `/api/search`
