# AI 활용 내역

## 개요
이 프로젝트는 Claude Code (Anthropic Claude Opus 4.6)를 활용하여 개발되었다.

---

## AI 기여 영역

### 1. 아키텍처 설계
- 프론트/백엔드 분리, SQLite 스키마(8개 테이블), API 설계(28개)
- 백엔드 도메인 분리 (`db/`, `helpers/`, `scrapers/`, `domains/{alert,watchlist,portfolio,analysis,stock,system}/`, `scheduler.js`)
- Opinion 분리 (`MarketOpinion` vs `HoldingOpinion`), Zustand 5개 스토어 (Navigation/Portfolio/Alert/Watchlist/Toast), DeviceIdStorage 인터페이스

### 2. 백엔드 개발
- Express 서버 → 도메인별 분리 (단일 2,237줄 → server.js 80줄 + 6개 라우터)
- **9차 라우트 분리**: server.js 891줄 → 80줄 컴포지션 루트 + 5개 도메인 라우터
- **10차 추가 정리**:
  - **시스템 라우터 격리**: `domains/system/router.js` 신설(`/health`, `/market/indices`). stockRouter 책임 9 → 7 endpoints. 총 6개 라우터.
  - **cleanupOldData 시드 보존 가드**: `recommended_stocks WHERE created_at < ? AND source != 'manual'`. ON CONFLICT가 `created_at`을 갱신하지 않아, 가드 없이 서버 20일+ 무중단 운영 시 시드 추천이 통째로 사라지던 잠재 버그 수정.
  - **알림 메시지 중립적 표현**: `service.js`의 모든 INSERT 메시지와 `ALERT_TYPE_LABELS`("매도 신호" → "가격 하락 경고" 등) 일괄 정비.
- **11차 추가 보완**:
  - **computeSMA 재이동 (analysis/scoring.js → helpers/sma.js)**: 10차에서 분석 도메인 유틸로 옮겼으나, `portfolio → analysis` 도메인 의존성이 단방향 원칙을 깨므로 helpers/ 수준 공유 유틸로 재배치.
  - **알림 일일 빈도 가드**: `DAILY_ALERT_LIMIT_PER_STOCK = 2`. 모든 INSERT 직전 `SELECT COUNT(*) ... DATE(created_at, 'localtime') = DATE('now', 'localtime')`로 검사. 5종 알림(sma5_break/touch/sell_signal/target_near/undervalued) 모두 적용.
  - **sma5_break / sma5_touch 경계 중복 수정**: 가격이 SMA5 ±1% 부근이면서 동시에 그 아래일 때 두 알림이 함께 발생하던 엣지 케이스 해소. `if-else if` 구조로 이탈 우선.
  - **지표 가용성 플래그**: `calculateIndicators` 응답에 `rsi_available`(≥15일), `macd_available`(≥26일), `bollinger_available`(≥20일), `history_days` 추가. UI는 `sma_available`과 동일 패턴으로 "데이터 수집 중" 안내를 표시할 수 있음.
- **12차 도메인 지식 기반 보완**:
  - **알림 메시지 템플릿 BACKEND.md 명시**: 5종 알림 각각의 실제 메시지 텍스트를 표로 정리. 신규 알림 추가 시 톤 일관성 유지 + 금지 표현 ("매도를 검토해 주세요" 등) 명시.
  - **cleanupOldData ↔ algorithm 추천 정합성 명세**: stock_analysis는 source 구분 없이 20일+ 삭제되므로 algorithm 추천은 매일 syncAllStocks로만 갱신됨. 의도된 동작임을 BACKEND.md에 명시.
  - **scoring.js 주석 강화**: "computeSMA는 helpers/sma.js에 있음 — 중복 정의 금지" 주석으로 LLM이 작업 시 이전 버전을 재참조해 중복 정의하는 위험 방지.
  - **portfolio/router.js import 경로 BACKEND.md 명시**: `import { computeSMA } from '../../helpers/sma.js'` 경로를 디렉토리 트리에 포함.
