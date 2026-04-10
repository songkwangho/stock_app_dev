# Backend Documentation

## 개요
- **진입점**: `server/server.js` (~880줄, 라우트 28개) + `server/index.js` (래퍼)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식) → PostgreSQL 전환 예정
- **보안**: CORS 화이트리스트 + express-rate-limit (device_id 기준 120req/min)

### 디렉토리 구조
```
server/
├── server.js             # 라우트 28개 (~880줄)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # DB 연결
│   ├── schema.js         # initSchema() — 8개 테이블 + 인덱스
│   └── migrate.js        # runMigrations() — 11개 마이그레이션
├── helpers/
│   ├── cache.js          # getCached/setCache/invalidateCache (10분 TTL)
│   └── deviceId.js       # getDeviceId/requireDeviceId
├── scrapers/
│   ├── naver.js          # mapToCategory, scrapeMainPage, scrapeInvestorData 등
│   └── toss.js           # captureChart (Puppeteer)
├── domains/
│   ├── analysis/
│   │   ├── scoring.js    # calculate*Score + calculateHoldingOpinion + median
│   │   └── indicators.js # calculateIndicators (RSI/MACD/볼린저)
│   ├── alert/
│   │   └── service.js    # generateAlerts + ALERT_COOLDOWNS
│   ├── portfolio/
│   │   └── service.js    # recalcWeights
│   └── stock/
│       ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│       └── data.js       # topStocks (97개) + initialRecommendations (20개)
└── scheduler.js          # setupScheduler + setupCleanup
```

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

## API 엔드포인트 (28개)

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
| GET | `/api/holdings` | 보유종목 (`holding_opinion` + `market_opinion` + `sma_available` 포함). `sma_available=false`면 holding_opinion 신뢰 불가, UI에서 "분석 중" 표시 |
| POST | `/api/holdings` | 신규 추가 (UPSERT) |
| PUT | `/api/holdings/:code` | 부분 수정 (avgPrice, quantity). 미보유 시 404 |
| DELETE | `/api/holdings/:code` | 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (20일) |

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | `market_opinion === '긍정적'` 필터, `source` 포함 |
| GET | `/api/stock/:code/indicators` | RSI, MACD, 볼린저 + 초보자 요약 |
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

### 알림 쿨다운
| type | 설명 | 쿨다운 |
|------|------|--------|
| sell_signal | 5일선+20일선 이중 이탈 | 48h |
| sma5_break | 5일선 이탈 | 24h |
| sma5_touch | 5일선 근접 지지 | 24h |
| target_near | 목표가 95% 도달 | 12h |
| undervalued | 목표가 대비 30%+ 저평가 | 24h |

---

## 스케줄링
| 작업 | 주기 |
|------|------|
| syncAllStocks() | 서버 시작 5초 후 + 매일 08:00 |
| cleanupOldData() | 서버 시작 시 + 24시간마다 |
| 차트 캡처 | 종목 조회 시 (1시간 캐시) |

> **cleanupOldData 범위**: `stock_analysis`와 `recommended_stocks`의 20일+ 데이터만 삭제.
> `stock_history`와 `investor_history`는 삭제하지 않음 — 차트, 기술지표, 수급 스코어링에 과거 데이터 필요.

## 데이터
- 등록 종목: 97개 (8개 섹터)
- 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)
