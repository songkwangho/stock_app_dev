# Backend Documentation

## 개요
- **진입점**: `server/index.js` (Express 앱 조립)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식) → PostgreSQL 전환 예정
- **데이터 소스**: 공식 API 우선 + 네이버 증권 보조 스크래핑 + 토스증권 Puppeteer 캡처
- **사용자 식별**: `X-Device-Id` 헤더 기반 (로그인 없음)

> **현재 상태**: `server/server.js` 단일 파일로 구현되어 있음. 아래 구조는 목표 구조이며, 리팩토링을 통해 단계적으로 전환한다.

---

## 목표 디렉토리 구조

```
server/
├── index.js              # Express 앱 조립 + 미들웨어 등록만
├── db/
│   ├── schema.js         # 테이블 정의 + 초기화
│   └── migrate.js        # 마이그레이션 (ALTER TABLE try-catch 안전 처리)
├── domains/
│   ├── stock/
│   │   ├── router.js     # /api/stocks, /api/stock/:code 라우트
│   │   ├── service.js    # 비즈니스 로직 (CRUD, 캐시 처리)
│   │   └── sync.js       # syncAllStocks() 배치 처리
│   ├── portfolio/
│   │   ├── router.js     # /api/holdings 라우트
│   │   └── service.js    # 수익률 계산, holding_opinion 런타임 계산
│   ├── analysis/
│   │   ├── router.js     # /api/stock/:code/indicators 등 라우트
│   │   ├── indicators.js # RSI, MACD, 볼린저밴드 계산
│   │   └── scoring.js    # 10점 통합 스코어링 (밸류에이션/기술/수급/추세)
│   ├── alert/
│   │   ├── router.js     # /api/alerts 라우트
│   │   └── service.js    # 알림 생성, 쿨다운 관리
│   └── watchlist/
│       └── router.js     # /api/watchlist 라우트
├── scrapers/
│   ├── naver.js          # 네이버 증권 스크래핑 (EUC-KR 처리 단일화)
│   └── toss.js           # 토스증권 Puppeteer 캡처
└── scheduler.js          # syncAllStocks + cleanupOldData 스케줄링
```

---

## 사용자 식별 (device_id)

### 개요
로그인 없이 기기별 UUID로 개인 데이터를 분리한다.

### 구현
- `getDeviceId(req)` 헬퍼: `req.headers['x-device-id']` 에서 추출
- device_id가 없는 요청은 개인 데이터 API에서 400 에러 반환
- 개인 데이터 테이블: `holding_stocks`, `watchlist`, `alerts`
- 공용 데이터 테이블: `stocks`, `stock_history`, `stock_analysis`, `recommended_stocks`, `investor_history`

### 보안 강화 계획
- **HMAC 서명**: device_id 생성 시 서버 시크릿으로 서명 → 위변조 탐지
  ```
  signed_device_id = `${uuid}.${HMAC(uuid, SERVER_SECRET)}`
  ```
- **Rate limiting**: device_id 단위로 API 호출 횟수 제한 (알림 폭탄, 스크리너 남용 방지)
- **HTTPS**: 프로덕션 배포 시 필수 (device_id 헤더 평문 전송 방지)

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

> `holding_opinion`은 이 테이블에 저장하지 않는다. API 응답 시 `avg_price`와 현재 지표를 기반으로 런타임 계산하여 반환한다.

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
| opinion | TEXT | **market_opinion** (긍정적/중립적/부정적) — 비보유 기준 10점 스코어링 결과 |
| toss_url | TEXT | 토스증권 링크 |
| chart_path | TEXT | 차트 이미지 경로 |
| created_at | DATETIME | 생성 시각 |

> `opinion` 컬럼은 `MarketOpinion` 전용. 보유 종목의 `HoldingOpinion`('보유'/'추가매수'/'관망'/'매도')은 API 응답에서 `holding_opinion` 필드로 별도 반환되며 이 테이블에 저장하지 않는다.