- **13차 PostgreSQL 전환 준비 + 배포 직전 UX 보완**:
  - **BACKEND.md "PostgreSQL 전환 가이드" 신설**: 영향 범위(better-sqlite3 178+ 호출, 동기 스코어링 6개, getStockData async 재작성, PRAGMA→information_schema, sma.js 시그니처 변경) + 단계별 11~13일 작업 + connection 사용 패턴 변경 예시.
  - **알림 빈도 가드 SQL을 SQLite/PostgreSQL 두 버전 표로 명시**: PG 전환 시 `'localtime'` → `AT TIME ZONE 'Asia/Seoul'::date` 교체를 놓치면 KST 자정 전후 오작동.
  - **dataFreshness 입력 형식 양립**: SQLite `"YYYY-MM-DD HH:MM:SS"`와 PostgreSQL ISO 8601 `"...Z"` 양쪽 처리 명세. `parseServerDate` 정규식 방식으로 자동 분기되어 코드 변경 불필요.
  - **공통 ErrorBanner 컴포넌트 신설**: 9번째 컴포넌트. PG 전환 후 DB 연결 실패 케이스가 늘어날 것을 대비해 페이지별 흩어진 에러 처리를 통일. DashboardPage / HoldingsAnalysisPage / MajorStocksPage 3곳에 우선 적용.
  - **서버 health 게이트 (App.tsx)**: 진입 시 `/api/health` 응답 전까지 본 UI 차단. checking / ok / timeout 3-state. 10초 AbortController. Render 콜드 스타트 + DB 다운 + 네트워크 단절 케이스 안전망. `VITE_API_BASE_URL` 환경변수 지원.
  - **추천 카드 placeholder 점수 숨김**: algorithm 추천의 score=50은 의미 없는 placeholder라 표시 자체를 제거. manual 추천만 편집자가 부여한 점수 표시.
  - **MajorStocksPage 삭제 확인 모달**: window.confirm 대신 모달. cascade 삭제 위험(보유·관심·알림) 명시.
  - **DashboardPage 차트 동적 색상**: 손실 상태(`avgProfitRate < 0`)면 라인·그라디언트가 빨간색으로 전환. 차트 위에 풀 날짜 범위 표시 ("1월 15일 ~ 2월 4일"). 툴팁도 풀 날짜로 표시.
  - **평단가 폼 초보자 레이블**: "매수가 (1주당 산 가격)" → "내가 산 평균 가격 (원)" + 평균 계산 예시 힌트 + 수량 출처 안내. HoldingsAnalysisPage·StockDetailView 양쪽 동기화.
