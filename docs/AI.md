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
- **14차 PostgreSQL 전환 완료 + UI/UX 7건**:
  - **DB 레이어**: `connection.js` → `pg.Pool` (max 5, 5s timeout) + `query()`/`withTransaction()` 헬퍼. `schema.js` PG DDL (TIMESTAMPTZ/BIGSERIAL/NUMERIC, eps/category/source 내재화, FK `ON DELETE CASCADE`). `migrate.js` `information_schema.columns` 기반 검증(신규 DB는 no-op). `helpers/queryBuilder.js` 동적 플레이스홀더 `$1,$2…` (PG-4/5 해소).
  - **도메인 로직 async**: `helpers/sma.js`, `analysis/scoring.js` 3개(trend/holding은 DB 미접근 동기 유지), `analysis/indicators.js`, `alert/service.js`의 `generateAlerts`/`hasDuplicate`/`dailyLimitReached`/`insertAlert`. KST 빈도 가드 SQL `(created_at AT TIME ZONE 'Asia/Seoul')::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`. 중복 함수는 모듈 스코프로 추출(로직-1 해소).
  - **`getStockData()` 전면 재작성**: `withTransaction`로 stock_history/investor_history 2개 트랜잭션 교체 (PG-3 해소). 모든 스코어링 호출에 `await` + `pool` 전달. `generateAlerts(pool, ...)`. `CURRENT_TIMESTAMP` → `NOW()`. pg NUMERIC → `Number()` 캐스팅. API 에러 시 `buildFallback()`이 `market_opinion || '중립적'`로 보정(로직-2 해소).
  - **라우터 6개 × 28 엔드포인트 전부 async + `await query()` 전환**: alert/watchlist/system/portfolio/stock/analysis. `portfolio.PUT`과 `analysis.screener`의 동적 SQL은 `queryBuilder`로 플레이스홀더 번호 안전하게 조립. `stock.DELETE`는 `ON DELETE CASCADE` 의존으로 6줄 → 2줄 단순화.
  - **`data.js` → `registerInitialData(pool)`**: 모듈 최상위 부작용 제거, `server.js`의 top-level await에서 명시적 호출. 트랜잭션 2개(stocks/recommended_stocks)로 idle connection 최소화.
  - **`server.js` top-level await 재작성**: `initSchema → runMigrations → registerInitialData → setupCleanup(pool) → setupScheduler → app.listen` 순서. `scheduler.js`도 `setupCleanup(pool)`로 pool 주입, cleanupOldData async 화.
  - **Puppeteer 완전 제거**: `scrapers/toss.js` 삭제, `stock_analysis.chart_path` 컬럼 삭제, `StockDetailView`의 "토스증권 차트 캡처" 섹션 제거, `types/stock.ts`의 `chartPath` 필드 제거, `stock/router.js`의 `refresh` 엔드포인트 단순화. Render에서 Chromium 설치 불필요.
  - **BATCH_SIZE 5→3**: Neon 풀 5와 경합 회피 (stock/service.js). 로그 주기도 25→15로 조정.
  - **advice 문구 중립화 (5-7)**: "매수에 유리한 조건입니다" → "긍정적인 지표가 많아요", "분할매수 관점에서 접근을 권장합니다" → "지표를 직접 확인해보세요", "보수적 접근이 필요합니다" → "주의가 필요한 상태예요". 앱스토어 심사 대비 투자 권유 어조 제거.
  - **`alerts.source` 컬럼 (5-1)**: `'holding'`/`'watchlist'` 태깅. `generateAlerts`에서 holders는 항상 `'holding'`, watchers는 holderSet 조회로 결정. 프론트 `ALERT_TYPE_LABELS` 옆에 blue/purple 출처 뱃지 표시.
  - **UI/UX 보완 (초보자 대응)**:
    - DashboardPage 차트: 마지막 X축 라벨 "(오늘)" 표시, 보유종목 0개일 때 "📈 종목을 추가하면 수익률 그래프를..." CTA 폴백 + `onNavigate('analysis')` 버튼.
    - App.tsx: health timeout 메시지를 "서버가 깨어나는 중이에요. 약 30초 후 다시 시도해 주세요"로 구체화. health 응답의 `lastSync` 검사 → null이거나 24h+ 경과 시 amber 서브 배너 표시.
    - App.tsx 빈 검색 결과: "전체 종목 보기" + **"종목코드로 추가"** 2개 버튼 (SettingsPage 경로).
    - App.tsx 알림 패널: 각 알림에 `source` 뱃지, `created_at`을 `getDataFreshnessShort()` 포맷(“3분 전” 등)으로, 첫 진입 안내 카드에 "SMA 관련 알림은 보유 종목에만 발송돼요" 한 줄 추가.
    - `ErrorBanner`: `autoRetryMs` prop 추가. 동일 error 메시지당 1회만 자동 재시도(무한 루프 방지). DashboardPage에서 `autoRetryMs={3000}`로 Neon sleep 해제 대응.
    - RecommendationsPage 빈 상태: "지금 데이터를 분석 중이에요. 하루 1회 오전 8시에 갱신돼요."로 명시.
