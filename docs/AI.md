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
- 온보딩: 면책 모달 → 종목 추가 안내 → 첫 종목 추가 인라인 가이드(1회) → 대시보드 CTA(재방문 시만)
- localStorage 키 3개: `disclaimer_accepted`, `onboarding_done`, `onboarding_first_stock_guided`

**스코어링/지표 시각화**:
- ScoringBreakdownPanel: 면책 문구 패널 상단 배치 → 4영역 게이지 바 + value/max 점수 텍스트 병기 (색각이상 대응) + 만점대비 비율(80/60/25%) 한국어 해석
- PER/PBR/ROE/RSI/MACD/볼린저/투자자동향 각 영역에 [?] 버튼 → HelpBottomSheet (8개 용어, 4단계 작성 기준)
- 차트 라인/캔들 토글, 업종 비교는 중앙값 기준

**보유종목/추천 UX**:
- holding_opinion 구체적 이유 + "상세 보기 →" 행동유도 링크. sma_available=false 시 "분석 중" 뱃지
- 수익률 6구간 메시지 + 극단 구간(≥20%, ≤-7%)에 "종목 보기 →" 링크
- 추천 source accordion: reason 텍스트 + source별 신뢰도 설명
- **추천 카드 상승여력 표현**: "상승여력 +N%" → **"적정가 대비 현재가 괴리 +N%"** + "※ 이 수치는 실제 수익률이 아니에요" 면책. 애널리스트 목표가 기준은 "통상 6~12개월 기준" 안내 추가
- 스크리너 결과 상단 yellow 안내 + 활성 프리셋의 함정(`caveat`) 노출. 4개 프리셋 모두 caveat 정의됨
- StockDetailView PER 카드 하단 업종별 힌트 (IT/금융/바이오/에너지 4개 카테고리)
- 포트폴리오 집중도 >50% 카드 yellow 테두리 + 분산 투자 권유 안내
- DashboardPage 수익률 카드: KOSPI 당일 변동률 병기 (App.tsx의 marketIndices props 전달)

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
| device_id 보안 | CORS+Rate limit 적용 | HMAC 서명 + B안 강제 재등록 (P2-1). B안 시 사용자 안내 화면 설계 필요 |
| SQLite 블로킹 | 5초 지연 실행으로 완화 | PostgreSQL 전환 (P2-3). 사전: syncAllStocks() 비동기 재작성 범위 산정 |
| 스크래핑 의존 | 핵심 데이터 네이버 스크래핑 | KIS/KRX 분리 평가 (P2-4, 시나리오 B 우선) |
| 알림 이중 발송 | 배치 알림만 존재 | Push+배치 단일 파이프라인 (P3). 일 N건 빈도 제어 |
| 스코어 임계값 검증 | 임시값(7/4점), 주석 추가됨 | 장기 데이터 적재 → 백테스팅 (P4). 스크립트 즉시 착수 |
| 공휴일 장중/장외 판단 | 평일 9~16시만 판단 | 공휴일 캘린더 통합 (P3 후속) |
| 검색 LIKE 풀스캔 | 97종목에서 무시 가능 | 1000+ 시 FTS 인덱스 도입 |
| 번들 크기 측정 | 미측정 | P3 사전: rollup-plugin-visualizer. <250KB gzip 목표. Recharts 동적 import 검토 |
| 앱스토어 분류 전략 | "Utilities" 잠정 결정 | P3: 심사 노트 초안 작성 ("거래 기능 없음" 강조) |
| 섹터별 스코어링 가중치 | 바이오에 PER 밸류에이션 부적합 | P4: 섹터별 가중치 테이블 도입 검토 |
