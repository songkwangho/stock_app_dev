# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus)를 활용하여 개발되었다.
아래는 AI가 기여한 주요 영역과 세부 내역이다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트엔드/백엔드 분리 구조 설계
- SQLite 스키마 설계 (8개 테이블, 관계, 인덱스)
- API 엔드포인트 설계 (23개)
- Zustand 상태관리 구조 설계 (단일 스토어 → 도메인별 3개 스토어 리팩토링 포함)
- Lazy loading 기반 페이지 분할 전략
- `DeviceIdStorage` 인터페이스 추상화 설계 (Web/Capacitor 교체 가능)
- Opinion 분리 설계 (`MarketOpinion` vs `HoldingOpinion`)

### 2. 백엔드 개발 (server/)
- Express 서버 전체 구현 (단일 파일 → 도메인별 분리 구조 전환 포함)
- 네이버 증권 데이터 스크래핑 로직 (EUC-KR 인코딩 처리 포함, `scrapers/naver.js`에 단일화)
- 기술적 분석 알고리즘 구현 (`domains/analysis/`):
  - RSI (14일), MACD (12,26,9), 볼린저밴드 (20,2)
  - 5일/20일 이동평균선 계산
  - 10점 만점 통합 스코어링 시스템 (밸류에이션 3 + 기술지표 3 + 수급 2 + 추세 2)
- 밸류에이션 스코어링: PER/PBR 섹터 중앙값 비교, PEG(EPS 성장률 기반)
  - PER 음수(적자 기업) 엣지케이스: 0점 고정 + `per_negative` 플래그
  - PEG 분모 ≤ 0 엣지케이스: PEG 무효 처리 + 밸류에이션 2점 만점 재정규화
- 기술지표 스코어링: RSI/MACD/볼린저밴드/거래량 가중 합산
  - RSI 30~50 구간 과매도 회복 신호 반영
  - 볼린저밴드 %B 정규화 기준 수정
- 수급 스코어링: 외국인/기관 연속 순매수 일수 기반 (investor_history 테이블)
- 보유 종목 5단계 판단 (`HoldingOpinion`): 손절(-7%) → 이중이탈 → 관망 → 추가매수 → 보유
  - `portfolio/service.js`에서 런타임 계산, DB 미저장
- 추천 시스템 로직 (수동 추천 + 분석 기반 동적 추천, `source` 필드로 구분)
- 알림 생성 로직 (type별 쿨다운 차별화: 매도 48h / 추가매수 24h / 목표가 12h)
- 캐시 시스템 (10분 TTL)
- 스케줄링 (`scheduler.js`, 매일 08:00 자동 동기화)
- 100개 주요 종목 데이터 등록

### 3. 프론트엔드 개발 (src/)
- 전체 UI 컴포넌트 구현 (7개 페이지 + 5개 공용 컴포넌트)
- Tailwind CSS 다크 테마 디자인 시스템
- Recharts 차트 구현:
  - 캔들스틱 차트 (커스텀 Shape)
  - 이동평균선 오버레이
  - 투자자 매매동향 바차트
  - 포트폴리오 수익률 에리어차트
  - 자산배분 파이차트
- 종목 검색 컴포넌트 (디바운스, 드롭다운)
- 종목 스크리너 (프리셋 필터 + 고급 필터)
- 포트폴리오 관리 CRUD (인라인 편집)
- `MarketOpinion` / `HoldingOpinion` 분리 뱃지 UI
- PER 음수 종목 '적자' 뱃지 + 설명 텍스트

### 4. 데이터 분석 로직
- 보유종목 5단계 투자의견 판정 (`HoldingOpinion`: 손절/이중이탈/관망/추가매수/보유)
- 비보유종목 10점 만점 통합 스코어링 → `MarketOpinion` ('긍정적'/'중립적'/'부정적')
- PER/PBR 섹터 중앙값 비교 밸류에이션 (섹터 종목 수 < 5 시 `low_confidence` 플래그)
- PEG 비율 계산 (EPS 성장률 기반, 음수 성장률 무효 처리)
- 투자자 수급 데이터 영구 저장 및 연속 순매수 분석
- 거래량 분석 (20일 평균 대비 비율 + 가격 방향 조합)
- 변동성 계산 (일간수익률 표준편차)
- 섹터 내 평균 대비 비교 분석

