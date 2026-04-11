# Frontend UX Documentation — 온보딩·면책·디자인시스템·초보자 안내

> 스토어·페이지·컴포넌트·타입 명세는 `docs/FRONTEND.md` 참조

---

## 온보딩 플로우 (첫 실행 시)

**localStorage 키 (4개)**:
- `disclaimer_accepted` — 면책 모달 확인 여부
- `onboarding_done` — 온보딩 스텝 완료 여부 (스킵 포함)
- `onboarding_first_stock_guided` — 첫 종목 추가 후 가이드 카드 노출 완료 여부
- `onboarding_alerts_explained` — 알림 패널 첫 진입 안내 카드 노출 완료 여부

**플로우**:
1. **면책 모달** (`disclaimer_accepted`): 원금 손실 위험 + "이 앱은 정보 제공 도구로, 실제 주식 거래는 지원하지 않아요. 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요." 강조 → [확인했습니다]
2. **온보딩 스텝** (`onboarding_done`): "내 주식을 추가해볼게요" → [건너뛰기] / [직접 추가할게요]
   - [직접 추가할게요]: `navigateTo('analysis', { focus: 'add-holding-search' })` → HoldingsAnalysisPage 검색 폼 자동 노출
   - 서버 미연결 상태에서 폼 노출 후 종목 추가 시도 시: "서버 연결이 필요해요" 안내 + 재시도 버튼
3. **첫 종목 추가 직후 인라인 가이드** (`onboarding_first_stock_guided`): holdings.length가 0→1 전환 시, 키가 없으면 토스트 대신 인라인 가이드 카드 1회 표시.
   ```
   🎉 첫 종목을 추가했어요!

   지금 할 수 있는 것:
   • [종목 분석 보기 →] {종목명}의 10점 종합점수, 기술지표, 업종 비교 확인하기
   • 지표가 어렵게 느껴진다면 각 항목의 [?] 버튼으로 용어 설명 보기
   • 추천 탭에서 다른 종목도 살펴보기

   이 안내는 한 번만 표시돼요. 다음 종목 추가 시에는 일반 토스트로 안내해요.

   [종목 분석 보기 →]  [나중에 볼게요]
   ```
   "나중에 볼게요" 클릭 시 카드 닫힘 + 키 설정. 이후 종목 추가 시에는 일반 토스트 ("보러가기" 액션)로 전환.

   **두 진입 경로 모두 지원**:
   - **HoldingsAnalysisPage 검색 폼**: handleAdd에서 `holdings.length === 0` && 키 없음 → 가이드 카드 즉시 표시.
   - **StockDetailView 추가 폼** (추천·검색 진입 케이스): add 호출 직전 `usePortfolioStore.getState().holdings.length === 0` 스냅샷 저장 → 성공 시 `navigateTo('analysis', { focus: 'first-stock-guide' })`. HoldingsAnalysisPage가 마운트 시 `consumePendingFocus()` 검사 → `holdings[0]`을 가이드 카드에 표시.

4. **알림 패널 첫 진입 안내** (`onboarding_alerts_explained`): 알림 벨 또는 모바일 탭바 "알림" 첫 클릭 시 패널 상단에 1회 안내 카드 노출.
   ```
   📬 알림은 어떻게 동작하나요?
   • 보유·관심 종목의 가격 변화를 알려드려요.
   • 데이터는 하루 1회 갱신 기준이에요 (실시간 아님).
   • 동일 종목당 하루 최대 2건만 발송돼요.
   • 투자 결정은 항상 본인이 직접 해주세요.
   [확인했어요]
   ```
   [확인했어요] → 키 설정 후 카드 닫힘.
4. **대시보드**: 빈 포트폴리오 CTA 카드는 `onboarding_done` 설정된 **재방문** 시에만 표시.

---

## 투자 면책 고지 (7곳)

