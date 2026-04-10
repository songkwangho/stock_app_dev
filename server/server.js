import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Separated Modules ---
import db from './db/connection.js';
import { initSchema } from './db/schema.js';
import { runMigrations } from './db/migrate.js';
import { setupScheduler, setupCleanup } from './scheduler.js';

// --- Domain Routers ---
import alertRouter from './domains/alert/router.js';
import watchlistRouter from './domains/watchlist/router.js';
import portfolioRouter from './domains/portfolio/router.js';
import analysisRouter from './domains/analysis/router.js';
import stockRouter from './domains/stock/router.js';
import systemRouter from './domains/system/router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// --- Database Initialization ---
initSchema(db);
runMigrations(db);

// --- Seed Data (dynamic import: must run AFTER migrations) ---
await import('./domains/stock/data.js');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS whitelist (dev + production origins)
const ALLOWED_ORIGINS = [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:4173',  // Vite preview
    'http://localhost:3000',  // alternative dev
    'capacitor://localhost',  // Capacitor iOS
    'http://localhost',       // Capacitor Android
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
}));
app.use(express.json());

// Rate limiting per device_id (or IP fallback)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute per key
    keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
    validate: false,
});
app.use('/api/', apiLimiter);
app.use('/charts', express.static(path.join(__dirname, '..', 'public', 'charts')));

// Cleanup old data + start scheduler (delayed sync on startup + daily 8AM)
setupCleanup(db);
setupScheduler();

// --- Mount Domain Routers ---
// Path-prefix 라우터(alerts/watchlist/holdings)는 prefix가 겹치지 않아 순서 무관.
// '/api'에 직접 마운트되는 analysis/stock/system은 specific path를 먼저 둬야 한다 —
// analysisRouter의 '/stock/:code/indicators'가 stockRouter의 '/stock/:code'에 가로채이지 않도록.
app.use('/api/alerts', alertRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/holdings', portfolioRouter);
app.use('/api', systemRouter);   // owns /health, /market/indices (no /stock/* conflict)
app.use('/api', analysisRouter); // owns /stock/:code/{indicators,volatility,financials,news,chart}, /screener, /sector
app.use('/api', stockRouter);    // owns /stock/:code, /stocks, /search, /recommendations

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