### 5. 코드 품질 및 구조
- TypeScript 인터페이스 정의 (16개 + `MarketOpinion`/`HoldingOpinion` 타입 분리)
- `DeviceIdStorage` 인터페이스 추상화 (Web/Capacitor 구현체 교체 가능)
- 에러 처리 패턴 (폴백, 부분 실패 허용)
- DB 마이그레이션 안전성 (try-catch ALTER TABLE)
- API 클라이언트 모듈화

---

## 개발 이력 (커밋 순서)

| 커밋 | 내용 | AI 기여도 |
|------|------|----------|
| e2d8120 | 주요 종목 현황 탭 신설 | 100% |
| c59181d | 데이터 흐름 수정 & 데이터 스키마 최적화 | 100% |
| 1480678 | 코드 리팩토링 & 데이터 클리닝 & 성능 최적화 | 100% |
| 514917c | 기능 추가 완성 | 100% |
| 07668ec | 종합의견과 기술적 지표 종합 추천 | 100% |

### 미커밋 작업 (이전 세션)
- 100개 주요 종목 DB 등록 확장 (기존 20 → 104개)
- 종목 스크리너 페이지 + API (ScreenerPage.tsx, GET /api/screener)
- 종목 검색 컴포넌트 (StockSearchInput.tsx)
- 재무제표 API (GET /api/stock/:code/financials)
- 뉴스 API (GET /api/stock/:code/news)
- 섹터 비교 API (GET /api/sector/:category/compare)
- 주봉/월봉 차트 API (GET /api/stock/:code/chart/:timeframe)
- 포트폴리오 관리를 HoldingsAnalysisPage로 이전 (DashboardPage는 읽기전용)
- Store 개선: updateHolding 추가, deleteHolding을 code 기반으로 변경
- StockDetailView에 뉴스/재무/섹터비교/차트 타임프레임 기능 추가
- 매일 오전 8시 자동 데이터 동기화 스케줄링

### 분석 엔진 고도화 (10점 통합 스코어링)
- 기존 5점 만점 단순 스코어링 → 10점 만점 통합 스코어링 시스템 전면 교체
- investor_history 테이블 신설 + 투자자 매매 데이터 영구 저장
- EPS 스크래핑 추가 (네이버 th_cop_anal17) + stocks 테이블 eps_current/eps_previous 컬럼
- 밸류에이션 함수: PER/PBR 섹터 중앙값 비교 + PEG 비율
- 기술지표 함수: RSI/MACD/볼린저/거래량 연속값 가중 합산
- 수급 함수: 외국인/기관 연속 순매수 일수 기반
- 추세 함수: 5MA/20MA 배열 상태
- 보유 종목: 5단계 우선순위 판단 (손절 -7% → 이중 이탈 → 관망 → 추가매수 → 보유)
- ScoringBreakdown 타입 추가 (프론트엔드)

### 기기 식별자(device_id) 도입
- 스마트폰 앱 배포를 위한 개인 데이터 분리 구현
- 로그인 없이 기기별 UUID v4로 사용자 식별
- 백엔드: holding_stocks, watchlist, alerts 테이블에 device_id 컬럼 추가 + 마이그레이션
- 백엔드: getDeviceId(req) 헬퍼, 모든 개인 데이터 API에 device_id 필터 적용
- 프론트엔드: Axios 인터셉터로 X-Device-Id 헤더 자동 첨부
- 프론트엔드: `DeviceIdStorage` 인터페이스 추상화 (Web 구현체 기본, Capacitor 교체 가능)

### 구조 개선 및 보완 (구현 완료)
- **Opinion 분리**: `MarketOpinion` (비보유, 공용, DB 저장) / `HoldingOpinion` (보유, 개인화, 런타임 계산) 명확히 분리
  - `stock_analysis.opinion` = `MarketOpinion` 전용 (API 응답 시 `market_opinion` alias)
  - `GET/POST /api/holdings` 응답에 `holding_opinion` 필드 추가 (`calculateHoldingOpinion()` 런타임 계산)
  - TypeScript 타입 레벨 강제 (`MarketOpinion`, `HoldingOpinion` 별도 타입)
  - 모든 프론트엔드 뷰에서 `.opinion` → `.market_opinion` 전환 완료
