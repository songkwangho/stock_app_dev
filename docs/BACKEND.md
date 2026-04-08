# Backend Documentation

## 개요
- **파일**: `server/server.js` (단일 파일 Express 서버)
- **포트**: 3001
- **DB**: SQLite3 (better-sqlite3, 동기식)
- **데이터 소스**: 네이버 증권 API + HTML 스크래핑 + 토스증권 Puppeteer 캡처
- **사용자 식별**: `X-Device-Id` 헤더 기반 (로그인 없음)

---

## 사용자 식별 (device_id)

### 개요
로그인 없이 기기별 UUID로 개인 데이터를 분리한다.

### 구현
- `getDeviceId(req)` 헬퍼: `req.headers['x-device-id']` 에서 추출
- device_id가 없는 요청은 개인 데이터 API에서 400 에러 반환
- 개인 데이터 테이블: `holding_stocks`, `watchlist`, `alerts`
- 공용 데이터 테이블: `stocks`, `stock_history`, `stock_analysis`, `recommended_stocks`, `investor_history`

### 영향받는 API
| API | 변경 내용 |
|-----|----------|
| GET/POST/DELETE `/api/holdings` | device_id로 필터/삽입 |
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
| per | REAL | PER |
| pbr | REAL | PBR |
| roe | REAL | ROE |
| target_price | INTEGER | 애널리스트 목표가 |
| eps_current | REAL | 최신 연도 EPS (PEG 계산용) |
| eps_previous | REAL | 전년도 EPS (PEG 계산용) |
| last_updated | DATETIME | 최종 갱신 시각 |

### holding_stocks (포���폴리오) - 개인 데이터
| 컬럼 | 타입 | 설명 |
|------|------|------|
| device_id | TEXT | 기기 식별자 |
| code | TEXT (FK→stocks) | 종목코드 |
| avg_price | INTEGER | 평균 매수가 |
| weight | INTEGER | 포트폴리오 비중(%) |
| quantity | INTEGER | 보유 수량 |
| last_updated | DATETIME | 최종 수정 시각 |
- PK: (device_id, code)

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

### stock_analysis (분석 결과)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK (FK→stocks) | 종목코드 |
| analysis | TEXT | 상세 분석 텍스트 |
| advice | TEXT | 투자 조언 |
| opinion | TEXT | 의견 (긍정적/중립적/부정적/추가매수/보유/관망/매도) |
| toss_url | TEXT | 토스증권 링크 |
| chart_path | TEXT | 차트 이미지 경로 |
| created_at | DATETIME | 생성 시각 |

### recommended_stocks (추천 종목)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | TEXT PK (FK→stocks) | 종목코드 |
| reason | TEXT | 추천 사유 |
| fair_price | INTEGER | 적정가 |
| score | INTEGER | 추천 점수 (0-100) |
| created_at | DATETIME | 생성 시각 |

### alerts (알림) - 개인 데이터
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 알림 ID |
| device_id | TEXT | 기기 식별자 |
| code | TEXT | 종목��드 |
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
| GET | `/api/stocks` | 전체 종목 목록 (가격>0, opinion JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 (code로 스크래핑 실행) |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade: history, analysis, recommended, watchlist) |
| GET | `/api/search?q=` | 종목 검색 (이름/코드, 최대 10건) |

### 포트폴리오
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 목록 (avgPrice, weight, currentPrice) |
| POST | `/api/holdings` | 보유종목 추가/수정 (UPSERT) |
| DELETE | `/api/holdings/:code` | 보유종목 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (최근 20일) |

### 추천/분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/recommendations` | 추천 종목 (수동 + 긍정적 의견, 보유종목 제외, 고평가 제외) |
| GET | `/api/stock/:code/indicators` | 기술지표 (RSI, MACD, 볼린저밴드 + 종합 시그널) |
| GET | `/api/stock/:code/volatility` | 변동성 (6일 일간수익률 표준편차) |
| GET | `/api/stock/:code/financials` | 분기 재무제표 (매출액, 영업이익, 당기순이익) - 네이버 스크래핑 |
| GET | `/api/stock/:code/news` | 최근 뉴스 10건 - 네이버 스크래핑 |
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
| GET | `/api/watchlist` | 관심종목 목록 (opinion JOIN) |
| POST | `/api/watchlist` | 관심종목 추가 |
| DELETE | `/api/watchlist/:code` | 관심종목 삭제 |
| GET | `/api/market/indices` | KOSPI/KOSDAQ 지수 (네이버 스크래핑) |

---

## 데이터 수집 로직

### 네이버 증권 API (가격 데이터)
- URL: `https://api.finance.naver.com/siseJson.naver`
- 파라미터: symbol, requestType=1, startTime, endTime, timeframe(day/week/month)
- 65일치 요청 → 40영업일 확보
- 응답: JSON 배열 `["날짜","시가","고가","저가","종가","거래량"]`

### 네이버 증권 웹 스크래핑
- **메인 페이지** (`finance.naver.com/item/main.naver`): PER, PBR, ROE, EPS(전년/최신), 목표가, 업종
- **투자자 동향** (`finance.naver.com/item/frgn.naver`): 기관/외국인/개인 매매수량 → investor_history 테이블에 저장
- **뉴스** (`finance.naver.com/item/news_news.naver`): 최근 뉴스 10건
- **재무제표** (highlight_D_Q 테이블): 분기별 매출액/영업이익/당기순이익
- 인코딩: EUC-KR → responseType: 'arraybuffer' + TextDecoder('euc-kr')