### recommended_stocks (추천 종목)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK (FK→stocks) | 종목코드 |
| reason | TEXT | 추천 사유 |
| fair_price | INTEGER | 적정가 |
| score | INTEGER | 추천 점수 (0-100) |
| source | TEXT | 추천 출처 ('manual' / 'algorithm') — 수동 등록과 알고리즘 추천 구분 |
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
- 용도: 수급 스코어링에서 외국인/기관 연속 순매수 일수 계산

---

## API 엔드포인트 상세

### 종목 데이터
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 (가격, 히스토리, 투자자동향, 분석, 차트경로) |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 데이터 재수집 + 차트 캡처 |
| GET | `/api/stocks` | 전체 종목 목록 (가격>0, market_opinion JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 (code로 데이터 수집 실행) |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade: history, analysis, recommended, watchlist) |
| GET | `/api/search?q=` | 종목 검색 (이름/코드, 최대 10건) |

### 포트폴리오
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 목록 (avgPrice, weight, currentPrice, **holding_opinion** 포함) |
| POST | `/api/holdings` | 보유종목 추가/수정 (UPSERT) |
| DELETE | `/api/holdings/:code` | 보유종목 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (최근 20일) |

> `GET /api/holdings` 응답 예시:
> ```json
> {
>   "code": "005930",
>   "name": "삼성전자",
>   "avg_price": 65000,
>   "current_price": 71000,
>   "holding_opinion": "보유",
>   "market_opinion": "긍정적"
> }
> ```

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | 추천 종목 (수동+알고리즘, 보유종목 제외, source 필드 포함) |
| GET | `/api/stock/:code/indicators` | 기술지표 (RSI, MACD, 볼린저밴드 + 종합 시그널) |
| GET | `/api/stock/:code/volatility` | 변동성 (6일 일간수익률 표준편차) |
| GET | `/api/stock/:code/financials` | 분기 재무제표 (매출액, 영업이익, 당기순이익) |
| GET | `/api/stock/:code/news` | 최근 뉴스 10건 |
| GET | `/api/stock/:code/chart/:timeframe` | 주봉/월봉 OHLCV 데이터 |

### 스크리너/섹터
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/screener` | 조건 필터링 (perMax, perMin, pbrMax, roeMin, priceMin, priceMax, category), ROE 내림차순, 최대 50건 |
| GET | `/api/sector/:category/compare` | 섹터 내 종목 비교 (업종 평균 대비 PER/PBR/ROE %) |

### 알림
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/alerts` | 최근 알림 50건 |
| GET | `/api/alerts/unread-count` | 미읽은 알림 수 |
| POST | `/api/alerts/read` | 전체 읽음 처리 |
| DELETE | `/api/alerts/:id` | 알림 삭제 |

### 관심종목/시장
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/watchlist` | 관심종목 목록 (market_opinion JOIN) |
| POST | `/api/watchlist` | 관심종목 추가 |
| DELETE | `/api/watchlist/:code` | 관심종목 삭제 |
| GET | `/api/market/indices` | KOSPI/KOSDAQ 지수 |

---

## 데이터 수집 로직

### 데이터 소스 우선순위
```
1순위: 공식 API
  - 한국투자증권 Open API (KIS Developers): 실시간 가격, OHLCV
  - KRX 정보데이터시스템: 상장 종목 목록, 시장 지수
2순위: 네이버 증권 스크래핑 (공식 API 미제공 항목만)
  - PER, PBR, ROE, EPS, 목표가, 투자자 동향, 뉴스, 재무제표
3순위: 토스증권 Puppeteer 캡처
  - 차트 이미지 (추후 자체 캔들차트로 대체 예정)
```

> **스크래핑 리스크**: 네이버/토스증권 HTML 구조 변경 시 해당 기능 중단 가능.
> 스크래핑 코드는 `scrapers/` 디렉토리에 격리하여 교체 비용을 최소화한다.
> EUC-KR 인코딩 처리(`arraybuffer` + `TextDecoder('euc-kr')`)는 `scrapers/naver.js`에 단일화.

### 네이버 증권 API (가격 데이터, 보조)
- URL: `https://api.finance.naver.com/siseJson.naver`
- 파라미터: symbol, requestType=1, startTime, endTime, timeframe(day/week/month)
- 65일치 요청 → 40영업일 확보
- 응답: JSON 배열 `["날짜","시가","고가","저가","종가","거래량"]`

