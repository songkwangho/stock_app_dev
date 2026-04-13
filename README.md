# Stock Analyzer

한국 주식 분석 및 포트폴리오 관리 애플리케이션.

10점 만점 통합 스코어링(밸류에이션·기술지표·수급·추세)을 기반으로 종목 추천, 보유종목 의견(매도/관망/추가매수/보유), 알림을 제공한다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite 7, Tailwind CSS v4, Recharts, Zustand |
| 백엔드 | Node.js, Express, PostgreSQL (pg, Neon 무료 플랜), express-rate-limit |
| 데이터 | 네이버 증권 스크래핑 (KIS/KRX 공식 API 전환 예정) |
| 배포 예정 | Vercel + Render + Neon (웹) → Capacitor (iOS/Android) |

## 실행

```bash
npm install
npm run dev                                        # 프론트엔드 (localhost:5173)
DATABASE_URL=postgres://... node server/server.js  # 백엔드 (localhost:3001)
```

> `DATABASE_URL` 환경변수 필수. Neon 무료 플랜 권장. 서버 기동 시 스키마 자동 생성 + 시드 데이터 등록 + 5초 후 첫 `syncAllStocks` 실행 (실패 시 30초 backoff 1회 재시도).

### 배포 환경변수 (Render)
| 이름 | 용도 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL connection string (필수) |
| `FRONTEND_URL` | Vercel 프론트엔드 URL. 콤마로 다중 도메인 가능 — CORS `ALLOWED_ORIGINS`에 자동 포함 |
| `NODE_ENV=production` | pg `ssl: { rejectUnauthorized: false }` 활성화 |

### 장기 데이터 적재 (Phase 4 선행)
```bash
DATABASE_URL=postgres://... node scripts/backfill-history.js --days 1095  # 97종목 × 3년
node scripts/backfill-history.js --resume                                  # 실패 후 이어받기
```

## 문서

- [CLAUDE.md](CLAUDE.md) — 개발 가이드 (핵심 규칙, 알고리즘, DB, API)
- [docs/BACKEND.md](docs/BACKEND.md) — 백엔드 상세 (PG 스키마, 28개 API, 알고리즘)
- [docs/FRONTEND.md](docs/FRONTEND.md) — 프론트엔드 상세 (스토어, 페이지, 컴포넌트)
- [docs/FRONTEND_UX.md](docs/FRONTEND_UX.md) — UX 원칙 (온보딩, 면책, 초보자 안내)
- [docs/AI.md](docs/AI.md) — AI 활용 내역 + 기술 부채
- [docs/SKILL_KOREAN_STOCK_APP.md](docs/SKILL_KOREAN_STOCK_APP.md) — 도메인 지식 (지표 해석, 섹터별 특성)