- **15차 (PG 후속 버그 수정 + UI/UX 6건)**:
  - **버그-3 (런타임 영향)**: `portfolio/router.js` GET/POST/PUT의 `calculateHoldingOpinion(h.avg_price, ...)` 호출이 pg NUMERIC string("70000")을 그대로 받아 손익률 계산이 깨지던 문제. `avgPriceNum`/`priceNum`을 별도 변수로 미리 캐스팅 후 전달.
  - **버그-5 (풀 경합)**: `stock/router.js` `/recommendations`가 최대 97종목을 `Promise.all`로 동시 호출 → 캐시 미스 시 각 `getStockData`의 `withTransaction`이 Neon 풀(max=5)을 소진. `RECOMMEND_BATCH_SIZE = 3`으로 직렬 배치 처리. `syncAllStocks`의 BATCH_SIZE=3 패턴과 일관성 유지.
  - **버그-1 (검증 누락)**: `migrate.js`의 `expectations`에 `stock_analysis` 테이블과 `alerts.source` 컬럼 검증 추가. SQLite → PG 마이그레이션 후 스키마 일관성 검증의 완전성 보강.
  - **버그-2 (타입 안전성)**: `Holding` 인터페이스에 `last_updated?: string` 추가. `DashboardPage`의 `(h as unknown as { last_updated?: string })` 강제 캐스팅 제거 → 정상적인 옵셔널 필드 접근으로 변경.
  - **불일치-4**: `dataFreshness.ts` 주석을 "PostgreSQL TIMESTAMPTZ (현재 기본) + SQLite 레거시 (마이그레이션 이전)" 양립 설명으로 갱신.
  - **5-1 (DashboardPage 보유종목 카드 현재가)**: 평단 옆에 "→ 현재: ₩{currentPrice}" 표시. 초보자가 가장 궁금해하는 "지금 가격"을 한눈에 비교 가능.
  - **5-2 (RecommendationsPage 평균 점수 왜곡)**: algorithm 추천은 `score=50` placeholder라 mixed 평균이 의미 없음. `source==='manual'`만 평균 + 라벨 "전문가 선정 평균 점수". manual이 0개면 `—` 표시.
  - **5-3 (App.tsx 알림 출처 폴백)**: `alert.source`가 `undefined`인 레거시 알림(15차 schema 변경 이전)에 slate `[알림]` 폴백 뱃지 추가. 뱃지 누락으로 인한 출처 혼란 해소.
  - **5-4 (DashboardPage 차트 손익 시각화)**: 평가금액 AreaChart 위에 `cost`(투자원금) 회색(`#94a3b8`) 파선 Line 오버레이 + Legend "평가금액 (현재 가치)"/"투자원금 (산 가격 합계)". value 라인이 cost 위면 수익, 아래면 손실 → "금액이 올랐는데 손해인가?" 혼동 해소. cost 필드는 이미 holdings/history API가 제공.
  - **5-5 (DashboardPage PieChart 단일 종목)**: `holdings.length === 1`이면 PieChart(원 1개로 무의미) 대신 단일 종목 카드 + amber "💡 종목을 2개 이상 추가하면 자산 배분 그래프를 볼 수 있어요. 한 종목에 집중하면 그 종목 하락 시 손실이 커져요." 분산 권유 박스.
  - **5-6 (사이드바 Premium Plan 카드 제거)**: 실제 구독 기능이 없는 시점에 "Premium Plan" 카드 + "구독 관리" 비활성 버튼이 사용자 혼란 유발 → Phase 5 도입 시점까지 사이드바에서 완전히 제거. CLAUDE.md Phase 5에 "사이드바 카드 복원" TODO 명시.
  - **로드맵 보완**: P3-1 배포 직전 체크리스트(7개 환경변수/빌드/마이그레이션), P3-2 CORS `ALLOWED_ORIGINS` 환경변수화, P3-3 Neon sleep 해제 backoff 재시도, P5-1 `device_id → user_id` B안(병합) 확정 + `users` 테이블 스키마 + `legacy_device_id` 컬럼, P5-2 JWT 저장소 localStorage + 1h 만료 결정.
- 10점 통합 스코어링 (밸류에이션/기술지표/수급/추세)
- 수급: 가중 감쇠(decay=0.8), HoldingOpinion: SMA null 분기 명시화, `sma_available`(SMA5 5일 이상 가능 여부) API 응답 노출
- 알림: type별 쿨다운(48h/24h/12h), sell_signal은 이중 이탈 조건
- CORS 화이트리스트 + Rate limiting + PUT /api/holdings/:code (부분 수정)
- recalcWeights → domains/portfolio/service.js 추출
- recommended_stocks.fair_price ON CONFLICT 시 갱신 안 함 (최초 등록 후 고정). reason/score는 서버 재시작마다 코드 값으로 초기화 (data.js에 경고 주석)

### 3. 프론트엔드 개발
**기본 구조**: 7개 페이지 + 9개 컴포넌트 (ErrorBanner는 `autoRetryMs` 지원) + 4개 도메인 스토어 + Toast
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
| **SQLite 블로킹** | ✅ **14차 완료** | pg.Pool + schema/migrate/queryBuilder + 스코어링/indicators/sma async + getStockData + `withTransaction` + 6개 라우터 28 엔드포인트 전수 교체 + BATCH_SIZE 5→3. 남은 작업: 데이터 마이그레이션 스크립트(TODO). |
| Puppeteer 의존 (toss.js) | ✅ **14차 완료** | `scrapers/toss.js` 삭제 + `chart_path` 컬럼 제거 + StockDetailView 캡처 UI 제거. stock_history OHLCV는 Recharts로 자체 렌더링. |
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
