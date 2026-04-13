# Backend Documentation

## 개요
- **진입점**: `server/server.js` (~90줄 — 컴포지션 루트 + top-level await 초기화) + `server/index.js` (래퍼)
- **포트**: 3001
- **DB**: **PostgreSQL (`pg` Pool)** — Neon 무료 플랜 권장, `DATABASE_URL` 환경변수 필수. 14차 전환 완료.
- **보안**: CORS 화이트리스트 + express-rate-limit (device_id 기준 120req/min)

### 디렉토리 구조
```
server/
├── server.js             # 컴포지션 루트 (~80줄, 라우트 정의 없음)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # pg.Pool + query()/withTransaction() 헬퍼
│   ├── schema.js         # async initSchema(pool) — 8개 테이블 PG DDL + 인덱스 (TIMESTAMPTZ/BIGSERIAL/NUMERIC)
│   └── migrate.js        # async runMigrations(pool) — information_schema 기반 컬럼 검증 (PG 신규 DB는 사실상 no-op)
├── helpers/
│   ├── cache.js          # getCached/setCache/invalidateCache (10분 TTL)
│   ├── deviceId.js       # getDeviceId/requireDeviceId
│   ├── sma.js            # async computeSMA(pool, code) — 도메인 간 의존성 회피용 공유 유틸
│   └── queryBuilder.js   # buildSetClause/buildWhereClause — PG 동적 플레이스홀더 ($1, $2...) 유틸
├── scrapers/
│   └── naver.js          # mapToCategory, scrapeMainPage, scrapeInvestorData 등 (Puppeteer toss.js는 14차에서 제거)
├── domains/
│   ├── analysis/
│   │   ├── scoring.js    # async calculate*Score (3개, DB 접근) + 동기 calculateHoldingOpinion/Trend + median (computeSMA는 helpers/sma.js에 있음 — 중복 정의 금지)
│   │   ├── indicators.js # async calculateIndicators(pool, code) — RSI/MACD/볼린저 + *_available 플래그
│   │   └── router.js     # 분석 라우터 (indicators/volatility/financials/news/chart/screener/sector — 7 endpoints, screener는 queryBuilder 사용)
│   ├── alert/
│   │   ├── service.js    # async generateAlerts + ALERT_COOLDOWNS — 알림 메시지는 모두 중립적 표현, `source` 태깅 ('holding'/'watchlist')
│   │   └── router.js     # 알림 라우터 (4 endpoints, async)
│   ├── portfolio/
│   │   ├── service.js    # async recalcWeights(pool, deviceId) (withTransaction)
│   │   └── router.js     # 포트폴리오 라우터 (5 endpoints, async, PUT은 buildSetClause 사용)
│   │                     #   import { computeSMA } from '../../helpers/sma.js'
│   │                     #   import { calculateHoldingOpinion } from '../analysis/scoring.js'
│   ├── watchlist/
│   │   └── router.js     # 관심종목 라우터 (3 endpoints, async)
│   ├── stock/
│   │   ├── service.js    # async getStockData + syncAllStocks (BATCH_SIZE=3) + scheduleDaily8AM
│   │   ├── data.js       # async registerInitialData(pool): topStocks (97개) + initialRecommendations (20개)
│   │   └── router.js     # 종목 라우터 (stock/stocks/search/recommendations — 7 endpoints, async). DELETE는 ON DELETE CASCADE 의존
│   └── system/
│       └── router.js     # 시스템 라우터 (health, market/indices — 2 endpoints, async)
└── scheduler.js          # setupScheduler + setupCleanup(pool) — async, pool 주입
```

### 라우터 마운트 (server.js)
```javascript
// path-prefix 라우터 (alerts/watchlist/holdings)는 prefix가 겹치지 않아 순서 무관
app.use('/api/alerts',    alertRouter);     // /api/alerts/*
app.use('/api/watchlist', watchlistRouter); // /api/watchlist/*
app.use('/api/holdings',  portfolioRouter); // /api/holdings/*

// '/api'에 직접 마운트되는 라우터는 specific path를 먼저 둬야 한다 —
// analysisRouter('/stock/:code/indicators')가 stockRouter('/stock/:code')에 가로채이지 않도록.
// systemRouter는 /health, /market/indices만 가져 stock/* 경로와 충돌하지 않으므로 제일 앞에 둬도 안전.
app.use('/api', systemRouter);   // /health, /market/indices (충돌 없음)
app.use('/api', analysisRouter); // /stock/:code/{indicators,volatility,financials,news,chart}, /screener, /sector
app.use('/api', stockRouter);    // /stock/:code, /stocks, /search, /recommendations
```
각 라우터는 `import { query, withTransaction } from '../../db/connection.js'`로 PG 헬퍼를 직접 import한다 (의존성 주입 없음 — 단순화 의도). `server.js`는 `await initSchema(pool)` → `await runMigrations(pool)` → `await registerInitialData(pool)` → `setupCleanup(pool)` → `setupScheduler()` → `app.listen()` 순서로 초기화한다 (top-level await ESM).