### 네이버 증권 웹 스크래핑 (보조)
- **메인 페이지** (`finance.naver.com/item/main.naver`): PER, PBR, ROE, EPS(전년/최신), 목표가, 업종
- **투자자 동향** (`finance.naver.com/item/frgn.naver`): 기관/외국인/개인 → `investor_history` 테이블 UPSERT
- **뉴스** (`finance.naver.com/item/news_news.naver`): 최근 뉴스 10건
- **재무제표** (highlight_D_Q 테이블): 분기별 매출액/영업이익/당기순이익

### 토스증권 차트 캡처
- Puppeteer headless로 `tossinvest.com/stocks/{code}` 스크린샷
- 저장 경로: `public/charts/{code}.png`
- 캐시 1시간 (파일 수정시간 기준)

---

## 분석 알고리즘

### Opinion 분리 원칙
```
MarketOpinion  ('긍정적' | '중립적' | '부정적')
  → 비보유 기준 10점 스코어링 결과
  → stock_analysis.opinion 컬럼에 저장 (공용)
  → 모든 종목(보유/비보유)에 대해 계산됨

HoldingOpinion ('보유' | '추가매수' | '관망' | '매도')
  → 평단가(avg_price) 기반 5단계 판단
  → DB 미저장, GET /api/holdings 응답 시 런타임 계산
  → 보유 종목에만 존재
```

### 보유 종목 의견 (HoldingOpinion, 5단계)
```
portfolio/service.js의 calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)

1. 손절 (최우선):
   currentPrice ≤ avgPrice × 0.93  → '매도' (손절)

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
  성장률 ≤ 0: PEG 무효 → PEG 스코어 제외, 밸류에이션 2점 만점으로 재정규화
  PEG = PER / 성장률
  PEG < 0.5: 1.0 / < 1.0: 0.75 / < 1.5: 0.5 / < 2.0: 0.25
  [EPS 없고 성장률 무효 시: ROE 폴백 — ROE>15 → 0.5, ROE>10 → 0.25]
```

#### 기술지표 (0~3점): `calculateTechnicalScore()`
```
RSI(14) (가중치 30%):
  score = clamp((70 - RSI) / 40, 0, 1)
  ※ RSI 30~50 구간: 과매도 회복 신호를 반영하여 (50-RSI)/20 × 0.3 보정 추가

MACD(12,26,9) (가중치 25%):
  히스토그램 > 0 & 증가: 1.0 / > 0 & 감소: 0.6
  히스토그램 < 0 & 증가: 0.4 / < 0 & 감소: 0.0

볼린저밴드(20,2) (가중치 20%):
  %B = (가격 - 하단) / (상단 - 하단)
  score = clamp((80 - %B×100) / 80, 0, 1)  ← 정규화 기준 수정

거래량 (가중치 25%): 20일 평균 대비 비율 + 가격 방향 조합
  상승 + 1.5배↑: 1.0 / 상승 + 평균 이상: 0.7
  상승 + 평균 미만: 0.4 / 하락 + 1.5배↑: 0.0 (패닉 매도)
  하락 + 기타: 0.2

가중합산 × 3 → 0~3점
```

#### 수급 (0~2점): `calculateSupplyDemandScore()`
```
외국인 연속 순매수 (최대 1.2점):
  5일+: 1.2 / 3~4일: 0.84 / 1~2일: 0.36 / 0일 이하: 0

기관 연속 순매수 (최대 0.8점):
  5일+: 0.8 / 3~4일: 0.56 / 1~2일: 0.24 / 0일 이하: 0

합산 clamp(0, 2.0)

[향후 개선]: 순매수 금액(원) × 일수 가중 합산으로 보완 예정
```

