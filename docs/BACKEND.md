# Backend Documentation

## 개요
- **진입점**: `server/server.js` (~1,230줄, 라우트 + getStockData) + `server/index.js` (래퍼)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식) → PostgreSQL 전환 예정
- **데이터 소스**: 공식 API 우선 + 네이버 증권 보조 스크래핑 + 토스증권 Puppeteer 캡처
- **사용자 식별**: `X-Device-Id` 헤더 기반 (로그인 없음)
- **보안**: CORS 화이트리스트 + express-rate-limit (device_id 기준 120req/min)

### 도메인 분리 구조 (구현 완료)
```
server/
├── server.js             # 라우트 23개 + getStockData + syncAllStocks (~1,230줄)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # DB 연결
│   ├── schema.js         # initSchema() — 8개 테이블 + 인덱스
│   └── migrate.js        # runMigrations() — 11개 마이그레이션 블록
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
│       └── data.js       # topStocks (97개) + initialRecommendations (20개)
└── scheduler.js          # setupScheduler + setupCleanup
```

> **미분리 잔존**: `getStockData()` (인라인 Naver API 호출 포함), `syncAllStocks()`, `recalcWeights()`, 23개 라우트 핸들러
> 향후 `domains/stock/service.js`, `domains/portfolio/router.js` 등으로 추가 분리 가능

---

## 미들웨어 스택

### CORS 화이트리스트
```javascript
const ALLOWED_ORIGINS = [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:4173',  // Vite preview
    'http://localhost:3000',  // alternative dev
    'capacitor://localhost',  // Capacitor iOS
    'http://localhost',       // Capacitor Android
];
// origin이 없는 요청(모바일 앱, curl 등)도 허용
```

### Rate Limiting
```javascript
// express-rate-limit: device_id 기준 120req/min
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
});
app.use('/api/', apiLimiter);
```

---

## 사용자 식별 (device_id)

### 구현
- `getDeviceId(req)` 헬퍼: `req.headers['x-device-id']` 에서 추출
- `requireDeviceId(req, res)` 래퍼: 없으면 400 에러 반환
- 개인 데이터 테이블: `holding_stocks`, `watchlist`, `alerts`
- 공용 데이터 테이블: `stocks`, `stock_history`, `stock_analysis`, `recommended_stocks`, `investor_history`

### 보안 강화 계획
- **HMAC 서명**: device_id 생성 시 서버 시크릿으로 서명 → 위변조 탐지
- **HTTPS**: 프로덕션 배포 시 필수

### 영향받는 API
| API | 변경 내용 |
|-----|----------|
| GET/POST/DELETE `/api/holdings` | device_id로 필터/삽입 + `holding_opinion` 런타임 계산 반환 |
| GET `/api/holdings/history` | device_id로 보유종목 조회 |
| GET `/api/recommendations` | device_id로 보유종목 제외 필터 |
| GET/POST/DELETE `/api/watchlist` | device_id로 필터/삽입 |
| GET/DELETE `/api/alerts` | device_id로 필터 |
| GET `/api/alerts/unread-count` | device_id로 필터 |
| POST `/api/alerts/read` | device_id로 필터 |
| `generateAlerts()` | device_id별 보유종목 기반 알림 생성 |

---

## 데이터베이스 스키마

### stocks (종목 마스터)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK | 종목코드 (6자리) |
| name | TEXT | 종목명 |
| category | TEXT | 업종 (8개 카테고리) |
| price | INTEGER | 현재가 |
| change | TEXT | 전일 대비 변동 |
| change_rate | TEXT | 변동률 |
| per | REAL | PER (음수 가능 — 적자 기업) |
| pbr | REAL | PBR |
| roe | REAL | ROE |
| target_price | INTEGER | 애널리스트 목표가 |
| eps_current | REAL | 최신 연도 EPS (PEG 계산용) |
| eps_previous | REAL | 전년도 EPS (PEG 계산용) |
| last_updated | DATETIME | 최종 갱신 시각 |

### holding_stocks (포트폴리오) - 개인 데이터
| 컬럼 | 타입 | 설명 |
|------|------|------|
| device_id | TEXT | 기기 식별자 |
| code | TEXT (FK→stocks) | 종목코드 |
| avg_price | INTEGER | 평균 매수가 |
| weight | INTEGER | 포트폴리오 비중(%) |
| quantity | INTEGER | 보유 수량 |
| last_updated | DATETIME | 최종 수정 시각 |
- PK: (device_id, code)