### computeSMA 위치 (helpers/sma.js)
SMA5/SMA20 계산은 `helpers/sma.js`의 `computeSMA(db, code)`에 둔다. 분석 도메인(`scoring.js`)에 두면 `portfolio → analysis` 방향의 도메인 의존성이 생기므로, 도메인 간 단방향 원칙을 지키기 위해 helpers/ 수준의 공유 유틸로 분리했다. 포트폴리오 라우터와 분석 도메인 양쪽에서 자유롭게 import 가능. `sma_available`은 `sma5 !== null` (히스토리 ≥5일).

---

## DB 스키마 (8개 테이블)

**stocks**: code(PK), name, category, price, change, change_rate, per, pbr, roe, target_price, eps_current, eps_previous, last_updated. `change`/`change_rate`는 16차부터 `stock/service.js`에서 최근 2거래일 종가 비교로 실제 계산 (이전엔 `"0"`/`"0.00"` 하드코딩).
**holding_stocks**: device_id+code(PK), avg_price(**NUMERIC(14,2)** — 16차 설계-A에서 INTEGER에서 변경, 분할 매수 평균 소수점 보존), weight, quantity, last_updated — `holding_opinion`은 DB 미저장, API 응답 시 런타임 계산. pg 드라이버가 NUMERIC을 string으로 반환하므로 라우터/service 응답 직전 `Number()` 캐스팅 필수 (calculateHoldingOpinion 전달 시도 포함).
**stock_history**: code+date(PK), price, open, high, low, volume
**stock_analysis**: code(PK, FK ON DELETE CASCADE), analysis, advice, opinion(MarketOpinion 전용), toss_url, created_at. `chart_path` 컬럼은 Puppeteer 제거와 함께 삭제됨.
**recommended_stocks**: code(PK), reason, fair_price, score, source(`manual`/`algorithm`), created_at
> **ON CONFLICT 정책 (data.js 시드 시)**: 서버 재시작마다
> - `reason`/`score`: 코드 값으로 **덮어씀** (운영자가 코드에서 관리)
> - `fair_price`: **최초 등록 후 고정** (시세와 무관, DB 값 유지)
> - `source`: `COALESCE`로 기존 값 우선 (algorithm으로 변경된 경우 보존)
> - DB 직접 수정한 reason/score는 서버 재시작 시 초기화됨 (의도된 동작)
**investor_history**: code+date(PK), institution, foreign_net, individual
**alerts**: id(BIGSERIAL PK), device_id, code, name, type, **source**(`holding`/`watchlist`), message, read, created_at — `source`는 UI에서 "보유 중"/"관심 종목" 뱃지로 표시 (14차).
**watchlist**: device_id+code(PK), added_at

---

## API 엔드포인트 (28개, 6개 라우터)

