# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus)를 활용하여 개발되었다.
아래는 AI가 기여한 주요 영역과 세부 내역이다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트엔드/백엔드 분리 구조 설계
- SQLite 스키마 설계 (7개 테이블, 관계, 인덱스)
- API 엔드포인트 설계 (23개)
- Zustand 상태관리 구조 설계
- Lazy loading 기반 페이지 분할 전략

### 2. 백엔드 개발 (server/server.js)
- Express 서버 전체 구현
- 네이버 증권 데이터 스크래핑 로직 (EUC-KR 인코딩 처리 포함)
- 기술적 분석 알고리즘 구현:
  - RSI (14일), MACD (12,26,9), 볼린저밴드 (20,2)
  - 5일/20일 이동평균선 계산
  - 종합 의견 판정 (5점 스코어링 시스템)
- 추천 시스템 로직 (수동 추천 + 분석 기반 동적 추천)
- 알림 생성 로직 (5일선 이탈, 목표가 근접 등)
- 캐시 시스템 (10분 TTL)
- 스케줄링 (매일 08:00 자동 동기화)
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

### 4. 데이터 분석 로직
- 보유종목 투자의견 판정 규칙 (Rules 4-8)
- 비보유종목 종합 스코어링 (Rules 9-12)
- 적정가 산출 로직 (목표가 → ROE 기반 → 폴백)
- 변동성 계산 (일간수익률 표준편차)
- 섹터 내 평균 대비 비교 분석

### 5. 코드 품질
- TypeScript 인터페이스 정의 (15개)
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

### 기기 식별자(device_id) 도입
- 스마트폰 앱 배포를 위한 개인 데이터 분리 구현
- 로그인 없이 기기별 UUID v4로 사용자 식별
- 백엔드: holding_stocks, watchlist, alerts 테이블에 device_id 컬럼 추가 + 마이그레이션
- 백엔드: getDeviceId(req) 헬퍼, 모든 개인 데이터 API에 device_id 필터 적용
- 프론트엔드: Axios 인터셉터로 X-Device-Id 헤더 자동 첨부
- 프론트엔드: localStorage 기반 device_id 생성/저장/조회

---

## 사용된 AI 도구
- **Claude Code** (Anthropic Claude Opus 4)
- CLI 환경에서 직접 코드 작성, 파일 편집, 빌드 검증 수행
- 코드 작성 → TypeScript 타입 체크 → Vite 빌드 검증 사이클

---

## AI 미사용 영역
- 프로젝트 기획 및 요구사항 정의: 사용자 직접 결정
- 투자 판단 기준 (추천 종목 선정, 적정가 설정): 사용자 입력
- 디자인 방향성 (다크 테마, 레이아웃): 사용자 지시
- 데이터 소스 선택 (네이버 증권): 사용자 결정