> `holding_opinion`은 이 테이블에 저장하지 않는다. API 응답 시 `calculateHoldingOpinion()`으로 런타임 계산.

### stock_history (가격 히스토리)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT | 종목코드 |
| date | TEXT | 날짜 (YYYYMMDD) |
| price | INTEGER | 종가 |
| open | INTEGER | 시가 |
| high | INTEGER | 고가 |
| low | INTEGER | 저가 |
| volume | INTEGER | 거래량 |
- PK: (code, date), INDEX: (code, date)

### stock_analysis (분석 결과) - market_opinion 전용
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK (FK→stocks) | 종목코드 |
| analysis | TEXT | 상세 분석 텍스트 |
| advice | TEXT | 투자 조언 |
| opinion | TEXT | **market_opinion** (긍정적/중립적/부정적) — 10점 스코어링 결과 |
| toss_url | TEXT | 토스증권 링크 |
| chart_path | TEXT | 차트 이미지 경로 |
| created_at | DATETIME | 생성 시각 |

> `opinion` 컬럼은 `MarketOpinion` 전용. API 응답 시 `market_opinion`으로 alias하여 반환.

### recommended_stocks (추천 종목)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK (FK→stocks) | 종목코드 |
| reason | TEXT | 추천 사유 |
| fair_price | INTEGER | 적정가 |
| score | INTEGER | 추천 점수 (0-100) |
| source | TEXT | 추천 출처 (`'manual'` / `'algorithm'`) |
| created_at | DATETIME | 생성 시각 |

### alerts (알림) - 개인 데이터
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 알림 ID |
| device_id | TEXT | 기기 식별자 |
| code | TEXT | 종목코드 |
| name | TEXT | 종목명 |
| type | TEXT | 유형 (sma5_break/sma5_touch/target_near/undervalued/sell_signal) |
| message | TEXT | 알림 메시지 (한국어) |
| read | INTEGER | 읽음 여부 (0/1) |
| created_at | DATETIME | 생성 시각 |
- INDEX: (device_id, read, created_at)

### watchlist (관심종목) - 개인 데이터
| 컬럼 | 타입 | 설명 |
|------|------|------|
| device_id | TEXT | 기기 식별자 |
| code | TEXT (FK→stocks) | 종목코드 |
| added_at | DATETIME | 추가 시각 |
- PK: (device_id, code)

### investor_history (투자자 매매 히스토리)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT | 종목코드 |
| date | TEXT | 날짜 (YYYYMMDD) |
| institution | INTEGER | 기관 순매수량 |
| foreign_net | INTEGER | 외국인 순매수량 |
| individual | INTEGER | 개인 순매수량 |
- PK: (code, date), INDEX: (code, date)

---

## API 엔드포인트 상세