| 위치 | 문구 | 형태 |
|------|------|------|
| 첫 실행 모달 | "원금 손실 위험이 있어요. 이 앱은 정보 제공 도구로, 실제 주식 거래는 지원하지 않아요. 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요." | 모달, 1회 |
| 추천 페이지 상단 | "알고리즘이 분석한 참고 정보예요. 투자 결정은 항상 본인이 직접 판단해주세요." | 상시 안내형 |
| 종목 상세 종합의견 박스 | "알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요." + market_opinion 뱃지에 📊 힌트 | 인라인 |
| 종목 상세 분석 영역 하단 | "이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다." | 인라인 |
| 추천 카드 하단 | "투자 참고용이며 투자 권유가 아니에요. 실제 매수는 증권사 앱에서 직접 진행해 주세요." | 카드 푸터 |
| HoldingsAnalysisPage 매도/추가 검토 뱃지 하단 | "이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요." | italic |
| ScoringBreakdownPanel 상단 | "10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요." | 종합점수 바로 아래 |

---

## 데이터 표시 원칙

### 갱신 시각 (`src/utils/dataFreshness.ts`)
- `getDataFreshnessLabel(lastUpdated: string)`: "N분 전 (HH:MM, 장중 데이터/전일 종가)" — 종목 상세
- `getDataFreshnessShort(lastUpdated: string)`: "N분 전" — 대시보드
- **입력 형식**: 서버 DB timestamp. `parseServerDate()`가 두 형식을 모두 처리 (과거 SQLite 덤프 호환용):
  - PostgreSQL (현재): `TIMESTAMPTZ` → ISO 8601 (`"2024-01-15T08:00:00.000Z"`) — `Z` 접미사 포함, `new Date()` 직접 파싱 가능
  - SQLite (마이그레이션 이전 데이터): `CURRENT_TIMESTAMP` → `"YYYY-MM-DD HH:MM:SS"` (UTC, T/Z 없음)
- **파싱 로직**: `parseServerDate()` 헬퍼가 정규식으로 `Z` / `+HH:MM` 접미사를 검사 — 있으면 `new Date(input)` 그대로, 없으면 (SQLite 형식) `T`와 `Z`를 추가해 명시 UTC로 해석. `new Date()` 직접 호출 금지 (SQLite 형식을 로컬 시간대로 해석해 KST와 9시간 오차 발생).
- **KST 변환**: `Asia/Seoul` 타임존 명시. 클라이언트 시간대와 무관.
- **장중 판단**: KST 평일 9~16시 자동 판단.
- **알려진 제약**: 광복절 등 공휴일에 "장중 데이터" 오표시 가능. 향후 공휴일 캘린더 통합 시 해소.

### 재무지표
- 비교 기준: 업종 **중앙값**(medians). 스코어링 알고리즘과 동일 기준.
- 재무제표 단위: "(단위: 억 원)". 1조 이상: "X조 Y,YYY억" 자동 포맷팅.

### 스코어링 해석 (ScoringBreakdownPanel)
만점대비 비율 4단계:
- 밸류에이션(만점3): ≥2.4 매우 좋음 / ≥1.8 적정 / ≥0.75 약함 / 그 외 부정적
- 수급(만점2): ≥1.6 매우 좋음 / ≥1.2 적정 / ≥0.5 약함 / 그 외 부정적
- 기술지표/추세도 동일 비율 적용

### 추천 적정가
"알고리즘 추정 적정가(N원) 대비 현재가 괴리 +N%"로 표기. "+ ※ 이 수치는 실제 수익률이 아니에요" 병기.
fairPrice 라벨: "적정가 (애널리스트)" vs "적정가 (추정)".

---

## UI 디자인 시스템

### 대상 사용자
- **주식 투자 초보자** (전문 용어에 익숙하지 않음)
- **스마트폰** 주 사용 환경 (Capacitor 앱 배포 예정)