- **14차 PostgreSQL 전환 Step 1~8 (Option B)**:
  - **`generateAlerts` 중복 함수 추출**: holders/watchers 루프 내부의 `hasDuplicate`/`dailyLimitReached` 클로저를 모듈 스코프 함수로 추출. 한쪽만 고쳐 불일치가 발생할 위험 제거 (로직-1). SQLite 상태에서도 적용 → PG 전환 시 한 곳만 async 변환하면 됨.
  - **`server/db/connection.js` → `pg.Pool`**: `query()`/`withTransaction(fn)` 헬퍼 export. Neon 무료 플랜 연결 수 제한 고려 `max: 5`, 5초 connection timeout.
  - **`server/db/schema.js` 재작성**: 이전 migrate.js로 추가되던 `eps_current`/`eps_previous`/`chart_path`/`source`/`category` 모두 초기 DDL에 내재화 (PG-1 해소). `INTEGER AUTOINCREMENT` → `BIGSERIAL`, `REAL` → `NUMERIC(10,4)`, `DATETIME` → `TIMESTAMPTZ DEFAULT NOW()`, `volume`은 `BIGINT`. FK에 `ON DELETE CASCADE` 추가.
  - **`server/db/migrate.js` 재작성**: `information_schema.columns` 기반 `columnExists()` 헬퍼로 PRAGMA 대체. SQLite `db.exec()` 멀티스테이트먼트 테이블 재생성(holding_stocks/watchlist)은 PG 신규 DB에서 불필요하므로 제거 (PG-2 해소). 신규 DB에서는 검증 로그만 출력하는 no-op에 가까움.
  - **`server/helpers/queryBuilder.js` 신설**: `buildSetClause(fields, startIndex)`/`buildWhereClause(conditions, startIndex)` 두 유틸. SQLite `?`는 순서 무관이지만 PG `$1, $2…`는 인덱스 추적이 필요. Step 10에서 screener(PG-4)와 PUT /api/holdings(PG-5) 동적 SQL에 활용 예정.
  - **`server/helpers/sma.js` async**: `computeSMA(pool, code)` 첫 인자 pool로 변경. pg NUMERIC 응답이 string이라 `Number()` 캐스팅 추가.
  - **스코어링 3개 async**: `calculateValuationScore`/`calculateTechnicalScore`/`calculateSupplyDemandScore`에 `async` + `await pool.query()` 적용. pg가 `NUMERIC`/`BIGINT`를 string으로 반환하므로 `per`/`pbr`/`volume`/`institution`/`foreign_net` 모두 `Number()` 캐스팅. `calculateTrendScore`와 `calculateHoldingOpinion`은 DB 미접근이라 동기 유지 (불필요한 async 오염 방지).
  - **`generateAlerts` async + KST SQL**: 모듈 스코프 `hasDuplicate`/`dailyLimitReached`/`insertAlert` 모두 async. 빈도 가드 SQL이 `DATE(created_at, 'localtime') = DATE('now', 'localtime')` → `(created_at AT TIME ZONE 'Asia/Seoul')::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`. 이 교체를 놓치면 KST 자정 전후 오작동.
  - **남은 Step 9~14**: `getStockData()` async + `withTransaction` 교체 (PG-3), 라우터 28개 전수 교체, BATCH_SIZE 5→3, Puppeteer 제거, 데이터 마이그레이션, dataFreshness 주석 업데이트. **현재 서버 기동 불가 — 다음 세션에서 완료해야 함**.
- 10점 통합 스코어링 (밸류에이션/기술지표/수급/추세)
- 수급: 가중 감쇠(decay=0.8), HoldingOpinion: SMA null 분기 명시화, `sma_available`(SMA5 5일 이상 가능 여부) API 응답 노출
- 알림: type별 쿨다운(48h/24h/12h), sell_signal은 이중 이탈 조건
- CORS 화이트리스트 + Rate limiting + PUT /api/holdings/:code (부분 수정)
- recalcWeights → domains/portfolio/service.js 추출
- recommended_stocks.fair_price ON CONFLICT 시 갱신 안 함 (최초 등록 후 고정). reason/score는 서버 재시작마다 코드 값으로 초기화 (data.js에 경고 주석)

### 3. 프론트엔드 개발
**기본 구조**: 7개 페이지 + 8개 컴포넌트 + 4개 도메인 스토어 + Toast
- 반응형: PC 사이드바 + 모바일 하단 탭바 5개(대시보드/포트폴리오/추천/알림/설정)
- 관심종목: 모바일은 포트폴리오 내 탭(A안), PC는 사이드바 독립 페이지 — 둘 다 `WatchlistContent` 공유

**투자 면책 + 온보딩**:
- 면책 고지 7곳: ① 면책 모달 ② 추천 페이지 상단 ③ 종목 상세 종합의견 박스 ④ 종목 상세 분석 하단 ⑤ 추천 카드 하단 ⑥ HoldingsAnalysisPage 주의필요/추가검토 뱃지 하단 ⑦ ScoringBreakdownPanel 상단
- HoldingOpinion 표시 라벨 소프트화: "매도" → "주의 필요", "추가매수" → "추가 검토" (내부 값 유지, 호환성 보존)
- ALERT_TYPE_LABELS 중립화: "매도 신호" → "가격 하락 경고", "매수 타이밍" → "가격 지지 알림" 등
- 온보딩 4단계: 면책 모달 → 종목 추가 안내 → 첫 종목 추가 인라인 가이드(1회) → 알림 패널 첫 진입 안내(1회). 대시보드 CTA는 재방문 시만
- **첫 종목 가이드 두 진입 경로 모두 지원**: HoldingsAnalysisPage 검색 폼 + StockDetailView 추가 폼. 후자는 add 직전 holdings 스냅샷 후 성공 시 `navigateTo('analysis', { focus: 'first-stock-guide' })`로 라우팅
- localStorage 키 4개: `disclaimer_accepted`, `onboarding_done`, `onboarding_first_stock_guided`, `onboarding_alerts_explained`

