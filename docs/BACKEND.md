# Backend Documentation

## 개요
- **진입점**: `server/server.js` (~80줄 — 컴포지션 루트, 5개 도메인 라우터 마운트) + `server/index.js` (래퍼)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식) → PostgreSQL 전환 예정
- **보안**: CORS 화이트리스트 + express-rate-limit (device_id 기준 120req/min)

### 디렉토리 구조
```
server/
├── server.js             # 컴포지션 루트 (~80줄, 라우트 정의 없음)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # DB 연결
│   ├── schema.js         # initSchema() — 8개 테이블 + 인덱스
│   └── migrate.js        # runMigrations() — 11개 마이그레이션
├── helpers/
│   ├── cache.js          # getCached/setCache/invalidateCache (10분 TTL)
│   ├── deviceId.js       # getDeviceId/requireDeviceId
│   └── sma.js            # computeSMA(db, code) — 도메인 간 의존성 회피용 공유 유틸
├── scrapers/
│   ├── naver.js          # mapToCategory, scrapeMainPage, scrapeInvestorData 등
│   └── toss.js           # captureChart (Puppeteer)
├── domains/
│   ├── analysis/
│   │   ├── scoring.js    # calculate*Score + calculateHoldingOpinion + median (computeSMA는 helpers/sma.js에 있음 — 중복 정의 금지)
│   │   ├── indicators.js # calculateIndicators (RSI/MACD/볼린저 + *_available 플래그)
│   │   └── router.js     # 분석 라우터 (indicators/volatility/financials/news/chart/screener/sector — 7 endpoints)
│   ├── alert/
│   │   ├── service.js    # generateAlerts + ALERT_COOLDOWNS — 알림 메시지는 모두 중립적 표현
│   │   └── router.js     # 알림 라우터 (4 endpoints)
│   ├── portfolio/
│   │   ├── service.js    # recalcWeights
│   │   └── router.js     # 포트폴리오 라우터 (5 endpoints)
│   │                     #   import { computeSMA } from '../../helpers/sma.js'
│   │                     #   import { calculateHoldingOpinion } from '../analysis/scoring.js'
│   ├── watchlist/
│   │   └── router.js     # 관심종목 라우터 (3 endpoints)
│   ├── stock/
│   │   ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │   ├── data.js       # topStocks (97개) + initialRecommendations (20개)
│   │   └── router.js     # 종목 라우터 (stock/stocks/search/recommendations — 7 endpoints)
│   └── system/
│       └── router.js     # 시스템 라우터 (health, market/indices — 2 endpoints)
└── scheduler.js          # setupScheduler + setupCleanup
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
각 라우터는 `import db from '../../db/connection.js'`로 DB를 직접 import한다 (의존성 주입 없음 — 단순화 의도).

### computeSMA 위치 (helpers/sma.js)
SMA5/SMA20 계산은 `helpers/sma.js`의 `computeSMA(db, code)`에 둔다. 분석 도메인(`scoring.js`)에 두면 `portfolio → analysis` 방향의 도메인 의존성이 생기므로, 도메인 간 단방향 원칙을 지키기 위해 helpers/ 수준의 공유 유틸로 분리했다. 포트폴리오 라우터와 분석 도메인 양쪽에서 자유롭게 import 가능. `sma_available`은 `sma5 !== null` (히스토리 ≥5일).

---

## DB 스키마 (8개 테이블)

**stocks**: code(PK), name, category, price, change, change_rate, per, pbr, roe, target_price, eps_current, eps_previous, last_updated
**holding_stocks**: device_id+code(PK), avg_price, weight, quantity, last_updated — `holding_opinion`은 DB 미저장, API 응답 시 런타임 계산
**stock_history**: code+date(PK), price, open, high, low, volume
**stock_analysis**: code(PK), analysis, advice, opinion(MarketOpinion 전용), toss_url, chart_path, created_at
**recommended_stocks**: code(PK), reason, fair_price, score, source(`manual`/`algorithm`), created_at
> **ON CONFLICT 정책 (data.js 시드 시)**: 서버 재시작마다
> - `reason`/`score`: 코드 값으로 **덮어씀** (운영자가 코드에서 관리)
> - `fair_price`: **최초 등록 후 고정** (시세와 무관, DB 값 유지)
> - `source`: `COALESCE`로 기존 값 우선 (algorithm으로 변경된 경우 보존)
> - DB 직접 수정한 reason/score는 서버 재시작 시 초기화됨 (의도된 동작)
**investor_history**: code+date(PK), institution, foreign_net, individual
**alerts**: id(PK), device_id, code, name, type, message, read, created_at
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

**일일 알림 한도** (`DAILY_ALERT_LIMIT_PER_STOCK = 2`): 동일 device_id × 동일 종목당 KST 기준 하루 최대 2건. 모든 INSERT 직전에 `SELECT COUNT(*) ... DATE(created_at, 'localtime') = DATE('now', 'localtime')`로 검사. 쿨다운 + 빈도 가드 둘 다 통과해야 발송된다. Push 파이프라인 도입 시 동일 가드를 재사용한다.

**sma5_break / sma5_touch 경계 처리**: 가격이 정확히 SMA5 부근(±1%)이면서 동시에 그 아래일 때 두 알림이 동시 발생하지 않도록, 우선순위는 **이탈(부정적) > 지지(긍정적)**. `if-else if` 구조로 break가 발생하면 touch는 발생시키지 않는다.

---

## 스케줄링
| 작업 | 주기 |
|------|------|
| syncAllStocks() | 서버 시작 5초 후 + 매일 08:00 |
| cleanupOldData() | 서버 시작 시 + 24시간마다 |
| 차트 캡처 | 종목 조회 시 (1시간 캐시) |

> **cleanupOldData 범위**: `stock_analysis`와 `recommended_stocks`의 20일+ 데이터만 삭제.
> `stock_history`와 `investor_history`는 삭제하지 않음 — 차트, 기술지표, 수급 스코어링에 과거 데이터 필요.
> **시드 보존**: `recommended_stocks`는 `source != 'manual'` 조건으로만 삭제. `data.js`의 initialRecommendations는 ON CONFLICT가 `created_at`을 갱신하지 않아, 이 가드가 없으면 서버 20일+ 무중단 운영 시 시드 추천이 통째로 사라진다 (실제 발견된 버그).
> **stock_analysis ↔ algorithm 추천 정합성 (의도된 동작)**: `stock_analysis`는 source 구분 없이 20일+ 행을 삭제한다. 이로 인해 `GET /api/recommendations`에서 `source='algorithm'` 추천(market_opinion='긍정적' 필터링)은 매일 `syncAllStocks`로 stock_analysis가 갱신돼야만 표시된다. 즉 알고리즘 추천은 **매일 갱신을 전제로 하는 일회성 캐시**이고, 수동 추천(`source='manual'`)만 영구 보존된다. 새 알고리즘 추천 종목이 갱신 사이클에 빠지면 다음 sync까지 추천 목록에서 사라질 수 있음 — 이는 의도된 동작.

## 데이터
- 등록 종목: 97개 (8개 섹터)
- 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)