### 접근성 원칙 (필수 준수)
1. **최소 폰트**: `text-xs`(12px) 이상. `text-[9px]`, `text-[10px]`, `text-[11px]` 금지
2. **터치 타겟**: 모든 버튼/탭/아이콘 최소 44x44px (`min-w-[44px] min-h-[44px]` 또는 `p-3` 이상)
3. **hover 의존 금지**: 삭제·도움말 등 모바일에서도 항상 접근 가능하도록 표시
4. **용어 설명 기본 노출**: PER, PBR, ROE 등 항상 한줄 설명 병기. 예: "PER 12배 (낮을수록 저평가)". [?] 버튼 뒤에만 숨기지 않음.
5. **색상+텍스트 병기**: 의견 뱃지 등 색상만으로 구분 금지
6. **테이블→카드 전환**: 가로 스크롤 필요한 테이블은 모바일에서 카드형 레이아웃
7. **아이콘 전용 버튼 금지**: 아이콘 옆 반드시 텍스트 레이블 병기

### Opinion 뱃지 스타일

**MarketOpinion** (시장 기준):
```
긍정적: bg-emerald-500/10 text-emerald-400 border-emerald-500/20
중립적: bg-slate-500/10 text-slate-400 border-slate-500/20
부정적: bg-red-500/10 text-red-400 border-red-500/20
```

**HoldingOpinion** (보유 기준 — UI 표시 라벨은 소프트화, 내부 알고리즘 값은 유지):
```
보유      → "보유"       bg-blue-500/10 text-blue-400
추가매수  → "추가 검토"  bg-emerald-500/10 text-emerald-400
관망      → "관망"       bg-yellow-500/10 text-yellow-400
매도      → "주의 필요"  bg-red-500/10 text-red-400
```
"주의 필요"/"추가 검토" 뱃지 하단: "이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요." (italic)

**분석 중** (`sma_available === false`):
```
"분석 중" bg-slate-500/10 text-slate-400 (중립)
이유 텍스트: "이평선 데이터를 수집 중이에요. 잠시 후 다시 확인해보세요."
```

**추천 source 뱃지**:
```
전문가 선정 (manual): bg-purple-500/10 text-purple-400 + accordion
  콘텐츠: reason 텍스트 + "전문가가 직접 분석하여 선정한 종목이에요. 투자 결정은 본인이 하세요."
알고리즘:             bg-blue-500/10 text-blue-400 + accordion
  콘텐츠: reason 텍스트 + "10가지 지표를 자동 분석한 결과예요. 과거 성과가 미래를 보장하지 않아요."
```

**알림 뱃지** (ALERT_TYPE_LABELS — code 상수는 그대로, 표시 텍스트만 중립화):
```
sell_signal:  🔴 가격 하락 경고   (priority: high, border-l-red-500/50)
sma5_break:   📉 단기 하락 알림   (priority: medium)
sma5_touch:   💡 가격 지지 알림   (priority: medium)
target_near:  🎯 목표가 근접 알림 (priority: high, border-l-red-500/50)
undervalued:  💎 저평가 분석 결과 (priority: low)
```

**알림 출처 뱃지** (14차·15차 — `alert.source` 기반, 종목명 옆에 표시):
```
'holding'   → [보유 중]    bg-blue-500/10 text-blue-300
'watchlist' → [관심 종목]  bg-purple-500/10 text-purple-300
undefined   → [알림]       bg-slate-500/10 text-slate-400  (15차: 레거시 알림 폴백)
```
`sma5_break`/`sma5_touch`/`sell_signal`은 보유 종목에만 발송되므로 항상 `'holding'`. `target_near`/`undervalued`는 `holderSet` 조회로 결정 — 동일 device가 보유 중이면 `'holding'`, 관심 목록만 있으면 `'watchlist'`. source가 `undefined`인 경우는 schema 변경 이전 레거시 알림이며, 뱃지 누락으로 인한 혼란 방지를 위해 slate `[알림]` 폴백으로 표시.

### 컬러 팔레트 (다크 테마)
| 용도 | 클래스 |
|------|--------|
| 배경 (깊은) | `bg-slate-950` |
| 배경 (카드) | `bg-slate-900/50` |
| 테두리 | `border-slate-800` |
| 주요 액센트 | `blue-600`, `blue-500`, `blue-400` |
| 상승/긍정 | `emerald-500`, `emerald-400` |
| 하락/부정 | `red-500`, `red-400` |
| 텍스트 계층 | `slate-50` > `slate-300` > `slate-400` > `slate-600` |