### 토스증권 차트 캡처
- Puppeteer headless 브라우저로 `tossinvest.com/stocks/{code}` 스크린샷
- 저장 경로: `public/charts/{code}.png`
- 캐시 1시간 (파일 수정시간 기준)

---

## 분석 알고리즘

### 보유 종목 의견 (5단계 우선순위)
```
1. 손절 체크 (최우선):
   현재가 ≤ 평단가 × 0.93 (-7%)  → "매도" (손절)

2. 이중 이평선 이탈:
   가격 < SMA5 AND 가격 < SMA20  → "매도" (강한 매도)

3. 단기 이탈 + 중기 지지:
   가격 < SMA5 AND 가격 ≥ SMA20  → "관망" (20일선 지지 확인 필요)

4. 5일선 근접 지지:
   가격 ≈ SMA5 (100~101% 범위)   → "추가매수"

5. 정배열 유지:
   가격 > SMA5 AND SMA5 > SMA20  → "보유" (건강한 추세)
   그 외 SMA5 위                   → "보유"
```

### 비보유 종목 의견 - 10점 만점 통합 스코어링
```
밸류에이션 (0~3점): calculateValuationScore()
  PER 섹터 중앙값 비교 (0~1점):
    PER < 섹터 중앙값 × 0.7 → 1.0 (확실한 저평가)
    PER < 섹터 중앙값       → 0.5~1.0 (선형 보간)
    PER ≥ 섹터 중앙값       → 0~0.5 (고평가 페널티)
  PBR 섹터 중앙값 비교 (0~1점): PER과 동일 구조
  PEG 비율 (0~1점):
    PEG = PER / EPS성장률(%)
    PEG < 0.5 → 1.0 / < 1.0 → 0.75 / < 1.5 → 0.5 / < 2.0 → 0.25
    EPS 없으면 ROE 기반 폴백 (ROE>15 → 0.5, ROE>10 → 0.25)

기술지표 (0~3점): calculateTechnicalScore()
  RSI(14) 연속값 (가중치 30%): score = (70 - RSI) / 40, 클램프 [0,1]
  MACD(12,26,9) 강도/방향 (가중치 25%):
    히스토그램 양수 & 증가 → 1.0 / 양수 & 감소 → 0.6
    히스토그램 음수 & 증가 → 0.4 / 음수 & 감소 → 0.0
  볼린저밴드(20,2) (가중치 20%): score = (80 - %B) / 70, 클램프 [0,1]
  거래량 (가중치 25%): 20일 평균 대비 비율 + 가격 방향 조합
    상승 + 거래량 1.5배↑ → 1.0 / 상승 + 평균 이상 → 0.7
    하락 + 거래량 1.5배↑ → 0.0 (패닉 매도)
  가중합산 × 3 → 0~3점

수급 (0~2점): calculateSupplyDemandScore()
  외국인 연속 순매수 (0~1.2점, 가중치 높음):
    5일+ → 1.2 / 3~4일 → 0.84 / 1~2일 → 0.36
  기관 연속 순매수 (0~0.8점):
    5일+ → 0.8 / 3~4일 → 0.56 / 1~2일 → 0.24
  합산 (최대 2.0)

추세 (0~2점): calculateTrendScore()
  가격 > SMA5 > SMA20 (정배열) → 2.0
  가격 > SMA5, 역배열           → 1.0
  가격 > SMA20, SMA5 아래       → 0.5
  양 이평선 아래                  → 0.0

합산 (10점 만점):
  7점 이상 → "긍정적"
  4점 이상 → "중립적"
  4점 미만 → "부정적"
```

### 기술지표 계산 (calculateIndicators)
- **RSI(14)**: 14일 평균 상승폭 / (평균 상승폭 + 평균 하락폭) × 100
  - ≥70: 과매수, ≤30: 과매도
- **MACD(12,26,9)**: EMA12 - EMA26, 시그널 = EMA9(MACD)
  - 히스토그램 > 0: 상승추세
- **볼린저밴드(20,2)**: SMA20 ± 2σ, %B = (가격-하단) / (상단-하단)

### EPS 데이터 수집
- 네이버 증권 메인 페이지에서 `th_cop_anal17` 클래스로 EPS 추출
- 3번째 `<td>` = 전년도 EPS, 4번째 `<td>` = 최신/추정 EPS
- PEG 계산: `PER / ((epsCurrent - epsPrevious) / |epsPrevious| × 100)`

### 투자자 데이터 영구 저장
- 네이버 투자자 동향 스크래핑 시 `investor_history` 테이블에 UPSERT
- 수급 스코어링 시 최근 20일 데이터를 DB에서 조회하여 연속 순매수 일수 계산

---

## 스케줄링

| 작업 | 주기 | 설명 |
|------|------|------|
| syncAllStocks() | 서버 시작 시 + 매일 08:00 | 전체 등록 종목 가격/지표 갱신 (5개씩 배치) |
| cleanupOldData() | 서버 시작 시 + 24시간 | 20일 지난 분석/추천 데이터 삭제 |
| chartCapture | 종목 조회 시 (1시간 캐시) | 토스증권 차트 스크린샷 |

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
- Promise.allSettled로 부분 실패 허용
- 중복 알림 방지: 24시간 내 동일 (code, type) 체크
- DB 마이그레이션: ALTER TABLE을 try-catch로 감싸 컬럼 중복 추가 방지
- 삭제 시 트랜잭션으로 cascade (history, analysis, recommended, watchlist)

---

## 캐시 설정
- `CACHE_TTL`: 10분 (600,000ms)
- 인메모리 Map: `{ data, timestamp }` 구조
- `POST /refresh` 시 캐시 무효화