### 종목
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 (`market_opinion`, last_updated 포함) |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 재수집 |
| GET | `/api/stocks` | 전체 종목 (`market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade) |
| GET | `/api/search?q=` | 검색 (최대 10건, `market_opinion` LEFT JOIN). 인덱스: stocks/stock_analysis 모두 PK 기반, 97종목 규모에서 풀스캔 무시 가능. 1000+ 시 FTS 검토 |

### 포트폴리오 (모든 엔드포인트에 `requireDeviceId` 적용)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 (`holding_opinion` + `market_opinion` + `sma_available` 포함). **`sma_available` 정의**: SMA5 계산 가능 여부 (`stock_history` 5일 이상 → true). `sma_available=false`이면 `holding_opinion`은 항상 `'보유'`로 반환되지만 신뢰할 수 없으므로 UI는 `sma_available`을 우선 검사해 "분석 중" 뱃지를 표시해야 한다 (값만 보고 "보유 신호"로 해석 금지). 3rd party 클라이언트는 두 필드를 함께 검사할 것. |
| POST | `/api/holdings` | 신규 추가 (UPSERT) |
| PUT | `/api/holdings/:code` | 부분 수정 (avgPrice, quantity). 미보유 시 404 |
| DELETE | `/api/holdings/:code` | 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (20일) |

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | `market_opinion === '긍정적'` 필터, `source` 포함 |
| GET | `/api/stock/:code/indicators` | RSI, MACD, 볼린저 + 초보자 요약. **계산 가능 여부 플래그 동봉**: `rsi_available`(히스토리 ≥15일), `macd_available`(≥26일), `bollinger_available`(≥20일), `history_days`. UI는 플래그가 false일 때 "데이터 수집 중" 안내를 표시해야 한다 (sma_available과 동일 패턴) |
| GET | `/api/stock/:code/volatility` | 변동성 |
| GET | `/api/stock/:code/financials` | 분기 재무제표 |
| GET | `/api/stock/:code/news` | 뉴스 10건 |
| GET | `/api/stock/:code/chart/:tf` | 주봉/월봉 OHLCV |
| GET | `/api/screener` | 조건 필터 (PER 필터 시 음수 자동 제외) |
| GET | `/api/sector/:cat/compare` | 섹터 비교 (averages + medians) |

### 알림/관심종목/기타
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/DELETE | `/api/alerts`, `/api/alerts/:id` | 알림 CRUD |
| GET | `/api/alerts/unread-count` | 미읽은 수 |
| POST | `/api/alerts/read` | 전체 읽음 |
| GET/POST/DELETE | `/api/watchlist` | 관심종목 CRUD (`market_opinion` 포함) |
| GET | `/api/market/indices` | KOSPI/KOSDAQ |
| GET | `/api/health` | 서버 상태 |

---

## 분석 알고리즘

### HoldingOpinion (런타임, DB 미저장)
`calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)`:
1. 손절(-7%) → 매도 (SMA 불필요)
2. SMA5 null → 보유 (판단 불가)
3. 이중 이탈 → 매도 / 단기이탈+중기지지 → 관망
4. SMA20 null → SMA5만으로 판단 (관망/추가매수/보유)
5. 5일선 근접 → 추가매수 / 정배열 → 보유

### MarketOpinion (10점, DB 저장)
- **밸류에이션** (0~3): PER/PBR 섹터 중앙값 + PEG. 적자→0점+`per_negative`. PEG 무효→재정규화. 섹터 <5종목→`low_confidence`
- **기술지표** (0~3): RSI(30%, 30~50보정) + MACD(25%) + 볼린저(20%, %B/80) + 거래량(25%)
- **수급** (0~2): 감쇠 방식으로 스코어 계산 (연속 매수일 카운트는 스코어에 사용 안 함, UI 표시용)
  - 스코어: 최근 10일 순매수일에 `0.8^i` 가중치 부여 → 정규화(`weighted/maxWeighted`)
  - 외국인 `normalized * 1.2`(max 1.2) + 기관 `normalized * 0.8`(max 0.8)
  - `detail.foreignConsecutive`, `detail.instConsecutive`: 연속 매수일 카운트 (UI용)
- **추세** (0~2): SMA5/SMA20 배열 (정배열 2.0, 5일선위+역배열 1.0, 20일선위 0.5, 아래 0.0)
- 합산 ≥7 긍정적, ≥4 중립적, <4 부정적 (임시 임계값 — Phase 4 백테스팅 후 최적화 예정)

### 알림 쿨다운 + 일일 빈도 제어
| type | 설명 | 쿨다운 | 메시지 템플릿 (중립적 표현 — 신규 알림 추가 시 이 톤 유지) |
|------|------|--------|----------|
| sell_signal | 5일선+20일선 이중 이탈 | 48h | "{name}({code}) 주가가 5일·20일 평균 모두 아래로 내려갔어요. 하락 추세이니 주의가 필요해요." |
| sma5_break | 5일선 이탈 | 24h | "{name}({code}) 주가가 5일 평균({sma5}원) 아래로 내려갔어요. 단기 하락 흐름이에요." |
| sma5_touch | 5일선 근접 지지 | 24h | "{name}({code}) 주가가 5일 평균({sma5}원) 부근에서 지지받고 있어요." |
| target_near | 목표가 95% 도달 | 12h | "{name}({code}) 현재가({price}원)가 목표가({target}원)에 근접했어요." |
| undervalued | 목표가 대비 30%+ 저평가 | 24h | "{name}({code}) 현재가가 목표가 대비 30% 이상 낮은 수준이에요. 분석 결과를 확인해보세요." |

> **금지 표현**: "매도를 검토해 주세요", "매수 타이밍입니다", "추가매수 권장" 등 명령조 / 거래 권유 어조. 모두 서술형·관찰형으로 작성.

**일일 알림 한도** (`DAILY_ALERT_LIMIT_PER_STOCK = 2`): 동일 device_id × 동일 종목당 KST 기준 하루 최대 2건. 모든 INSERT 직전에 SQL로 카운트 검사. 쿨다운 + 빈도 가드 둘 다 통과해야 발송된다. Push 파이프라인 도입 시 동일 가드를 재사용한다.

```sql
-- PostgreSQL 빈도 가드 (KST 날짜 기준)
SELECT COUNT(*)::int AS cnt FROM alerts
WHERE device_id = $1 AND code = $2
  AND (created_at AT TIME ZONE 'Asia/Seoul')::date
      = (NOW() AT TIME ZONE 'Asia/Seoul')::date