### 공통 패턴
```
카드:     bg-slate-900/50 border border-slate-800 rounded-3xl p-6
버튼:     bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold px-4 py-3
인풋:     bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-blue-500
뱃지:     text-xs font-bold px-2.5 py-1 rounded-lg bg-{color}-500/10 text-{color}-400
호버:     hover:border-blue-500/30, hover:text-blue-400
애니메이션: animate-in, fade-in, slide-in-from-bottom-4, animate-spin
```

### 반응형 그리드
```
grid-cols-1 md:grid-cols-2 lg:grid-cols-3  (카드 그리드)
grid-cols-2 md:grid-cols-4                  (통계 카드 — 모바일 2열)
grid-cols-2 lg:grid-cols-4                  (스크리너 프리셋)
```

### 사이드바
고정 너비 `w-68` / 배경 `bg-slate-950/80 backdrop-blur-2xl` / 구분선 `border-r border-slate-800/60`

---

## 초보자 친화 UX 규칙

### 섹터별 지표 안내 (StockDetailView PER 카드)
PER 카드 하단에 카테고리별 보조 안내를 1줄 (`💡 ...`)로 표시:
- 기술/IT: "IT 기업은 PER 20~40배도 정상이에요. 성장성을 함께 봐야 해요."
- 금융/지주: "금융 기업은 PER 5~15배가 일반적이에요. 단순히 낮다고 저평가는 아니에요."
- 바이오/헬스케어: "바이오 기업은 R&D 투자로 일시 적자가 많아요. 부실로 단정하지 마세요."
- 에너지/소재: "에너지·소재는 원자재 가격에 따라 PER이 출렁여요."

### 스크리너 함정 안내 (ScreenerPage)
프리셋마다 `caveat` 필드를 두고, 결과 상단의 yellow 안내 카드 안에 노출. 활성 프리셋의 caveat이 결과 위에 표시됨:
- **저평가 우량주**: "⚠️ 금융·통신·자동차 업종이 많이 포함될 수 있어요. 이 업종은 원래 PER이 낮은 편이라 단순 저평가로 보기 어려워요."
- **안전한 자산주**: "⚠️ 자산 대비 저평가지만 사업이 부진한 경우도 많아요. ROE를 함께 확인해보세요."
- **고수익 성장주**: "⚠️ 일시적 호황으로 ROE가 높을 수 있어요. 최근 분기 실적도 함께 봐주세요."
- **소액 투자**: "⚠️ 주가가 낮다고 좋은 종목은 아니에요. 시가총액과 사업 내용을 꼭 확인하세요."

결과 상단 공통 안내: "📌 아래 종목들은 조건에 맞는 참고 목록이에요. 업종마다 정상 지표 범위가 달라 직접 확인이 필요해요. 투자 결정은 본인이 하세요."

### 포트폴리오 집중도 경고
종목 비중(`stock.value`)이 **>50%**일 때 HoldingsAnalysisPage 카드의 테두리를 yellow로 강조하고 카드 상단에 안내:
"⚠️ [종목명] 비중이 N%예요. 한 종목에 집중되면 이 종목 하락 시 손실이 커져요. 분산 투자를 검토해보세요."

### 시장 대비 수익률 (DashboardPage)
수익률 카드는 두 영역으로 분리:
- **subtitle**: `₩원금 → ₩평가액 (가중 평균)` (포트폴리오 자체)
- **tooltip 라인** (`StatCard.tooltip` props): `오늘 KOSPI ±N% ℹ️` — 클릭 시 인라인 팝오버
  ```
  KOSPI는 오늘 하루 변동률이에요. 내 수익률(매입 이후 전체 기간)과 직접 비교하기 어려워요.
  정밀한 같은 기간 비교는 Phase 4 백테스팅 모듈에서 도입돼요.
  [알겠어요]
  ```
- **부분 로딩**: KOSPI 데이터가 없으면 tooltip 라인 자체를 표시하지 않음 → 잘못된 비교 방지
- 카드 제목도 "수익률 (투자 대비 수익, **매입가 기준**)"으로 명시해 비교 기준을 분명히 함