**스코어링/지표 시각화**:
- ScoringBreakdownPanel: 면책 문구 패널 상단 배치 → 4영역 게이지 바 + value/max 점수 텍스트 병기 (색각이상 대응) + 만점대비 비율(80/60/25%) 한국어 해석
- PER/PBR/ROE/RSI/MACD/볼린저/투자자동향 각 영역에 [?] 버튼 → HelpBottomSheet (8개 용어, 4단계 작성 기준)
- 차트 라인/캔들 토글, 업종 비교는 중앙값 기준

**보유종목/추천 UX**:
- holding_opinion 구체적 이유 + "상세 보기 →" 행동유도 링크. sma_available=false 시 "분석 중" 뱃지 (sma_available + holding_opinion 조합 검사 필수)
- 수익률 6구간 메시지 + 극단 구간(≥20%, ≤-7%)에 "종목 보기 →" 링크. 수익률 헤더에 [?] 인라인 팝오버 (계산식 + 예시)
- 추천 source accordion: reason 텍스트 + source별 신뢰도 설명
- **추천 카드 상승여력 표현**: "상승여력 +N%" → **"적정가 대비 현재가 괴리 +N%"** + "※ 이 수치는 실제 수익률이 아니에요" 면책. 애널리스트 목표가 기준은 "통상 6~12개월 기준" 안내 추가
- 스크리너 결과 상단 yellow 안내 + 활성 프리셋의 함정(`caveat`) 노출. 4개 프리셋 모두 caveat 정의됨
- StockDetailView PER 카드 하단 업종별 힌트 (IT/금융/바이오/에너지 4개 카테고리)
- 포트폴리오 집중도 >50% 카드 yellow 테두리 + 분산 투자 권유 안내
- **섹터 비교 백분위**: PER/PBR/ROE 각각 업종 내 백분위 → "상위 25% (✓ 우수한 편)" 등 4단계 해석. 단순 평균 비교보다 직관적
- **지표 가용성 폴백 UI**: RSI/MACD/볼린저 `*_available === false` 시 "⏳ 일부 지표는 데이터 수집 중이에요" 안내 카드 (필요 일수 - 현재 일수 = N일 후 표시 안내)
- **DashboardPage 수익률 카드 분리**: KOSPI 당일 변동률을 같은 줄이 아닌 별도 ℹ️ tooltip 라인으로 분리. 클릭 시 "KOSPI는 오늘 하루 변동률이에요. 내 수익률(매입 이후 전체 기간)과 직접 비교하기 어려워요" 인라인 팝오버. 카드 제목도 "수익률 (투자 대비 수익, **매입가 기준**)"으로 비교 기준 명시. KOSPI 데이터 미수신 시 tooltip 라인 자체 숨김

**데이터 표시 + 검색**:
- utils/dataFreshness.ts: parseServerDate() 헬퍼로 SQLite UTC를 명시 UTC 해석, KST 고정 변환. getDataFreshnessLabel/Short 통일
- 검색 드롭다운에 market_opinion 뱃지 (서버 search API에 LEFT JOIN 추가)
- 대시보드 수익률 카드: "₩원금 → ₩평가액 (가중 평균)" subtitle
- 재무제표 단위 "(단위: 억 원)" + 1조 이상 자동 포맷팅
- 투자자 매매동향 레이블 부연: "개인 투자자 (일반인)", "외국인 투자자 (해외)", "기관 투자자 (회사·펀드)" + 하단 해석 안내

**페이지 접근성**:
- Empty State: 포트폴리오(📊), 관심종목(👀), 알림(🔔) — 탭별 별도 디자인
- 대시보드/추천 페이지 하단: "전체 종목 보기" → MajorStocksPage
- 알림 패널 반응형: PC 드롭다운 / 모바일 전체 화면 모달 (스크롤 충돌 회피). 각 항목에 [지금 확인하기] / [나중에 볼게요] 버튼

