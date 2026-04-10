# Backend Documentation

## 개요
- **진입점**: `server/server.js` (~900줄, 라우트) + `server/index.js` (래퍼)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식) → PostgreSQL 전환 예정
- **보안**: CORS 화이트리스트 + express-rate-limit (device_id 기준 120req/min)

### 디렉토리 구조
```
server/
├── server.js             # 라우트 28개 + recalcWeights (~900줄)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # DB 연결
│   ├── schema.js         # initSchema() — 8개 테이블 + 인덱스
│   └── migrate.js        # runMigrations() — 11개 마이그레이션
├── helpers/
│   ├── cache.js          # getCached/setCache/invalidateCache (10분 TTL)
│   └── deviceId.js       # getDeviceId/requireDeviceId
├── scrapers/
│   ├── naver.js          # mapToCategory, fetchPriceHistory, scrapeMainPage 등
│   └── toss.js           # captureChart (Puppeteer)
├── domains/
│   ├── analysis/
│   │   ├── scoring.js    # calculate*Score + calculateHoldingOpinion + median
│   │   └── indicators.js # calculateIndicators (RSI/MACD/볼린저)
│   ├── alert/
│   │   └── service.js    # generateAlerts + ALERT_COOLDOWNS
│   └── stock/
│       ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│       └── data.js       # topStocks (97개) + initialRecommendations (20개)
└── scheduler.js          # setupScheduler + setupCleanup
```

---

## DB 스키마 (8개 테이블)

### stocks
code(PK), name, category, price, change, change_rate, per(REAL), pbr, roe, target_price, eps_current, eps_previous, last_updated

### holding_stocks — 개인 데이터
device_id+code(PK), avg_price, weight, quantity, last_updated
> `holding_opinion`은 DB 미저장. API 응답 시 `calculateHoldingOpinion()`으로 런타임 계산.

### stock_analysis — market_opinion 전용
code(PK), analysis, advice, opinion(`긍정적`/`중립적`/`부정적`), toss_url, chart_path, created_at

### recommended_stocks
code(PK), reason, fair_price, score, source(`manual`/`algorithm`), created_at
> ON CONFLICT 시 fair_price는 갱신하지 않음 (최초 등록 값 고정)

### 기타 테이블
- **stock_history**: code+date(PK), OHLCV
- **investor_history**: code+date(PK), institution, foreign_net, individual
- **alerts**: id(PK), device_id, code, name, type, message, read, created_at
- **watchlist**: device_id+code(PK), added_at

---

## API 엔드포인트 (28개)

### 종목
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 (가격, 히스토리, 분석, `market_opinion`) |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 재수집 |
| GET | `/api/stocks` | 전체 종목 (`market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade) |
| GET | `/api/search?q=` | 검색 (최대 10건) |

### 포트폴리오
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 (`holding_opinion` + `market_opinion` 포함) |
| POST | `/api/holdings` | 신규 추가 (UPSERT) |
| PUT | `/api/holdings/:code` | 부분 수정 (avgPrice, quantity) |
| DELETE | `/api/holdings/:code` | 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (20일) |

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | 추천 종목 (`market_opinion === '긍정적'` 필터, `source` 포함) |
| GET | `/api/stock/:code/indicators` | RSI, MACD, 볼린저밴드 + 초보자 요약 |
| GET | `/api/stock/:code/volatility` | 변동성 |
| GET | `/api/stock/:code/financials` | 분기 재무제표 |
| GET | `/api/stock/:code/news` | 최근 뉴스 10건 |
| GET | `/api/stock/:code/chart/:tf` | 주봉/월봉 OHLCV |
| GET | `/api/screener` | 조건 필터링 (PER 필터 시 음수 자동 제외) |
| GET | `/api/sector/:cat/compare` | 섹터 비교 (averages + medians) |

### 알림/관심종목/기타
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/alerts` | 최근 50건 |
| GET | `/api/alerts/unread-count` | 미읽은 수 |
| POST | `/api/alerts/read` | 전체 읽음 |
| DELETE | `/api/alerts/:id` | 삭제 |
| GET/POST/DELETE | `/api/watchlist` | 관심종목 CRUD (`market_opinion` 포함) |
| GET | `/api/market/indices` | KOSPI/KOSDAQ |
| GET | `/api/health` | 서버 상태 |

---

## 분석 알고리즘

### HoldingOpinion (런타임, DB 미저장)
`calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)`:
- 손절(-7%) → 매도 (SMA 불필요)
- SMA5 null → 보유 (데이터 부족)
- 이중 이탈 → 매도 / 단기이탈+중기지지 → 관망
- SMA20 null → SMA5만으로 판단
- 5일선 근접 → 추가매수 / 정배열 → 보유

### MarketOpinion (10점 스코어링, DB 저장)
- **밸류에이션** (0~3): PER/PBR 섹터 중앙값 + PEG. 적자→0점. PEG 무효→재정규화.
- **기술지표** (0~3): RSI(30%, 30~50보정) + MACD(25%) + 볼린저(20%, %B/80) + 거래량(25%)
- **수급** (0~2): 외국인(max1.2) + 기관(max0.8), 10일 가중 감쇠(decay=0.8)
- **추세** (0~2): SMA5/SMA20 배열 상태
- 합산 ≥7: 긍정적, ≥4: 중립적, <4: 부정적

### 알림 쿨다운
| type | 쿨다운 |
|------|--------|
| sell_signal | 48h |
| sma5_break, sma5_touch, undervalued | 24h |
| target_near | 12h |

---

## 스케줄링
| 작업 | 주기 |
|------|------|
| syncAllStocks() | 서버 시작 5초 후 + 매일 08:00 |
| cleanupOldData() | 서버 시작 시 + 24시간마다 |
| 차트 캡처 | 종목 조회 시 (1시간 캐시) |

## 등록 종목: 97개 (8개 섹터)
## 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)