### 포트폴리오 추이 차트 — 수익/손실 시각화 (15차 5-4)
DashboardPage AreaChart에 두 라인을 함께 렌더링:
- **`value` (평가금액)**: 실선 Area, 현재 포트폴리오 가치. 손실 구간(`avgProfitRate < 0`)이면 `#ef4444`, 수익은 `#3b82f6`
- **`cost` (투자원금)**: 회색(`#94a3b8`) 파선(`strokeDasharray="5 5"`) Line
- **Legend**: "평가금액 (현재 가치)" / "투자원금 (산 가격 합계)"
- 해석 규칙: `value` 라인이 `cost` 라인 **위**면 수익, **아래**면 손실 → "금액이 올랐는데 손해인가?" 혼동 해소
- `cost` 필드는 `/api/holdings/history` 응답에 이미 포함되므로 추가 API 불필요

### 보유종목 리스트 — 현재가 즉시 노출 (15차 5-1)
DashboardPage 보유종목 카드는 평단만 표시하면 "지금 가격"을 알 수 없어 초보자가 확인하기 어려움. 평단 옆에 현재가를 나란히 표시:
```
평단: ₩70,000 → 현재: ₩73,500   x 10주   +5.0%   평가: ₩735,000
```
화살표 `→`는 `text-slate-700`로 dim, "현재" 값은 `text-slate-300`로 대비. 평단과 현재가 즉시 비교 가능.

### PieChart 단일 종목 폴백 (15차 5-5)
DashboardPage 자산 배분 PieChart는 `holdings.length === 1`일 때 원 하나만 보여 의미가 없음. 이 경우 PieChart 대신:
- 단일 종목 카드: `📊 [종목명]` / `비중 100%`
- Amber 분산 권유 박스: `💡 종목을 2개 이상 추가하면 자산 배분 그래프를 볼 수 있어요. 한 종목에 집중하면 그 종목 하락 시 손실이 커져요.`

`holdings.length >= 2`에서만 정상 PieChart + Legend 렌더링.

### 보유종목 수익률 계산식 안내
HoldingsAnalysisPage 종목 카드의 "수익률" 헤더 옆 `HelpCircle` 아이콘 → 인라인 팝오버:
```
수익률 = (현재가 - 평단가) ÷ 평단가 × 100
예: 평단가 70,000원, 현재가 73,500원
→ (73,500 - 70,000) ÷ 70,000 × 100 = +5.0%
```
초보자가 수익률 계산 방식을 모르면 앱 결과를 불신하므로 명시.

### 섹터 비교 백분위 (StockDetailView)
섹터 비교 테이블 위에 "📊 이 종목의 업종 내 위치" 박스. PER/PBR/ROE 각각 백분위 계산:
- 상위 25%: "✓ 우수한 편"
- 상위 50%: "✓ 우수한 편"
- 하위 50%: "주의 필요"
- 하위 25%: "주의 필요"

PER/PBR은 낮을수록 좋음, ROE는 높을수록 좋음으로 방향 보정. 단순 평균 비교(`+N%`)보다 직관적.

### 공통 에러 표시 (`ErrorBanner`)
페이지/위젯의 에러 상태는 `ErrorBanner` 컴포넌트로 통일 표시한다.
- Props: `error: string | null` (null이면 미렌더), `kind?: 'network' | 'server' | 'unknown'`, `onRetry?`
- `kind`별 헤드라인:
  - `network`: "네트워크 연결을 확인해 주세요"
  - `server`: "서버에서 데이터를 불러오지 못했어요"
  - `unknown`: "데이터를 불러오지 못했어요"
- `onRetry`가 있으면 우측에 "다시 시도" 버튼 (44x44px 터치 타겟 충족)
- **사용처**: HoldingsAnalysisPage(`portfolioStore.error`), DashboardPage(`historyError`), MajorStocksPage(`error`)