**데이터 흐름**:
- StockDetailView 2단계 로딩: Phase1(가격/지표) await → Phase2(뉴스/재무/섹터) fire-and-forget + 스켈레톤
- useWatchlistStore: 30초 TTL 캐시. 삭제 실패 시 즉시 롤백 + 토스트
- useNavigationStore: pendingFocus + consumePendingFocus() — 페이지 진입 시 자동 포커스

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
- **Claude (claude.ai)**: 아키텍처 리뷰, 설계 문제점 파악, 도메인 지식 검토

## AI 미사용
프로젝트 기획, 투자 판단 기준, 디자인 방향, 데이터 소스 선택: 사용자 결정

---

## 기술 부채

| 항목 | 현황 | 계획 (Phase) |
|------|------|------|
| ~~라우트 잔존~~ | ~~server.js ~880줄~~ | ✅ 9~10차 분리 완료 (server.js 80줄 + 6개 라우터) |
| ~~cleanupOldData 시드 삭제~~ | ~~서버 20일+ 운영 시 시드 추천 사라짐~~ | ✅ 10차에서 `source != 'manual'` 가드 추가 |
| ~~알림 일일 빈도 가드~~ | ~~동일 종목 폭주 가능~~ | ✅ 11차에서 `DAILY_ALERT_LIMIT_PER_STOCK = 2` 적용 |
| ~~지표 가용성 플래그 부재~~ | ~~신규 종목·서버 초기에 RSI/MACD 부정확~~ | ✅ 11차에서 `*_available` 플래그 추가 |
| ~~computeSMA 도메인 의존성~~ | ~~portfolio → analysis 단방향 위배~~ | ✅ 11차에서 `helpers/sma.js`로 재이동 |
| device_id 보안 | CORS+Rate limit 적용 | **Phase 5**로 이동 (구독 도입 시점). HMAC + B안 강제 재등록 + 사용자 안내 화면 |
| **SQLite 블로킹** | **PostgreSQL 전환 Step 1~8 완료 (14차)**, Step 9~14 진행 중 | ✅ pg.Pool + schema/migrate/queryBuilder + 스코어링 3개 async + generateAlerts async + KST SQL · ⏳ getStockData async + 라우터 28개 교체 + 데이터 마이그레이션 |
| Puppeteer 의존 (toss.js) | Render에 Chromium 필요 | P2-3: stock_history OHLCV 기반 자체 차트 렌더링으로 대체 → toss.js 제거, chart_path 컬럼 삭제 |
| 스크래핑 의존 (네이버) | 핵심 데이터 네이버 스크래핑 | 장기: KIS/KRX 분리 평가 (시나리오 B 우선) |
| 알림 이중 발송 | 배치 알림만 존재 | P3-6: Push+배치 단일 파이프라인. 일 N건 빈도 가드는 이미 11차에서 적용 완료 |
| 스코어 임계값 검증 | 임시값(7/4점), 주석 추가됨 | P2-2: 적재 스크립트 즉시 작성 → P4: 백테스팅 |
| 공휴일 장중/장외 판단 | 평일 9~16시만 판단 | 공휴일 캘린더 통합 (Phase 3 후속) |
| 검색 LIKE 풀스캔 | 97종목에서 무시 가능 | 1000+ 시 FTS 인덱스 도입 |
| 번들 크기 측정 | 미측정 | P3-1: Recharts lazy import → 번들 측정 (rollup-plugin-visualizer). <250KB gzip 목표 |
| ~~앱스토어 분류 전략~~ | ~~잠정~~ | ✅ "Utilities" 결정 (Finance 심사 리스크 회피) |
| 섹터별 스코어링 가중치 | 바이오에 PER 밸류에이션 부적합 | P4: 섹터별 가중치 테이블 도입 |
| 에러 처리 분산 | 페이지마다 다른 에러 UI | ✅ 13차에서 ErrorBanner 공통 컴포넌트 + 3개 페이지 적용 |
| 빈 화면 노출 (콜드 스타트) | 서버 응답 전 빈 UI | ✅ 13차에서 `/api/health` 게이트 + 스플래시 화면 |