### 종목 데이터
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 (가격, 히스토리, 투자자동향, 분석, 차트경로, `market_opinion`) |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 데이터 재수집 + 차트 캡처 |
| GET | `/api/stocks` | 전체 종목 목록 (가격>0, `market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 (code로 데이터 수집 실행) |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade: history, analysis, recommended, watchlist) |
| GET | `/api/search?q=` | 종목 검색 (이름/코드, 최대 10건) |

### 포트폴리오
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 목록 (`holding_opinion` + `market_opinion` 포함) |
| POST | `/api/holdings` | 보유종목 추가/수정 (UPSERT, `holding_opinion` + `market_opinion` 포함 응답) |
| DELETE | `/api/holdings/:code` | 보유종목 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (최근 20일) |

> `GET /api/holdings` 응답 예시:
> ```json
> {
>   "code": "005930", "name": "삼성전자",
>   "avg_price": 65000, "price": 71000, "weight": 25, "quantity": 10,
>   "holding_opinion": "보유",
>   "market_opinion": "긍정적"
> }
> ```

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | 추천 종목 (`market_opinion === '긍정적'` 필터, `source` 필드 포함, 보유종목 제외) |
| GET | `/api/stock/:code/indicators` | 기술지표 (RSI, MACD, 볼린저밴드 + 종합 시그널) |
| GET | `/api/stock/:code/volatility` | 변동성 (6일 일간수익률 표준편차) |
| GET | `/api/stock/:code/financials` | 분기 재무제표 (매출액, 영업이익, 당기순이익) |
| GET | `/api/stock/:code/news` | 최근 뉴스 10건 |
| GET | `/api/stock/:code/chart/:timeframe` | 주봉/월봉 OHLCV 데이터 |

### 스크리너/섹터
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/screener` | 조건 필터링 (PER 필터 시 `per > 0` 자동 추가로 적자 기업 제외), ROE 내림차순, 최대 50건 |
| GET | `/api/sector/:category/compare` | 섹터 내 종목 비교 (`market_opinion` 포함) |

### 알림
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/alerts` | 최근 알림 50건 |
| GET | `/api/alerts/unread-count` | 미읽은 알림 수 |
| POST | `/api/alerts/read` | 전체 읽음 처리 |
| DELETE | `/api/alerts/:id` | 알림 삭제 |

### 관심종목/시장/기타
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/watchlist` | 관심종목 목록 (`market_opinion` JOIN) |
| POST | `/api/watchlist` | 관심종목 추가 (`market_opinion` 포함 응답) |
| DELETE | `/api/watchlist/:code` | 관심종목 삭제 |
| GET | `/api/market/indices` | KOSPI/KOSDAQ 지수 |
| GET | `/api/health` | 서버 상태 확인 |

---

## 분석 알고리즘

### Opinion 분리 원칙
```
MarketOpinion  ('긍정적' | '중립적' | '부정적')
  → 모든 종목에 대해 10점 스코어링 결과 계산
  → stock_analysis.opinion 컬럼에 저장 (공용)
  → API 응답 시 market_opinion 필드로 반환

HoldingOpinion ('보유' | '추가매수' | '관망' | '매도')
  → calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)
  → DB 미저장, GET/POST /api/holdings 응답 시 런타임 계산
  → 보유 종목에만 존재
```

### 보유 종목 의견 (HoldingOpinion, 5단계)
```
calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)

1. 손절 (최우선):
   currentPrice ≤ avgPrice × 0.93  → '매도'

2. 이중 이평선 이탈:
   currentPrice < sma5 AND currentPrice < sma20  → '매도'

3. 단기 이탈 + 중기 지지:
   currentPrice < sma5 AND currentPrice ≥ sma20  → '관망'

4. 5일선 근접 지지:
   sma5 ≤ currentPrice ≤ sma5 × 1.01  → '추가매수'

5. 정배열 유지:
   currentPrice > sma5 AND sma5 > sma20  → '보유'
   그 외 sma5 위  → '보유'
```

### 비보유 종목 의견 - 10점 만점 통합 스코어링

#### 밸류에이션 (0~3점): `calculateValuationScore()`
```
PER 스코어 (0~1점):
  PER < 0 (적자 기업): 0점 고정 + per_negative: true 플래그
  PER < 섹터 중앙값 × 0.7: 1.0점
  PER < 섹터 중앙값: 0.5~1.0점 (선형 보간)
  PER ≥ 섹터 중앙값: 0~0.5점 (고평가 페널티)
  [섹터 내 종목 수 < 5: low_confidence: true 플래그]

PBR 스코어 (0~1점): PER과 동일 구조

PEG 스코어 (0~1점):
  성장률 = (epsCurrent - epsPrevious) / |epsPrevious| × 100
  성장률 ≤ 0: PEG 무효 → PEG 제외, (perScore+pbrScore)/2.0*3.0 으로 재정규화
  PEG = PER / 성장률
  PEG < 0.5: 1.0 / < 1.0: 0.75 / < 1.5: 0.5 / < 2.0: 0.25
  [EPS 없고 성장률 무효 시: ROE 폴백 — ROE>15 → 0.5, ROE>10 → 0.25]
```

#### 기술지표 (0~3점): `calculateTechnicalScore()`
```
RSI(14) (가중치 30%):
  score = clamp((70 - RSI) / 40, 0, 1)
  RSI 30~50 구간: 과매도 회복 보정 += (50-RSI)/20 × 0.3

MACD(12,26,9) (가중치 25%):
  히스토그램 > 0 & 증가: 1.0 / > 0 & 감소: 0.6
  히스토그램 < 0 & 증가: 0.4 / < 0 & 감소: 0.0

볼린저밴드(20,2) (가중치 20%):
  %B = (가격 - 하단) / (상단 - 하단) × 100
  score = clamp((80 - %B) / 80, 0, 1)

거래량 (가중치 25%): 20일 평균 대비 비율 + 가격 방향 조합
  상승 + 1.5배↑: 1.0 / 상승 + 평균 이상: 0.7
  상승 + 평균 미만: 0.4 / 하락 + 1.5배↑: 0.0 (패닉 매도)
  하락 + 기타: 0.2

가중합산 × 3 → 0~3점
```

#### 수급 (0~2점): `calculateSupplyDemandScore()`
```
외국인 연속 순매수 (최대 1.2점):
  5일+: 1.2 / 3~4일: 0.84 / 1~2일: 0.36 / 0일: 0

기관 연속 순매수 (최대 0.8점):
  5일+: 0.8 / 3~4일: 0.56 / 1~2일: 0.24 / 0일: 0

합산 clamp(0, 2.0)
```

#### 추세 (0~2점): `calculateTrendScore()`
```
SMA 데이터 부족: 1.0 (중립)
가격 > sma5 > sma20 (정배열): 2.0
가격 > sma5, 역배열:          1.0
가격 > sma20, sma5 아래:      0.5
양 이평선 아래:                0.0
```

#### 최종 판정
```
합산 ≥ 7.0: '긍정적'
합산 ≥ 4.0: '중립적'
합산 < 4.0: '부정적'
```

---

## 알림 시스템

### 알림 유형 및 쿨다운
| type | 설명 | 쿨다운 |
|------|------|--------|
| `sell_signal` | 5일선+20일선 이중 이탈 매도 신호 | 48시간 |
| `sma5_break` | 5일선 이탈 | 24시간 |
| `sma5_touch` | 5일선 근접 (추가매수 신호) | 24시간 |
| `target_near` | 목표가 95% 도달 | 12시간 |
| `undervalued` | 목표가 대비 30%+ 저평가 | 24시간 |

> 중복 방지 기준: 동일 (device_id, code, type) + type별 쿨다운 미만 경과 시 알림 생성 안 함

---

## 스케줄링

| 작업 | 주기 | 설명 |
|------|------|------|
| `syncAllStocks()` | 서버 시작 5초 후 + 매일 08:00 | 전체 등록 종목 가격/지표 갱신 (5개씩 배치) |
| `cleanupOldData()` | 서버 시작 시 + 24시간 | 20일 지난 분석/추천 데이터 삭제 |
| 차트 캡처 | 종목 조회 시 (1시간 캐시) | 토스증권 차트 스크린샷 |

---

## 등록 종목 (97개, 8개 섹터)
| 섹터 | 종목 수 | 예시 |
|------|---------|------|
| 기술/IT | 15 | 삼성전자, SK하이닉스, NAVER, 카카오 |
| 바이오/헬스케어 | 12 | 삼성바이오로직스, 셀트리온, 한미약품 |
| 자동차/모빌리티 | 8 | 현대차, 기아, 현대모비스 |
| 에너지/소재 | 15 | LG에너지솔루션, 삼성SDI, POSCO홀딩스 |
| 금융/지주 | 12 | KB금융, 신한지주, 하나금융지주 |
| 소비재/서비스 | 15 | 아모레퍼시픽, 이마트, LG생활건강 |
| 엔터테인먼트/미디어 | 9 | 하이브, SM, 크래프톤 |
| 조선/기계/방산 | 13 | HD현대중공업, 한화에어로스페이스 |

> 수동 추천 종목 20개 (`initialRecommendations`, `source: 'manual'`)가 별도로 등록됨

---

## 에러 처리 패턴
- API 실패 → DB 캐시 데이터로 폴백
- 스크래핑 실패 → null/빈 배열 반환 (서비스 중단 방지)
- `Promise.allSettled`로 부분 실패 허용
- 중복 알림 방지: type별 쿨다운 시간 내 동일 (device_id, code, type) 체크
- DB 마이그레이션: `ALTER TABLE`을 try-catch로 감싸 컬럼 중복 추가 방지 (11개 마이그레이션 블록)
- 삭제 시 트랜잭션으로 cascade (history, analysis, recommended, watchlist)
- PER 음수 / PEG 무효: 스코어 계산 전 명시적 분기 처리 (0점 고정 또는 재정규화)

---

## 캐시 설정
- `CACHE_TTL`: 10분 (600,000ms)
- 인메모리 Map: `{ data, timestamp }` 구조
- `POST /refresh` 시 캐시 무효화
