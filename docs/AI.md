# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus 4.6)를 활용하여 개발되었다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트/백엔드 분리, SQLite 스키마(8개 테이블), API 설계(28개)
- 백엔드 도메인 분리 (`db/`, `helpers/`, `scrapers/`, `domains/{alert,watchlist,portfolio,analysis,stock}/`, `scheduler.js`) — 각 도메인은 service + router 쌍
- Opinion 분리 (`MarketOpinion` vs `HoldingOpinion`), Zustand 5개 스토어 (Navigation/Portfolio/Alert/Watchlist/Toast), DeviceIdStorage 인터페이스

### 2. 백엔드 개발
- Express 서버 → 도메인별 분리 (단일 2,237줄 → 모듈 + 라우터 분리)
- **9차 라우트 분리**: server.js 891줄 → 80줄 컴포지션 루트 + 5개 도메인 라우터
- **10차 추가 정리**:
  - **시스템 라우터 격리**: `domains/system/router.js` 신설(`/health`, `/market/indices`). stockRouter 책임 9 → 7 endpoints. 총 6개 라우터.
  - **computeSMA 위치 이동**: `portfolio/router.js`의 로컬 헬퍼였던 `computeSMA`를 `analysis/scoring.js`로 옮겨 분석 도메인 유틸로 정리. `computeSMA(db, code)` 시그니처.
  - **cleanupOldData 시드 보존 가드**: `recommended_stocks WHERE created_at < ? AND source != 'manual'`. ON CONFLICT가 `created_at`을 갱신하지 않아, 가드 없이 서버 20일+ 무중단 운영 시 시드 추천이 통째로 사라지던 잠재 버그 수정.
  - **알림 메시지 중립적 표현**: `service.js`의 모든 INSERT 메시지("매도를 검토해 주세요" 등)와 `ALERT_TYPE_LABELS`("매도 신호" → "가격 하락 경고")를 일괄 정비.
- 10점 통합 스코어링 (밸류에이션/기술지표/수급/추세)
- 수급: 가중 감쇠(decay=0.8), HoldingOpinion: SMA null 분기 명시화, `sma_available`(SMA5 5일 이상 가능 여부) API 응답 노출
- 알림: type별 쿨다운(48h/24h/12h), sell_signal은 이중 이탈 조건
- CORS 화이트리스트 + Rate limiting + PUT /api/holdings/:code (부분 수정)
- recalcWeights → domains/portfolio/service.js 추출
- recommended_stocks.fair_price ON CONFLICT 시 갱신 안 함 (최초 등록 후 고정). reason/score는 서버 재시작마다 코드 값으로 초기화 — DB 직접 수정은 휘발성 (data.js에 경고 주석)

### 3. 프론트엔드 개발
**기본 구조**: 7개 페이지 + 8개 컴포넌트 + 4개 도메인 스토어 + Toast
- 반응형: PC 사이드바(`hidden md:flex`) + 모바일 하단 탭바 5개(대시보드/포트폴리오/추천/알림/설정)
- 관심종목: 모바일은 포트폴리오 내 탭(A안), PC는 사이드바 독립 페이지 — 둘 다 `WatchlistContent` 공유
- 도메인 스토어: useNavigationStore, usePortfolioStore, useAlertStore, useWatchlistStore

**투자 면책 + 온보딩**:
- 첫 실행 면책 모달(원금 손실 강조 + "이 앱은 정보 제공 도구로, 실제 주식 거래는 지원하지 않아요" 명시) → 온보딩 스텝(종목 추가 안내) → **첫 종목 추가 직후 인라인 가이드 카드(1회, `onboarding_first_stock_guided`)** → 대시보드 CTA(재방문 시만)
- 면책 고지 7곳: ① 모달 ② 추천 페이지 상단 ③ 종목 상세 종합의견 박스(market_opinion 뱃지에 📊 힌트 + 인라인 설명) ④ 종목 상세 분석 영역 하단 ⑤ 추천 카드 하단 ⑥ HoldingsAnalysisPage "주의 필요"/"추가 검토" 뱃지 하단 ⑦ ScoringBreakdownPanel **상단** (스코어 직후, 맥락 우선)
- **HoldingOpinion 표시 라벨 소프트화**: badge에서 "매도" → "주의 필요", "추가매수" → "추가 검토" (명령어 → 상태 설명). 내부 알고리즘 값은 그대로 유지하여 호환성 보존.
- **ALERT_TYPE_LABELS 중립적 표현**: "매도 신호" → "가격 하락 경고", "매수 타이밍" → "가격 지지 알림" 등 (앱스토어 심사 대비)

**스코어링/지표 시각화**:
- ScoringBreakdownPanel: 4영역 게이지 바 + 만점대비 비율(80/60/25%) 한국어 해석
- 재무지표 PER/PBR/ROE 카드: 컨텍스트 설명 + [?] 버튼 → HelpBottomSheet (8개 용어)
- 차트 라인/캔들 토글, 알림 아이콘+우선순위, 업종 비교는 중앙값 기준

**보유종목/추천 UX**:
- holding_opinion 구체적 이유 + "상세 보기 →" 행동유도 링크
- 수익률 6구간 메시지 + 극단 구간(≥20%, ≤-7%)에 "종목 보기 →" 링크
- 추천 source: 'manual'/'algorithm' 뱃지 + 탭/클릭 accordion 인라인 설명
- fairPrice 라벨에 출처 표기 (애널리스트/추정), "알고리즘 추정 적정가 대비 N%" 표현

