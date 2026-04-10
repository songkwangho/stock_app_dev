# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus 4.6)를 활용하여 개발되었다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트엔드/백엔드 분리 구조, SQLite 스키마(8개 테이블), API 설계(28개)
- Zustand 도메인별 3개 스토어, `DeviceIdStorage` 인터페이스, Opinion 분리
- 백엔드 도메인 분리 (`db/`, `helpers/`, `scrapers/`, `domains/`, `scheduler.js`)

### 2. 백엔드 개발
- Express 서버 전체 구현 → 도메인별 분리 구조 전환 (2,237줄 → 900줄 + 모듈)
- 10점 만점 통합 스코어링 (밸류에이션 3 + 기술지표 3 + 수급 2 + 추세 2)
- 밸류에이션: PER/PBR 섹터 중앙값, PEG, 적자 기업 엣지케이스, PEG 무효 재정규화
- 기술지표: RSI(30~50 보정) + MACD + 볼린저(%B/80) + 거래량. 가중합산
- 수급: 외국인/기관 10일 가중 감쇠(decay=0.8)
- HoldingOpinion: 5단계 판단 + SMA null 분기 명시화
- 알림: type별 쿨다운(48h/24h/12h), sell_signal은 이중 이탈 조건
- CORS 화이트리스트 + Rate limiting + PUT /api/holdings/:code
- `getStockData` + `syncAllStocks` → `domains/stock/service.js` 추출

### 3. 프론트엔드 개발
- 7개 페이지 + 6개 공용 컴포넌트 (ScoringBreakdownPanel 포함)
- 반응형 레이아웃: PC 사이드바 + 모바일 하단 탭바 5개
- 차트 라인/캔들 토글, 재무지표 컨텍스트 설명, 스코어 게이지 바 시각화
- holding_opinion 뱃지+이유, 수익률 격려 메시지, 알림 아이콘+우선순위
- 추천 source 뱃지(전문가/알고리즘) + fairPrice 출처 라벨
- `stockApi.updateHolding` PUT 분리, `usePortfolioStore` isLoading/error

---

## 개발 이력

| 커밋 | 내용 |
|------|------|
| e2d8120 | 주요 종목 현황 탭 신설 |
| c59181d | 데이터 흐름 수정 & 스키마 최적화 |
| 1480678 | 코드 리팩토링 & 성능 최적화 |
| 514917c | 기능 추가 완성 |
| 07668ec | 종합의견과 기술적 지표 종합 추천 |

---

## 사용된 AI 도구
- **Claude Code** (Anthropic Claude Opus 4.6): CLI 및 VSCode 확장에서 코드 작성, 빌드 검증
- **Claude (claude.ai)**: 아키텍처 리뷰, 설계 문제점 파악 및 보완 계획 수립

## AI 미사용 영역
- 프로젝트 기획/요구사항, 투자 판단 기준, 디자인 방향성, 데이터 소스 선택: 사용자 결정

---

## 기술 부채

| 항목 | 현황 | 계획 |
|------|------|------|
| 라우트 잔존 | server.js ~900줄 | domains/*/router.js 분리 |
| SQLite 블로킹 | 5초 지연 실행으로 완화 | PostgreSQL 비동기 전환 |
| 스크래핑 의존 | 핵심 데이터 스크래핑 | KIS Open API 이관 |
| device_id 보안 | CORS+Rate limit 적용 | HMAC 서명 추가 |
| 스코어 검증 | 가중치 근거 없음 | 백테스팅 모듈 |