```

> `TIMESTAMPTZ AT TIME ZONE 'Asia/Seoul'` → `::date` 캐스팅으로 KST 날짜 기준 카운트. SQLite의 `DATE(created_at, 'localtime')` 패턴을 대체한다.

**알림 출처 (`source`)**: `alerts.source` 컬럼에 `'holding'` 또는 `'watchlist'`가 저장된다. 동일 device_id에 대해 해당 종목을 보유 중이면 `'holding'`, 관심 목록만 있으면 `'watchlist'`. sma5_break/sma5_touch/sell_signal은 보유 종목(=holders)에만 발송되므로 항상 `'holding'`. target_near/undervalued는 watchers 루프에서 holderSet 조회 후 결정.

**sma5_break / sma5_touch 경계 처리**: 가격이 정확히 SMA5 부근(±1%)이면서 동시에 그 아래일 때 두 알림이 동시 발생하지 않도록, 우선순위는 **이탈(부정적) > 지지(긍정적)**. `if-else if` 구조로 break가 발생하면 touch는 발생시키지 않는다.

---

## 스케줄링
| 작업 | 주기 |
|------|------|
| syncAllStocks() | 서버 시작 5초 후 (실패 시 30초 backoff 1회 재시도 — 16차 버그-D) + 매일 08:00. BATCH_SIZE=3, Neon 풀 크기 고려 |
| cleanupOldData() | 서버 시작 시 + 24시간마다 (pool 주입) |

> **cleanupOldData 범위**: `stock_analysis`와 `recommended_stocks`의 20일+ 데이터만 삭제.
> `stock_history`와 `investor_history`는 삭제하지 않음 — 차트, 기술지표, 수급 스코어링에 과거 데이터 필요.
> **시드 보존**: `recommended_stocks`는 `source != 'manual'` 조건으로만 삭제. `data.js`의 initialRecommendations는 ON CONFLICT가 `created_at`을 갱신하지 않아, 이 가드가 없으면 서버 20일+ 무중단 운영 시 시드 추천이 통째로 사라진다 (실제 발견된 버그).
> **stock_analysis ↔ algorithm 추천 정합성 (의도된 동작)**: `stock_analysis`는 source 구분 없이 20일+ 행을 삭제한다. 이로 인해 `GET /api/recommendations`에서 `source='algorithm'` 추천(market_opinion='긍정적' 필터링)은 매일 `syncAllStocks`로 stock_analysis가 갱신돼야만 표시된다. 즉 알고리즘 추천은 **매일 갱신을 전제로 하는 일회성 캐시**이고, 수동 추천(`source='manual'`)만 영구 보존된다. 새 알고리즘 추천 종목이 갱신 사이클에 빠지면 다음 sync까지 추천 목록에서 사라질 수 있음 — 이는 의도된 동작.

## 데이터
- 등록 종목: 97개 (8개 섹터)
- 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)

---

## PostgreSQL 레이어 (14차 전환 완료)

### Connection 패턴
```javascript
import pool, { query, withTransaction } from './db/connection.js';

// 단일 쿼리
const { rows } = await query('SELECT * FROM stocks WHERE code = $1', [code]);