PostgreSQL 전환 후 DB 연결 실패 케이스가 늘어날 수 있으므로, 신규 데이터 페치 추가 시 try/catch에 ErrorBanner를 즉시 연결하는 것을 기본으로 한다.

### 서버 연결 스플래시 (App.tsx)
앱 진입 시 `/api/health` 응답을 기다린 후에만 본 UI 진입. 이전에는 서버가 5초 후 syncAllStocks를 실행하는 동안 빈 화면이 보였음. Render 콜드 스타트(첫 요청 30~60초 지연) 시에도 사용자에게 명확한 안내 제공.

상태:
- `'checking'` (초기): "데이터를 불러오는 중이에요..." + 스피너
- `'ok'`: 정상 본 UI 진입. holdings/marketIndices fetching 시작
- `'timeout'` (10초 AbortController): "서버가 잠시 바빠요. 조금 후 다시 시도해 주세요." + [다시 시도] 버튼

`VITE_API_BASE_URL` 환경변수로 API base URL을 변경 가능 (배포 시).

### 지표 가용성 안내 (StockDetailView)
RSI/MACD/볼린저밴드의 `*_available === false` 시 종합 지표 패널 하단에 슬레이트 안내 박스:
```
⏳ 일부 지표는 데이터 수집 중이에요
RSI — 최소 15일 데이터가 필요해요. 현재 N일치 수집됨, 약 (15-N)일 후 표시돼요.
MACD — 최소 26일 데이터가 필요해요. 현재 N일치 수집됨, 약 (26-N)일 후 표시돼요.
볼린저밴드 — 최소 20일 데이터가 필요해요. 현재 N일치 수집됨, 약 (20-N)일 후 표시돼요.
```
정보성 톤(slate). 에러 아님. `sma_available`과 동일 패턴.

### 수익률 행동 유도 텍스트 (6구간)
| 구간 | 문구 |
|------|------|
| ≥20% | "목표 수익 달성! 🎉 일부 팔아볼까요? [종목 보기 →]" |
| ≥10% | "잘 하고 계세요! 추세를 유지해 보세요" |
| ≥0% | "소폭 수익 중이에요. 지켜보세요" |
| ≥-3% | "소폭 손실이에요. 주식은 단기 등락이 있어요. 조금 더 지켜볼까요?" |
| ≥-7% | "손실이 커지고 있어요. 손절 기준(-7%)에 근접했어요" |
| <-7% | "손실이 커지고 있어요 🔴 지금 확인해보세요 [종목 보기 →]" |

### 보유종목 holding_opinion 이유 텍스트
| 상태 | 표시 라벨 | 이유 텍스트 |
|------|----------|-----------|
| 매도(손절) | 주의 필요 | "평단가 대비 -N% 손실. 손절 기준(-7%) 초과" |
| 매도(이탈) | 주의 필요 | "5일선·20일선 모두 이탈. 하락세가 강해요" |
| 관망 | 관망 | "5일선 아래지만 20일선이 지지 중. 조금 기다려봐요" |
| 추가매수 | 추가 검토 | "5일선 근처에서 지지받고 있어요" |
| 보유 | 보유 | "5일선 위, 이평선 정배열. 상승 흐름 유지 중" |

---

## Capacitor 전환 체크리스트 (Phase 3)
- [ ] `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` 설치
- [ ] `@capacitor/preferences` 설치 → `CapacitorDeviceIdStorage` 구현체 작성
- [ ] `DeviceIdStorage` 구현체 환경별 분기 (`import.meta.env.VITE_PLATFORM`)
- [ ] API Base URL 환경변수화 (`VITE_API_BASE_URL`)
- [ ] `npx cap init` → `npx cap add ios` / `npx cap add android`
- [ ] `npm run build && npx cap sync` 빌드 파이프라인 확인
- [ ] 오프라인 캐시: `@capacitor/preferences`에 마지막 holdings 데이터 저장 + `@capacitor/network`로 오프라인 감지 → 캐시 로드 → 오프라인 배너 (에러 미설정)
- [ ] Push Notification: `@capacitor/push-notifications` + FCM/APNs 설정