#### 추세 (0~2점): `calculateTrendScore()`
```
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

### 기술지표 계산
- **RSI(14)**: 14일 평균 상승폭 / (평균 상승폭 + 평균 하락폭) × 100
- **MACD(12,26,9)**: EMA12 - EMA26, 시그널 = EMA9(MACD), 히스토그램 = MACD - 시그널
- **볼린저밴드(20,2)**: SMA20 ± 2σ, %B = (가격-하단) / (상단-하단)
- **EPS 성장률**: `(epsCurrent - epsPrevious) / |epsPrevious| × 100`

---

## 알림 시스템

### 알림 유형 및 쿨다운
| type | 설명 | 쿨다운 |
|------|------|--------|
| `sell_signal` | 손절/이중 이탈 매도 신호 | 48시간 |
| `sma5_break` | 5일선 이탈 | 24시간 |
| `sma5_touch` | 5일선 근접 (추가매수 신호) | 24시간 |
| `target_near` | 목표가 근접 | 12시간 |
| `undervalued` | 저평가 진입 | 24시간 |

> 중복 방지 기준: 동일 (device_id, code, type) + 쿨다운 미만 경과 시 알림 생성 안 함

---

## 스케줄링

| 작업 | 주기 | 설명 |
|------|------|------|
| `syncAllStocks()` | 서버 시작 시 + 매일 08:00 | 전체 등록 종목 가격/지표 갱신 (5개씩 배치) |
| `cleanupOldData()` | 서버 시작 시 + 24시간 | 20일 지난 분석/추천 데이터 삭제 |
| 차트 캡처 | 종목 조회 시 (1시간 캐시) | 토스증권 차트 스크린샷 |

---

## 등록 종목 (약 104개, 8개 섹터)
| 섹터 | 종목 수 | 예시 |
|------|---------|------|
| 기술/IT | 15 | 삼성전자, SK하이닉스, NAVER, 카카오 |
| 바이오/헬스케어 | 12 | 삼성바이오로직스, 셀트리온, 한미약품 |
| 자동차/모빌리티 | 8 | 현대차, 기아, 현대모비스 |
| 에너지/소재 | 15 | LG에너지솔루션, 삼성SDI, POSCO홀딩스 |
| 금융/지주 | 12 | KB금융, 신한지주, 하나금융지주 |
| 소비재/서비스 | 15 | 아모레퍼시픽, 이마트, LG생활건강 |
| 엔터테인먼트/미디어 | 10 | 하이브, SM, 크래프톤 |
| 조선/기계/방산 | 13 | HD현대중공업, 한화에어로스페이스 |

---

## 에러 처리 패턴
- API 실패 → DB 캐시 데이터로 폴백
- 스크래핑 실패 → null/빈 배열 반환 (서비스 중단 방지)
- `Promise.allSettled`로 부분 실패 허용
- 중복 알림 방지: type별 쿨다운 시간 내 동일 (device_id, code, type) 체크
- DB 마이그레이션: `ALTER TABLE`을 try-catch로 감싸 컬럼 중복 추가 방지
- 삭제 시 트랜잭션으로 cascade (history, analysis, recommended, watchlist)
- PER 음수 / PEG 무효: 스코어 계산 전 명시적 분기 처리 (0점 고정 또는 재정규화)

---

## 캐시 설정
- `CACHE_TTL`: 10분 (600,000ms)
- 인메모리 Map: `{ data, timestamp }` 구조
- `POST /refresh` 시 캐시 무효화

---

## 프로덕션 배포 체크리스트 (Phase 2)
- [ ] HTTPS 설정 + 인증서 (Let's Encrypt)
- [ ] CORS 화이트리스트 (앱 번들 ID, 웹 도메인만 허용)
- [ ] Rate limiting per device_id (`express-rate-limit`)
- [ ] device_id HMAC 서명 검증 미들웨어
- [ ] SQLite → PostgreSQL 전환 (비동기 `pg` 패턴)
- [ ] 환경변수 분리 (`.env`: DB URL, 서버 시크릿, API 키)
- [ ] Puppeteer Chromium 서버 환경 설치 확인