**데이터 표시 + 검색**:
- utils/dataFreshness.ts: getDataFreshnessLabel/Short — 평일 9~16시 장중/장외 자동 판단
- 검색 드롭다운에 market_opinion 뱃지 (서버 search API에 JOIN 추가)
- 대시보드 수익률에 "투자금액 기준 가중 평균" subtitle

**페이지 접근성**:
- Empty State 3곳: 포트폴리오(📊), 관심종목(👀), 알림(🔔)
- 추천 페이지 하단 + 대시보드 하단에 "전체 종목 보기"(MajorStocksPage 진입) 카드
- 스크리너 프리셋에 조건 요약 (`PER < 15 + ROE > 10%`) 표시
- 알림 패널 반응형: PC는 헤더 드롭다운, **모바일은 전체 화면 모달 (스크롤 충돌 회피)**. 각 항목에 `[지금 확인하기]`/`[나중에 볼게요]` 버튼. 우측 휴지통은 stopPropagation 단건 삭제 전용
- HelpBottomSheet [?] 버튼: PER/PBR/ROE/RSI/MACD/볼린저밴드/투자자 매매동향/SMA. **콘텐츠 4단계 작성 기준**: 정의 → 높으면/낮으면 → "이 앱에서는?" 블루 박스 → 예시 숫자
- DashboardPage 수익률 카드 subtitle: `₩원금 → ₩평가액 (가중 평균)` 형태로 절대 금액 병기
- 분기 재무제표 단위 표시(`단위: 억 원`) + 1조 이상 자동 포맷팅(`X조 Y,YYY억`)
- 투자자 매매동향 차트 레이블 부연: "개인 투자자 (일반인)", "외국인 투자자 (해외)", "기관 투자자 (회사·펀드)"

**데이터 흐름**:
- StockDetailView 2단계 로딩: Phase1(가격/지표) await → Phase2(뉴스/재무/섹터) fire-and-forget + 스켈레톤. Phase2 실패는 조용히 빈 값 (catch)
- stockApi.updateHolding (PUT 분리), UpdateHoldingPayload 타입
- usePortfolioStore: isLoading + error 상태, throw 패턴
- useWatchlistStore: 30초 TTL 캐시 (WatchlistPage + HoldingsAnalysisPage 동시 마운트 시 중복 호출 방지). 삭제 실패 시 즉시 롤백 + `useToastStore` 토스트 (단순 재출현으로 인한 사용자 혼란 제거)
- useNavigationStore: pendingFocus 필드 + consumePendingFocus() — 페이지 진입 시 자동 포커스
- Holding 타입에 sma_available 필드, SMA5 부족 시 "분석 중" 뱃지 표시
- dataFreshness.ts: KST 고정 변환 (사용자 시간대 무관). `parseServerDate()` 헬퍼로 SQLite UTC `"YYYY-MM-DD HH:MM:SS"`를 명시 UTC로 해석 — `getDataFreshnessLabel`/`Short` 양쪽 모두 통일 (이전엔 short만 `new Date()` 직접 호출해서 9시간 오차 가능). 공휴일 미처리는 알려진 제약

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
| ~~라우트 잔존~~ | ~~server.js ~880줄 (28개 라우트)~~ | ✅ 9~10차 분리 완료 (server.js 80줄 + 6개 라우터: alert/watchlist/portfolio/analysis/stock/system) |
| ~~cleanupOldData 시드 삭제~~ | ~~서버 20일+ 운영 시 시드 추천 사라짐~~ | ✅ 10차에서 `source != 'manual'` 가드 추가 |
| device_id 보안 | CORS+Rate limit 적용 | HMAC 서명 + 마이그레이션 (P2-1, 라우트 분리 후 다음 우선순위) |
| SQLite 블로킹 | 5초 지연 실행으로 완화 | PostgreSQL 비동기 전환 (P2-3). 사전 작업: `syncAllStocks()` 비동기 재작성 범위 산정 |
| 스크래핑 의존 | 핵심 데이터 네이버 스크래핑 | KIS/KRX 분리 평가 (P2-4) |
| 알림 이중 발송 | 배치 알림만 존재 | Push+배치 단일 파이프라인 (P3). 빈도 제어 정책: 동일 종목당 일 N건 |
| 스코어 임계값 검증 | 임시값(7/4점), 주석 추가됨 | 장기 데이터 적재 → 백테스팅 (P4). 데이터 적재 스크립트는 즉시 착수 가능 |
| 공휴일 장중/장외 판단 | 평일 9~16시만 판단, 광복절 등 휴장일 미처리 | 공휴일 캘린더 통합 (P3 후속) |
| 검색 LIKE 풀스캔 | 97종목에서 무시 가능 | 1000+ 시 FTS 인덱스 도입 |
| 번들 크기 측정 | 미측정 | P3 사전: `rollup-plugin-visualizer` + 초기 청크 < 250KB gzip 목표 |
| 앱스토어 분류 전략 | 미정 | P3 사전: 유사 국내 앱 심사 통과 사례 조사 → Finance vs. News/Reference 결정 |