// 트랜잭션
await withTransaction(async (client) => {
    await client.query('INSERT INTO stock_history ...', [...]);
    await client.query('UPDATE stocks SET ...', [...]);
});
```

### 초기화 순서 (server.js top-level await)
```javascript
await initSchema(pool);           // CREATE TABLE IF NOT EXISTS (멱등)
await runMigrations(pool);        // information_schema 기반 검증
await registerInitialData(pool);  // stocks + recommended_stocks 시드 (ON CONFLICT)
setupCleanup(pool);               // 20일+ 데이터 정리 (pool 주입)
setupScheduler();                 // syncAllStocks 5초 후 + 매일 08:00
app.listen(PORT);
```

### 주요 설계 결정
- **풀 크기**: `max: 5` (Neon 무료 플랜 연결 제한 고려). `BATCH_SIZE = 3`으로 병렬 `getStockData` 동시성을 제한해 트랜잭션 connection 경합 회피.
- **ON DELETE CASCADE**: `holding_stocks`, `watchlist`, `recommended_stocks`, `stock_analysis`가 `stocks(code)`를 참조. `DELETE FROM stocks WHERE code = $1` 하나로 cascade 삭제. `stock_history`/`investor_history`는 FK 없이 수동 삭제 (대량 데이터 cascade 회피).
- **BIGSERIAL / BIGINT**: `alerts.id`, `investor_history.institution/foreign_net/individual`, `stock_history.volume`. 거래량·누적 순매수가 INT32 범위를 초과할 수 있다.
- **NUMERIC(10,4) / NUMERIC(14,4)**: `per`, `pbr`, `roe`, `eps_current`, `eps_previous`. pg 드라이버는 `NUMERIC`을 string으로 반환하므로 라우터/service에서 `Number()` 캐스팅 필수.
- **NULLS LAST**: PostgreSQL은 기본 NULLS LAST가 ASC, NULLS FIRST가 DESC. `ORDER BY s.roe DESC NULLS LAST`를 명시해 SQLite와 동일한 결과 보장.
- **Puppeteer 제거**: `chart_path` 컬럼 + `scrapers/toss.js` + `StockDetailView`의 토스 차트 캡처 UI를 모두 제거. Render 환경에서 Chromium 설치가 불필요해짐.

### TIMESTAMPTZ 정책 (dataFreshness 호환성)
- 모든 timestamp 컬럼은 `TIMESTAMPTZ` — 클라이언트에 ISO 8601 (`Z` 접미사 포함)으로 직렬화.
- 프론트의 `parseServerDate()`는 SQLite 형식과 ISO 8601 양쪽을 모두 처리.

### 데이터 마이그레이션 (TODO)
- SQLite `stocks.db` 덤프 → PG 임포트 스크립트 작성 예정
- 현재는 빈 스키마로만 기동 가능 (첫 `syncAllStocks` 실행 후 97종목이 DB에 채워짐)

### CORS 환경변수 (16차 버그-E)
`server.js`의 `ALLOWED_ORIGINS`는 dev origin 5개 + `process.env.FRONTEND_URL`을 콤마로 분해해 자동 포함한다.
```bash
# 단일 도메인
FRONTEND_URL=https://stock-analyzer.vercel.app
# 다중 도메인 (staging + production)
FRONTEND_URL=https://staging.vercel.app,https://stock-analyzer.vercel.app
```
이 변수를 Render에 설정하지 않으면 배포 직후 프론트엔드 API 호출이 CORS 차단된다.

### 장기 데이터 적재 (`scripts/backfill-history.js`, 16차)
`DATABASE_URL` 환경변수와 함께 실행. 주요 옵션:
```bash
node scripts/backfill-history.js                # 기본 3년치 전체 97종목
node scripts/backfill-history.js --days 365     # 1년치로 제한
node scripts/backfill-history.js --limit 20     # 하루 20종목씩 분할
node scripts/backfill-history.js --resume       # 이전 체크포인트부터 이어받기
```
- 종목당 네이버 fchart 1회 호출 + 종목 간 1초 딜레이 (rate limit 회피)
- `scripts/.backfill-state.json`에 완료된 종목 코드 배열 저장 → 실패 시 `--resume`로 이어받기
- 97종목 × 750거래일 ≈ 72,750행 × ~80B ≈ 6MB (Neon 무료 플랜 0.5GB 기준 여유 있음)
