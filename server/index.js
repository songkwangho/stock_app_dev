/**
 * Stock Analyzer — Express Server Entry Point
 *
 * 분리된 모듈:
 *   db/connection.js, db/schema.js, db/migrate.js
 *   helpers/cache.js, helpers/deviceId.js
 *   scrapers/naver.js, scrapers/toss.js
 *   domains/analysis/scoring.js, domains/analysis/indicators.js
 *   domains/alert/service.js
 *   domains/stock/data.js
 *   scheduler.js
 *
 * 미분리 (server.js에 잔존):
 *   getStockData(), 모든 라우트 핸들러, syncAllStocks()
 *   → Phase 2 후속 작업으로 domains/stock/, domains/portfolio/, domains/watchlist/ 분리 예정
 */

// server.js가 기존 진입점이므로 그대로 import하여 실행
// server.js 내부에서 app.listen()이 호출됨
import './server.js';
