# Stock Analyzer

한국 주식 분석 및 포트폴리오 관리 애플리케이션.

10점 만점 통합 스코어링(밸류에이션·기술지표·수급·추세)을 기반으로 종목 추천, 보유종목 의견(매도/관망/추가매수/보유), 알림을 제공한다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite 7, Tailwind CSS v4, Recharts, Zustand |
| 백엔드 | Node.js, Express, SQLite3 (better-sqlite3), express-rate-limit |
| 데이터 | 네이버 증권 스크래핑 + 토스증권 차트 캡처 (Puppeteer) |
| 배포 예정 | Capacitor (iOS/Android) |

## 실행

```bash
npm install
npm run dev              # 프론트엔드 (localhost:5173)
node server/server.js    # 백엔드 (localhost:3001)
```

## 문서

- [CLAUDE.md](CLAUDE.md) — 개발 가이드 (핵심 규칙, 알고리즘, DB, API)
- [docs/BACKEND.md](docs/BACKEND.md) — 백엔드 상세
- [docs/FRONTEND.md](docs/FRONTEND.md) — 프론트엔드 상세
- [docs/AI.md](docs/AI.md) — AI 활용 내역