- **Zustand 스토어 분리**: `useStockStore` → `useNavigationStore` + `usePortfolioStore` + `useAlertStore` (구현 완료)
  - `useStockStore.ts`는 하위 호환 re-export 파일로 유지
  - `usePortfolioStore`: `error` 상태 + 한국어 에러 메시지 + throw 패턴
- **DeviceIdStorage 인터페이스**: `src/storage/deviceId.ts`에 인터페이스 + `WebDeviceIdStorage` 구현체 (구현 완료)
- **알림 쿨다운 개선**: 단순 24h 중복 방지 → type별 차별화 (`sell_signal` 48h / `sma5_*` 24h / `target_near` 12h)
  - `sell_signal` 조건: 5일선+20일선 이중 이탈로 변경 (기존 `opinion === '매도'`에서 분리)
- **스코어링 엣지케이스 처리**:
  - PER 음수(적자 기업): 0점 고정 + `per_negative` 플래그
  - PEG 성장률 ≤ 0: 무효 처리 + `(perScore+pbrScore)/2.0*3.0` 재정규화
  - 볼린저밴드 %B 정규화: `(80 - percentB) / 80` (기존 `/70` → `/80`)
  - RSI 30~50 구간: `(50-rsi)/20 * 0.3` 과매도 회복 보정 추가
  - 거래량 하락+기타: 0.3 → 0.2 수정
  - 섹터 내 종목 수 < 5: `low_confidence` 플래그 추가
- **추천 source 구분**: `recommended_stocks.source` 컬럼 추가 (`'manual'` / `'algorithm'`)
  - `initialRecommendations` INSERT에 `source: 'manual'` 명시
- **보안 강화**:
  - CORS 화이트리스트: `localhost:5173/4173/3000` + Capacitor origins만 허용
  - `express-rate-limit`: device_id 기준 120req/min
- **스크리너 PER 필터**: `perMin`/`perMax` 지정 시 `per > 0` 자동 추가 (적자 기업 제외)
- **topStocks 중복 제거**: 하이브(352820) 중복 엔트리 삭제 (99 → 98개, dedup 후 97개)
- **syncAllStocks() 지연**: 서버 시작 5초 후 실행 (startup 블로킹 방지)
- **POST /api/holdings 응답**: `holding_opinion` + `market_opinion` 포함 반환

---

## 사용된 AI 도구
- **Claude Code** (Anthropic Claude Opus 4.6)
- CLI 및 VSCode 확장 환경에서 직접 코드 작성, 파일 편집, 빌드 검증 수행
- 코드 작성 → TypeScript 타입 체크 → Vite 빌드 검증 사이클
- **Claude (claude.ai)**: 아키텍처 리뷰, 설계 문제점 파악 및 보완 계획 수립

---

## AI 미사용 영역
- 프로젝트 기획 및 요구사항 정의: 사용자 직접 결정
- 투자 판단 기준 (추천 종목 선정, 적정가 설정): 사용자 입력
- 디자인 방향성 (다크 테마, 레이아웃): 사용자 지시
- 데이터 소스 선택 (네이버 증권, KIS API): 사용자 결정
- 스코어링 가중치 최종 확정 및 백테스팅: 사용자 검토 필요

---

## 알려진 기술 부채 및 개선 예정 항목

| 항목 | 현황 | 계획 |
|------|------|------|
| 백엔드 단일 파일 | `server/server.js` ~2,200줄 | `domains/` 구조 리팩토링 (Phase 2) |
| SQLite 동기 블로킹 | syncAllStocks 중 요청 지연 (5초 지연 실행으로 완화) | PostgreSQL + 비동기 전환 (Phase 2) |
| 스크래핑 의존성 | 핵심 가격 데이터 스크래핑 | KIS Open API 이관 (Phase 2) |
| device_id 보안 | CORS + Rate limit 적용됨. HMAC 미적용 | HMAC 서명 추가 (Phase 2) |
| Puppeteer 클라우드 | Chromium 서버 설치 필요 | 자체 캔들차트 대체 또는 CDN (Phase 3) |
| 스코어 백테스팅 | 가중치 근거 없음 | 과거 데이터 기반 검증 (Phase 4) |
| 수급 금액 미반영 | 일수만 카운트 | 순매수 금액 가중치 추가 (Phase 4) |
