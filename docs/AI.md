# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus 4.6)를 활용하여 개발되었다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트/백엔드 분리, SQLite 스키마(8개 테이블), API 설계(28개)
- 백엔드 도메인 분리 (`db/`, `helpers/`, `scrapers/`, `domains/`, `scheduler.js`)
- Opinion 분리 (`MarketOpinion` vs `HoldingOpinion`), Zustand 3개 스토어, DeviceIdStorage 인터페이스

### 2. 백엔드 개발
- Express 서버 → 도메인별 분리 (단일 2,237줄 → server.js 880줄 + 모듈 1,668줄)
- 10점 통합 스코어링 (밸류에이션/기술지표/수급/추세)
- 수급: 가중 감쇠(decay=0.8), HoldingOpinion: SMA null 분기 명시화
- 알림: type별 쿨다운(48h/24h/12h), sell_signal은 이중 이탈 조건
- CORS 화이트리스트 + Rate limiting + PUT /api/holdings/:code (부분 수정)
- recalcWeights → domains/portfolio/service.js 추출
- recommended_stocks.fair_price ON CONFLICT 시 갱신 안 함 (최초 등록 후 고정)

### 3. 프론트엔드 개발
- 7개 페이지 + 6개 컴포넌트. 반응형 (PC 사이드바 + 모바일 탭바 5개)
- 차트 라인/캔들 토글, ScoringBreakdownPanel 게이지 바, 재무지표 컨텍스트 설명
- holding_opinion 뱃지+이유, 수익률 격려 메시지, 데이터 갱신 시각 표시
- 추천 source 뱃지(전문가/알고리즘) + fairPrice 출처, 알림 아이콘+우선순위
- 투자 면책 고지 모달(첫 실행 1회) + 추천 카드 면책 문구
- stockApi.updateHolding (PUT 분리), usePortfolioStore isLoading/error
- 투자 면책 고지 3곳 (모달/추천 상단/상세 하단), 수익률 6구간 메시지
- 데이터 갱신 시각("N분 전"), 업종 비교 중앙값 기준 통일, 스코어 해석 점수 기반 4단계
- holding_opinion 구체적 이유(손절%/이평선), 모바일 탭바 관심종목→알림(뱃지) 교체
- 온보딩 2단계(면책→종목 추가 안내), source 뱃지 accordion, 상세뷰 2단계+스켈레톤
- 포트폴리오 내 보유종목/관심종목 탭 전환(A안), Empty State 3곳(📊👀🔔)
- 스코어 해석 만점대비 비율(80/60/25%), 수익률+opinion 행동유도 링크
- 데이터 신선도 장중/장외 라벨, 면책 문구 안내형, "알고리즘 추정 적정가" 표현 통일

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

## AI 도구
- **Claude Code** (Opus 4.6): CLI + VSCode 확장에서 코드 작성, 빌드 검증
- **Claude (claude.ai)**: 아키텍처 리뷰, 설계 문제점 파악

## AI 미사용
프로젝트 기획, 투자 판단 기준, 디자인 방향, 데이터 소스 선택: 사용자 결정

---

## 기술 부채

| 항목 | 현황 | 계획 (Phase) |
|------|------|------|
| 라우트 잔존 | server.js ~880줄 (28개 라우트) | domains/*/router.js 분리 (P2-1) |
| device_id 보안 | CORS+Rate limit 적용 | HMAC 서명 + 마이그레이션 (P2-2) |
| SQLite 블로킹 | 5초 지연 실행으로 완화 | PostgreSQL 비동기 전환 (P2-3) |
| 스크래핑 의존 | 핵심 데이터 네이버 스크래핑 | KIS/KRX 분리 평가 (P2-4) |
| 알림 이중 발송 | 배치 알림만 존재 | Push+배치 단일 파이프라인 (P3) |
| 백테스팅 | 가중치 근거 없음 | 장기 데이터 적재 스크립트 선행 (P4) |
| 스코어 검증 | 가중치 근거 없음 | 백테스팅 모듈 |
