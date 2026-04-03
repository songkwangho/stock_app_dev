import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/charts', express.static(path.join(__dirname, '..', 'public', 'charts')));

// --- In-memory cache with TTL ---
const stockCache = new Map(); // code -> { data, timestamp }
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(code) {
    const entry = stockCache.get(code);
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
        return entry.data;
    }
    return null;
}

function setCache(code, data) {
    stockCache.set(code, { data, timestamp: Date.now() });
}

// SQLite Database Setup
const dbPath = path.resolve(__dirname, '..', 'stocks.db');
const db = new Database(dbPath);
console.log('Database connected at:', dbPath);

// Initialize Database Tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS stocks (
    code TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    price INTEGER,
    change TEXT,
    change_rate TEXT,
    per REAL,
    pbr REAL,
    roe REAL,
    target_price INTEGER,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS holding_stocks (
    code TEXT PRIMARY KEY,
    avg_price INTEGER,
    weight INTEGER,
    quantity INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code) REFERENCES stocks (code)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS stock_history (
    code TEXT,
    date TEXT,
    price INTEGER,
    open INTEGER,
    high INTEGER,
    low INTEGER,
    volume INTEGER,
    PRIMARY KEY (code, date)
  )
`).run();

// Migration: add OHLCV columns if missing
try {
    const cols = db.prepare("PRAGMA table_info(stock_history)").all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('open')) db.prepare('ALTER TABLE stock_history ADD COLUMN open INTEGER').run();
    if (!colNames.includes('high')) db.prepare('ALTER TABLE stock_history ADD COLUMN high INTEGER').run();
    if (!colNames.includes('low')) db.prepare('ALTER TABLE stock_history ADD COLUMN low INTEGER').run();
    if (!colNames.includes('volume')) db.prepare('ALTER TABLE stock_history ADD COLUMN volume INTEGER').run();
} catch (e) { console.error('Migration (stock_history OHLCV):', e.message); }

db.prepare(`
  CREATE TABLE IF NOT EXISTS recommended_stocks (
    code TEXT PRIMARY KEY,
    reason TEXT,
    fair_price INTEGER,
    score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code) REFERENCES stocks (code)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS stock_analysis (
    code TEXT PRIMARY KEY,
    analysis TEXT,
    advice TEXT,
    opinion TEXT,
    toss_url TEXT,
    chart_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code) REFERENCES stocks (code)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS watchlist (
    code TEXT PRIMARY KEY,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code) REFERENCES stocks (code)
  )
`).run();

// Migration: add quantity to holding_stocks if missing
try {
    const cols = db.prepare("PRAGMA table_info(holding_stocks)").all();
    if (!cols.some(c => c.name === 'quantity')) {
        db.prepare('ALTER TABLE holding_stocks ADD COLUMN quantity INTEGER DEFAULT 0').run();
    }
} catch (e) { console.error('Migration (holding_stocks.quantity):', e.message); }

// Database Indices for query performance
db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_history_code_date ON stock_history(code, date)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_stocks_category ON stocks(category)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read, created_at)').run();

// Migration: Handle structural changes
try {
    // Add category column to stocks if it doesn't exist
    const columns = db.prepare("PRAGMA table_info(stocks)").all();
    if (!columns.some(col => col.name === 'category')) {
        db.prepare('ALTER TABLE stocks ADD COLUMN category TEXT').run();
    }
} catch (e) {
    console.error('Migration error (stocks.category):', e.message);
}

try {
    // Migrate existing holdings to holding_stocks
    const existingHoldings = db.prepare('SELECT code, avg_price, weight FROM stocks WHERE avg_price IS NOT NULL').all();
    for (const h of existingHoldings) {
        db.prepare(`
            INSERT INTO holding_stocks (code, avg_price, weight)
            VALUES (?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                avg_price = excluded.avg_price,
                weight = excluded.weight
        `).run(h.code, h.avg_price, h.weight);
    }
} catch (e) {
    console.error('Migration error (holding_stocks migration):', e.message);
}

try {
    // Cleanup old columns from stocks (SQLite doesn't support DROP COLUMN in older versions easily, but 3.35+ does)
    // We'll just leave them for now or use the new table if needed. 
    // For simplicity, we'll keep the server code pointed to the new structure.
} catch (e) { }

// Migration: Add created_at to recommended_stocks if missing
try {
    const columns = db.prepare("PRAGMA table_info(recommended_stocks)").all();
    if (!columns.some(col => col.name === 'created_at')) {
        db.prepare('ALTER TABLE recommended_stocks ADD COLUMN created_at DATETIME').run();
        db.prepare('UPDATE recommended_stocks SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL').run();
    }
} catch (e) {
    console.error('Migration error (recommended_stocks.created_at):', e.message);
}

// Migration: Add chart_path to stock_analysis if missing
try {
    const columns = db.prepare("PRAGMA table_info(stock_analysis)").all();
    if (!columns.some(col => col.name === 'chart_path')) {
        db.prepare('ALTER TABLE stock_analysis ADD COLUMN chart_path TEXT').run();
    }
} catch (e) {
    console.error('Migration error (stock_analysis.chart_path):', e.message);
}

// Cleanup function for data older than 20 days
function cleanupOldData() {
    console.log('Running cleanup for data older than 20 days...');
    try {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 20);
        const thresholdStr = thresholdDate.toISOString();

        const delAnalysis = db.prepare('DELETE FROM stock_analysis WHERE created_at < ?').run(thresholdStr);
        const delRecs = db.prepare('DELETE FROM recommended_stocks WHERE created_at < ?').run(thresholdStr);

        console.log(`Cleanup complete: Deleted ${delAnalysis.changes} analysis rows and ${delRecs.changes} recommendation rows.`);
    } catch (error) {
        console.error('Cleanup Error:', error.message);
    }
}

// Run cleanup immediately on start and then every 24 hours
cleanupOldData();
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

// Initial Population for Recommended Stocks
const initialRecommendations = [
    { code: '005930', name: '삼성전자', category: 'IT/반도체', reason: '실적 턴어라운드 및 HBM 수요 기대', fairPrice: 85000, score: 92 },
    { code: '000660', name: 'SK하이닉스', category: 'IT/반도체', reason: 'HBM 시장 독점적 지위 및 메모리 단가 상승', fairPrice: 210000, score: 95 },
    { code: '035420', name: 'NAVER', category: '플랫폼', reason: 'AI 검색 엔진 경쟁력 및 광고 수익 회복', fairPrice: 230000, score: 88 },
    { code: '035720', name: '카카오', category: '플랫폼', reason: '카카오톡 비즈니스 모델 고도화', fairPrice: 65000, score: 82 },
    { code: '005380', name: '현대차', category: '자동차', reason: '하이브리드/전기차 점유율 확대 및 고배당', fairPrice: 280000, score: 90 },
    { code: '000270', name: '기아', category: '자동차', reason: '역대급 수익성 지속 및 주주환원 강화', fairPrice: 140000, score: 91 },
    { code: '373220', name: 'LG에너지솔루션', category: '2차전지', reason: '글로벌 수주 잔고 압도적 1위', fairPrice: 450000, score: 85 },
    { code: '006400', name: '삼성SDI', category: '2차전지', reason: '차세대 배터리 수익성 위주 성장', fairPrice: 420000, score: 84 },
    { code: '005490', name: 'POSCO홀딩스', category: '에너지/철강', reason: '리튬 사업 가치 가시화', fairPrice: 480000, score: 83 },
    { code: '207940', name: '삼성바이오로직스', category: '바이오', reason: '압도적인 CMO 생산 능력 및 수주', fairPrice: 1050000, score: 89 },
    { code: '068270', name: '셀트리온', category: '바이오', reason: '짐펜트라 등 신약 매출 본격화', fairPrice: 220000, score: 87 },
    { code: '105560', name: 'KB금융', category: '금융', reason: '밸류업 프로그램 최대 수혜주', fairPrice: 95000, score: 93 },
    { code: '055550', name: '신한지주', category: '금융', reason: '안정적 배당 및 자사주 소각', fairPrice: 62000, score: 86 },
    { code: '090430', name: '아모레퍼시픽', category: '화장품/소비재', reason: '코스알엑스 실적 반영 및 서구권 매출 증대', fairPrice: 180000, score: 81 },
    { code: '139480', name: '이마트', category: '유통', reason: '자회사 구조조정 및 본업 수익성 개선', fairPrice: 85000, score: 78 },
    { code: '051910', name: 'LG화학', category: '화학/2차전지', reason: '양극재 비중 확대에 따른 밸류에이션 재평가', fairPrice: 500000, score: 80 },
    { code: '096770', name: 'SK이노베이션', category: '에너지', reason: 'SK E&S 합병에 따른 재무 건전성 확보', fairPrice: 140000, score: 79 },
    { code: '352820', name: '하이브', category: '엔터테인먼트', reason: '위버스 플랫폼 수익화 및 아티스트 라인업 다변화', fairPrice: 250000, score: 83 },
    { code: '329180', name: 'HD현대중공업', category: '조선', reason: '조선 업황 슈퍼사이클 진입 및 선가 상승', fairPrice: 210000, score: 94 },
    { code: '012330', name: '현대모비스', category: '자동차', reason: '전동화 부품 매출 비중 확대', fairPrice: 270000, score: 84 }
];

const insertStock = db.prepare(`
    INSERT INTO stocks (code, name, category)
    VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        category = excluded.category
`);

const insertRec = db.prepare(`
    INSERT INTO recommended_stocks (code, reason, fair_price, score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
        reason = excluded.reason,
        fair_price = excluded.fair_price,
        score = excluded.score
`);

const populateRecs = db.transaction((recs) => {
    for (const r of recs) {
        insertStock.run(r.code, r.name, r.category);
        insertRec.run(r.code, r.reason, r.fairPrice, r.score);
    }
});
populateRecs(initialRecommendations);

// Function to sync prices for major stocks (initial recommendations)
// Uses batched parallelism (5 concurrent) to avoid rate limiting
async function syncMajorStocks() {
    console.log('Syncing major stocks prices...');
    const BATCH_SIZE = 5;
    for (let i = 0; i < initialRecommendations.length; i += BATCH_SIZE) {
        const batch = initialRecommendations.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map(r => getStockData(r.code, r.name).catch(e =>
                console.error(`Failed to sync ${r.name}:`, e.message)
            ))
        );
    }
    console.log('Major stocks sync complete.');
}

// Naver Finance API URL
const NAVER_FINANCE_URL = 'https://api.finance.naver.com/siseJson.naver';

const CATEGORY_MAP = {
    '기술/IT': ['반도체', '디스플레이', 'IT', '하드웨어', '통신장비', '전자제품', '컴퓨터', '핸드셋', '소프트웨어', '네트워크장비'],
    '바이오/헬스케어': ['제약', '생물공학', '의료기기', '건강관리', '바이오'],
    '자동차/모빌리티': ['자동차', '부품', '타이어'],
    '에너지/소재': ['전기제품', '화학', '철강', '비철금속', '에너지장비', '석유', '가스', '2차전지', '배터리'],
    '금융/지주': ['은행', '증권', '보험', '지주사', '금융'],
    '소비재/서비스': ['식품', '화장품', '소매', '백화점', '섬유', '의류', '의복', '생활용품', '악기', '레저', '가구', '유통', '음식료'],
    '엔터테인먼트/미디어': ['게임', '양방향미디어', '방송', '광고', '영화', '콘텐츠', '기획사', '포털'],
    '조선/기계/방산': ['조선', '기계', '항공우주', '건설', '방산', '방위산업']
};

function mapToCategory(industry) {
    if (!industry) return '기타/미분류';
    for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
        if (keywords.some(kw => industry.includes(kw))) {
            return cat;
        }
    }
    return '소비재/서비스'; // Default
}

// --- Toss Securities Chart Capture ---
const chartsDir = path.join(__dirname, '..', 'public', 'charts');
if (!fs.existsSync(chartsDir)) {
    fs.mkdirSync(chartsDir, { recursive: true });
}

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
    }
    return browserInstance;
}

async function captureChart(code) {
    const outputPath = path.join(chartsDir, `${code}.png`);

    // Skip if captured recently (less than 1 hour old)
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 60 * 60 * 1000) return `/charts/${code}.png`;
    }

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 460 });

        await page.goto(`https://tossinvest.com/stocks/${code}/order`, {
            waitUntil: 'networkidle2',
            timeout: 20000
        });

        // Wait for chart element to render
        await page.waitForSelector('canvas, svg, [class*="chart"], [class*="Chart"]', { timeout: 10000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));

        await page.screenshot({ path: outputPath, fullPage: false });
        await page.close();

        console.log(`Chart captured for ${code}`);
        return `/charts/${code}.png`;
    } catch (error) {
        console.error(`Chart capture failed for ${code}:`, error.message);
        // Return existing image if available
        return fs.existsSync(outputPath) ? `/charts/${code}.png` : null;
    }
}

// Run sync on start and every 1 hour
syncMajorStocks();
setInterval(syncMajorStocks, 60 * 60 * 1000);

// Alert generation: check conditions and create alerts (avoid duplicates within 24h)
function generateAlerts(code, name, price, sma5, targetPrice, opinion, isHolding) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const hasDuplicate = (type) => {
        return db.prepare(
            'SELECT 1 FROM alerts WHERE code = ? AND type = ? AND created_at > ?'
        ).get(code, type, oneDayAgo);
    };

    // Holding alerts
    if (isHolding && sma5) {
        if (price < sma5 && !hasDuplicate('sma5_break')) {
            db.prepare('INSERT INTO alerts (code, name, type, message) VALUES (?, ?, ?, ?)').run(
                code, name, 'sma5_break',
                `${name}(${code}) 주가가 5일선(${sma5.toLocaleString()}원)을 하향 이탈했습니다. 리스크 관리가 필요합니다.`
            );
        }
        if (price >= sma5 * 0.99 && price <= sma5 * 1.01 && !hasDuplicate('sma5_touch')) {
            db.prepare('INSERT INTO alerts (code, name, type, message) VALUES (?, ?, ?, ?)').run(
                code, name, 'sma5_touch',
                `${name}(${code}) 주가가 5일선(${sma5.toLocaleString()}원) 부근에서 지지를 받고 있습니다. 추가매수 타점을 검토해 보세요.`
            );
        }
    }

    // Target price alerts
    if (targetPrice && price > 0) {
        if (price >= targetPrice * 0.95 && !hasDuplicate('target_near')) {
            db.prepare('INSERT INTO alerts (code, name, type, message) VALUES (?, ?, ?, ?)').run(
                code, name, 'target_near',
                `${name}(${code}) 현재가(${price.toLocaleString()}원)가 목표가(${targetPrice.toLocaleString()}원)에 근접했습니다.`
            );
        }
        if (price < targetPrice * 0.7 && !hasDuplicate('undervalued')) {
            db.prepare('INSERT INTO alerts (code, name, type, message) VALUES (?, ?, ?, ?)').run(
                code, name, 'undervalued',
                `${name}(${code}) 현재가가 목표가 대비 30% 이상 저평가 상태입니다. 매수 기회를 검토해 보세요.`
            );
        }
    }

    // Opinion change alert
    if (opinion === '매도' && isHolding && !hasDuplicate('sell_signal')) {
        db.prepare('INSERT INTO alerts (code, name, type, message) VALUES (?, ?, ?, ?)').run(
            code, name, 'sell_signal',
            `${name}(${code}) 분석 의견이 "매도"로 전환되었습니다. 포지션 점검이 필요합니다.`
        );
    }
}

// Helper function to fetch and store stock data (with cache)
async function getStockData(code, fallbackName = null) {
    // Check cache first
    const cached = getCached(code);
    if (cached) return cached;

    try {
        // Fetch last 60 days to ensure we have enough for 40 business days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 65);
        const startTime = sixtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
        const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // Parallel fetch: price history + investor data + main page metrics
        const [response, investorResult, mainPageResult] = await Promise.allSettled([
            axios.get(NAVER_FINANCE_URL, {
                params: { symbol: code, requestType: 1, startTime, endTime, timeframe: 'day' },
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' }
            }),
            axios.get(`https://finance.naver.com/item/frgn.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }),
            axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
        ]);

        // --- Process price history ---
        const priceResponse = response.status === 'fulfilled' ? response.value : null;
        let allMatches = [];
        if (priceResponse) {
            const rawData = priceResponse.data.trim();
            const cleanedData = rawData.replace(/\s+/g, '');
            allMatches = [...cleanedData.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];
        }

        if (allMatches.length === 0) {
            const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
            const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
            const result = stock ? { ...stock, history: history.reverse() } : null;
            if (result) setCache(code, result);
            return result;
        }

        // Save History (OHLCV) in transaction
        const insertHistory = db.prepare(`
            INSERT INTO stock_history (code, date, price, open, high, low, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code, date) DO UPDATE SET
                price = excluded.price, open = excluded.open,
                high = excluded.high, low = excluded.low, volume = excluded.volume
        `);
        const transaction = db.transaction((matches) => {
            for (const match of matches) {
                // match groups: [1]=date, [2]=open, [3]=high, [4]=low, [5]=close, [6]=volume
                insertHistory.run(code, match[1],
                    parseInt(match[5]), parseInt(match[2]),
                    parseInt(match[3]), parseInt(match[4]), parseInt(match[6]));
            }
        });
        transaction(allMatches);

        // --- Process investor data ---
        let investorData = [];
        if (investorResult.status === 'fulfilled') {
            try {
                const investorHtml = new TextDecoder('euc-kr').decode(investorResult.value.data);
                const investorRegex = /<tr.*?>\s*<td.*?><span.*?>([\d.]{10})<\/span><\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>/g;
                let invMatch;
                const matches = [];
                while ((invMatch = investorRegex.exec(investorHtml)) !== null && matches.length < 20) {
                    const date = invMatch[1].replace(/\./g, '');
                    const instNet = parseInt(invMatch[4].replace(/,/g, ''));
                    const foreignNet = parseInt(invMatch[5].replace(/,/g, ''));
                    matches.push({
                        date,
                        institution: instNet,
                        foreign: foreignNet,
                        individual: -(instNet + foreignNet)
                    });
                }
                investorData = matches.reverse();
            } catch (investorError) {
                console.error(`Investor Parse Error for ${code}:`, investorError.message);
            }
        }

        // --- Process main page metrics ---
        let per = null, pbr = null, roe = null, targetPrice = null;
        let html = '';
        if (mainPageResult.status === 'fulfilled') {
            try {
                const buffer = mainPageResult.value.data;
                const tempStr = buffer.toString('ascii');
                let charset = 'euc-kr';

                const metaMatch = tempStr.match(/<meta.*?charset=["']?([\w-]+)["']?/i);
                if (metaMatch) {
                    charset = metaMatch[1].toLowerCase();
                } else {
                    const contentType = mainPageResult.value.headers['content-type'];
                    if (contentType && contentType.includes('charset=')) {
                        charset = contentType.split('charset=')[1].trim().toLowerCase();
                    }
                }

                html = new TextDecoder(charset).decode(buffer);
                // If decoded text contains replacement characters, retry with euc-kr
                if (html.includes('\uFFFD')) {
                    html = new TextDecoder('euc-kr').decode(buffer);
                }

                const perMatch = html.match(/<em id="_per">([\d.]+)<\/em>/);
                const pbrMatch = html.match(/<em id="_pbr">([\d.]+)<\/em>/);
                const tpMatch = html.match(/class="rwidth"[\s\S]*?<span class="bar">l<\/span>[\s\S]*?<em>([\d,]+)<\/em>/);

                per = perMatch ? parseFloat(perMatch[1]) : null;
                pbr = pbrMatch ? parseFloat(pbrMatch[1]) : null;
                targetPrice = tpMatch ? parseInt(tpMatch[1].replace(/,/g, '')) : null;

                const roeRegex = /th_cop_anal13(?:[\s\S]*?<td.*?>){4}\s*([\d.-]+)/;
                const roeMatch = html.match(roeRegex);
                roe = (roeMatch && roeMatch[1] !== '-') ? parseFloat(roeMatch[1]) : null;

                console.log(`Scraped for ${code}: PER=${per}, PBR=${pbr}, ROE=${roe}, TP=${targetPrice}`);
            } catch (scrapingError) {
                console.error(`Scraping Error for ${code}:`, scrapingError.message);
            }
        }

        const latestMatch = allMatches[allMatches.length - 1];
        const latestPrice = parseInt(latestMatch[5]);

        const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);

        const existing = db.prepare('SELECT name, category FROM stocks WHERE code = ?').get(code);

        let industry = null;
        try {
            // Updated industry regex: more flexible with attributes
            const indMatch = html.match(/type=upjong&no=\d+["'][^>]*>([^<]+)<\/a>/);
            if (indMatch) industry = indMatch[1].trim();
            console.log(`Detected industry for ${code}: ${industry}`);
        } catch (e) {
            console.error(`Industry Scrape Error for ${code}:`, e.message);
        }

        const categoryToSave = mapToCategory(industry);

        // Extract name from HTML title tag (most reliable source)
        let scrapedName = null;
        const nameMatch = html?.match(/<title>(.*?) : /);
        if (nameMatch) {
            scrapedName = nameMatch[1].trim();
        }

        let nameToSave = code;
        if (scrapedName) {
            // Prefer freshly scraped name (avoids stale garbled data)
            nameToSave = scrapedName;
        } else if (fallbackName) {
            nameToSave = fallbackName;
        } else if (existing && existing.name && existing.name !== code) {
            nameToSave = existing.name;
        }

        db.prepare(`
            INSERT INTO stocks (code, name, price, change, change_rate, per, pbr, roe, target_price, category, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                price = excluded.price,
                name = excluded.name,
                per = excluded.per,
                pbr = excluded.pbr,
                roe = excluded.roe,
                target_price = excluded.target_price,
                category = excluded.category,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, nameToSave, latestPrice, "0", "0.00", per, pbr, roe, targetPrice, categoryToSave);

        // Advanced Analysis Generation Logic
        const historyRev = history.reverse();
        const getSMA = (days) => {
            if (historyRev.length < days) return null;
            const slice = historyRev.slice(-days);
            return Math.round(slice.reduce((acc, cur) => acc + cur.price, 0) / days);
        };

        const sma5 = getSMA(5);
        const sma20 = getSMA(20);

        const isHolding = db.prepare('SELECT 1 FROM holding_stocks WHERE code = ?').get(code);

        let analysis = `시장 전체 수급 흐름과 기술적 지표가 우호적인 환경을 조성하고 있습니다.`;
        let advice = `현재 시장 환경을 고려할 때 분할 매수 관점에서 접근이 유효해 보입니다.`;
        let opinion = `중립적`;

        if (isHolding) {
            // Rule 4, 5, 6, 7, 8: Holdings analysis based on 5-day MA
            if (!sma5) {
                opinion = '보유';
                analysis = '데이터가 충분하지 않으나 현재 추세를 유지하고 있습니다.';
                advice = '추세 유지 시 보유 전략을 권장합니다.';
            } else if (latestPrice >= sma5) {
                if (latestPrice <= sma5 * 1.01) { // Rules 5 & 6
                    opinion = '추가매수';
                    analysis = `현재 주가가 5일선(${sma5.toLocaleString()}원) 부근에서 지지를 받고 있는 안전한 타점입니다.`;
                    advice = '5일선 터치 및 지지 시점이므로 비중 확대를 고려할 수 있습니다.';
                } else { // Rule 8
                    opinion = '보유';
                    analysis = `주가가 5일선 위에서 안정적으로 유지되며 정배열 추세를 지속하고 있습니다.`;
                    advice = '추세가 유지되고 있으므로 기존 물량을 보유하며 수익을 극대화하는 전략이 필요합니다.';
                }
            } else { // Rule 7
                opinion = '매도';
                analysis = `주가가 5일선(${sma5.toLocaleString()}원)을 하향 돌파하며 단기 추세가 약화되었습니다.`;
                advice = '5일선 이탈 시 리스크 관리를 위해 비중 축소 또는 매도 대응을 권장합니다.';
            }
        } else {
            // Rules 9, 10, 11, 12: Recommendations analysis (integrated with technical indicators)
            const isBullish = sma5 && sma20 && sma5 > sma20;
            const alignment = isBullish ? '정배열' : '역배열/혼조';
            const distance = sma5 ? Math.abs((latestPrice - sma5) / sma5 * 100).toFixed(1) : 0;
            const trend = latestPrice > sma5 ? '위' : '아래';

            // Get technical indicator summary for this stock
            const techIndicators = calculateIndicators(code);
            const techSignal = techIndicators.summary?.signal || '중립'; // '긍정적', '중립', '주의'

            analysis = `현재 주가는 5일선(${sma5?.toLocaleString() || '-'}원) ${trend}에 위치하고 있으며, 이평선은 ${alignment} 상태입니다. `;
            analysis += `주가와 5일선의 이격도는 ${distance}%로 ${parseFloat(distance) > 5 ? '단기 과열' : '안정적'} 수준입니다. `;
            analysis += `지표상 PER ${per || '-'}, PBR ${pbr || '-'}, ROE ${roe || '-'}%를 기록 중입니다. `;
            analysis += `기술적 지표(RSI/MACD/볼린저) 종합 신호는 "${techSignal}"입니다.`;

            // Scoring system: valuation (0~2) + technical (0~2) + trend (0~1)
            let score = 0;
            const calculatedFairPrice = targetPrice || (roe ? Math.round(latestPrice * (1 + (roe / 100))) : Math.round(latestPrice * 1.1));

            // Valuation score
            if (latestPrice < calculatedFairPrice * 0.9) score += 2;       // clearly undervalued
            else if (latestPrice < calculatedFairPrice) score += 1;         // slightly undervalued

            // Technical indicator score
            if (techSignal === '긍정적') score += 2;
            else if (techSignal === '중립') score += 1;
            // '주의' adds 0

            // Trend score
            if (latestPrice > sma5 && isBullish) score += 1;

            // Map score to opinion
            if (score >= 4) {
                opinion = '긍정적';
                advice = targetPrice
                    ? `증권사 목표주가(${targetPrice.toLocaleString()}원) 대비 상승 여력이 있고, 기술적 지표도 우호적입니다.`
                    : `적정가 대비 저평가 상태이며 기술적 지표가 매수를 지지하고 있습니다.`;
            } else if (score >= 2) {
                opinion = '중립적';
                advice = '밸류에이션과 기술적 지표를 종합하면 적극적 매수보다는 관망이 적절합니다.';
            } else {
                opinion = '부정적';
                advice = '밸류에이션 부담이 있거나 기술적 지표가 주의 신호를 보내고 있어 보수적 접근이 필요합니다.';
            }
        }

        const tossUrl = `https://tossinvest.com/stocks/${code}/order`;

        // Capture chart in background (don't block response)
        const chartPath = `/charts/${code}.png`;
        captureChart(code).catch(e => console.error(`Background chart capture error for ${code}:`, e.message));

        console.log(`Saving analysis for ${code} with chartPath: ${chartPath}`);

        // Generate alerts for significant events
        generateAlerts(code, nameToSave, latestPrice, sma5, targetPrice, opinion, isHolding);

        db.prepare(`
            INSERT INTO stock_analysis (code, analysis, advice, opinion, toss_url, chart_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                analysis = excluded.analysis,
                advice = excluded.advice,
                opinion = excluded.opinion,
                toss_url = excluded.toss_url,
                chart_path = excluded.chart_path,
                created_at = CURRENT_TIMESTAMP
        `).run(code, analysis, advice, opinion, tossUrl, chartPath);

        const result = {
            code,
            name: nameToSave,
            price: latestPrice,
            change: "0",
            change_rate: "0.00",
            per, pbr, roe, targetPrice,
            history: historyRev,
            investorData,
            analysis,
            advice,
            opinion,
            tossUrl,
            chartPath
        };
        setCache(code, result);
        return result;
    } catch (error) {
        console.error(`API Error for ${code}:`, error.message);
        const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
        const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
        const analysisData = db.prepare('SELECT * FROM stock_analysis WHERE code = ?').get(code);

        const fallback = stock ? {
            ...stock,
            history: history.reverse(),
            investorData: [],
            analysis: analysisData?.analysis,
            advice: analysisData?.advice,
            opinion: analysisData?.opinion,
            tossUrl: analysisData?.toss_url,
            chartPath: analysisData?.chart_path
        } : null;
        if (fallback) setCache(code, fallback);
        return fallback;
    }
}

// API Endpoint to fetch and store stock data
app.get('/api/stock/:code', async (req, res) => {
    const { code } = req.params;
    const data = await getStockData(code);
    if (data) {
        res.json(data);
    } else {
        res.status(404).json({ error: 'Stock not found' });
    }
});

// Force refresh: invalidate cache and re-fetch
app.post('/api/stock/:code/refresh', async (req, res) => {
    const { code } = req.params;
    stockCache.delete(code);
    try {
        const [data, chartResult] = await Promise.allSettled([
            getStockData(code),
            captureChart(code)
        ]);
        const stockData = data.status === 'fulfilled' ? data.value : null;
        if (stockData) {
            stockData.chartPath = chartResult.status === 'fulfilled' ? chartResult.value : stockData.chartPath;
            res.json(stockData);
        } else {
            res.status(404).json({ error: 'Stock not found' });
        }
    } catch (error) {
        console.error('Refresh Error:', error.message);
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// API Endpoints for Holdings (Portfolio)
app.get('/api/holdings', async (req, res) => {
    try {
        const holdings = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
        `).all();
        res.json(holdings);
    } catch (error) {
        console.error('Holdings GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});

app.post('/api/holdings', async (req, res) => {
    const { code, name, avgPrice, weight, quantity } = req.body;
    try {
        // Ensure master stock data exists
        const stockData = await getStockData(code, name);

        db.prepare(`
            INSERT INTO holding_stocks (code, avg_price, weight, quantity, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                avg_price = excluded.avg_price,
                weight = excluded.weight,
                quantity = excluded.quantity,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, avgPrice, weight, quantity || 0);

        const updated = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            WHERE s.code = ?
        `).get(code);
        res.json(updated);
    } catch (error) {
        console.error('Holdings POST Error:', error.message);
        res.status(500).json({ error: 'Failed to add/update holding' });
    }
});

app.delete('/api/holdings/:code', (req, res) => {
    const { code } = req.params;
    try {
        db.prepare('DELETE FROM holding_stocks WHERE code = ?').run(code);
        res.json({ success: true });
    } catch (error) {
        console.error('Holdings DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to delete holding' });
    }
});

// Get All Stocks (Rule 13: Include current price and opinion)
// Uses DB data directly — prices are kept fresh by syncMajorStocks background job
app.get('/api/stocks', (req, res) => {
    try {
        const stocks = db.prepare(`
            SELECT s.*, a.opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            ORDER BY s.category, s.name
        `).all();

        const results = stocks.map(s => ({
            ...s,
            price: s.price || 0,
            opinion: s.opinion || '중립적'
        }));
        res.json(results);
    } catch (error) {
        console.error('Stocks GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stocks' });
    }
});

// Search Endpoint
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const results = db.prepare(`
            SELECT code, name, category 
            FROM stocks 
            WHERE name LIKE ? OR code LIKE ? 
            LIMIT 10
        `).all(`%${q}%`, `%${q}%`);
        res.json(results);
    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Manual Add Stock
app.post('/api/stocks', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    try {
        const data = await getStockData(code);
        if (data) {
            res.json(data);
        } else {
            res.status(404).json({ error: 'Failed to fetch stock data or invalid code' });
        }
    } catch (error) {
        console.error('Manual Add Error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete Stock Endpoint
app.delete('/api/stocks/:code', (req, res) => {
    const { code } = req.params;
    try {
        // Start a transaction to ensure atomic deletion
        const deleteTransaction = db.transaction((stockCode) => {
            // Delete from all dependent tables first due to FK constraints
            db.prepare('DELETE FROM recommended_stocks WHERE code = ?').run(stockCode);
            db.prepare('DELETE FROM stock_analysis WHERE code = ?').run(stockCode);
            db.prepare('DELETE FROM holding_stocks WHERE code = ?').run(stockCode);
            db.prepare('DELETE FROM stock_history WHERE code = ?').run(stockCode);
            const result = db.prepare('DELETE FROM stocks WHERE code = ?').run(stockCode);
            return result.changes;
        });

        const changes = deleteTransaction(code);
        if (changes > 0) {
            res.json({ success: true, message: `Stock ${code} and all related data removed successfully.` });
        } else {
            res.status(404).json({ error: 'Stock not found' });
        }
    } catch (error) {
        console.error('Delete Error:', error.message);
        res.status(500).json({ error: 'Failed to delete stock due to database error' });
    }
});

// Recommendation Logic: fetch from database, check analysis, and filter
app.get('/api/recommendations', async (req, res) => {
    try {
        // 1. Get explicitly recommended stocks
        const manualRecs = db.prepare(`
            SELECT r.*, s.name, s.category 
            FROM recommended_stocks r
            JOIN stocks s ON r.code = s.code
        `).all();

        // 2. Get stocks with "Positive" opinion from analysis
        const analysisRecs = db.prepare(`
            SELECT a.code, s.name, s.category, a.analysis as reason, 50 as score -- Default score for analysis hits
            FROM stock_analysis a
            JOIN stocks s ON a.code = s.code
            WHERE a.opinion = '긍정적'
        `).all();

        // 3. Merge and deduplicate
        const combined = [...manualRecs];
        for (const ar of analysisRecs) {
            if (!combined.some(c => c.code === ar.code)) {
                combined.push({
                    code: ar.code,
                    reason: ar.reason,
                    fair_price: ar.fair_price || 0,
                    score: ar.score,
                    name: ar.name,
                    category: ar.category
                });
            }
        }

        // 4. Exclude Holdings
        const holdings = db.prepare('SELECT code FROM holding_stocks').all().map(h => h.code);
        const nonHoldings = combined.filter(c => !holdings.includes(c.code));

        const results = await Promise.all(nonHoldings.map(async (rec) => {
            const stockData = await getStockData(rec.code, rec.name);
            if (!stockData) return null;

            const currentPrice = stockData.price;
            // Prioritize: 1. Manual fair_price, 2. Analyst target_price, 3. Calculated fairPrice from data
            const fairPrice = rec.fair_price || stockData.targetPrice || Math.round(currentPrice * 1.1);

            // Filter out if currently overpriced compared to fair price (User Feedback)
            if (currentPrice >= fairPrice) return null;

            return {
                code: rec.code,
                name: rec.name,
                category: rec.category,
                reason: rec.reason,
                score: rec.score,
                fairPrice: fairPrice,
                currentPrice: currentPrice,
                per: stockData.per,
                pbr: stockData.pbr,
                roe: stockData.roe,
                targetPrice: stockData.targetPrice,
                probability: Math.min(100, Math.round((fairPrice / currentPrice) * 50 + (rec.score / 2))),
                analysis: stockData.analysis,
                advice: stockData.advice,
                opinion: stockData.opinion,
                tossUrl: stockData.tossUrl,
                chartPath: stockData.chartPath
            };
        }));

        // Filter and sort
        const filteredResults = results.filter(r => r !== null && r.opinion === '긍정적').sort((a, b) => b.score - a.score);

        res.json(filteredResults);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// Portfolio History: aggregate daily portfolio value via single JOIN query
app.get('/api/holdings/history', (req, res) => {
    try {
        const result = db.prepare(`
            SELECT
                sh.date,
                CAST(SUM(sh.price * h.weight) AS INTEGER) as value,
                CAST(SUM(h.avg_price * h.weight) AS INTEGER) as cost
            FROM stock_history sh
            JOIN holding_stocks h ON sh.code = h.code
            WHERE sh.date IN (
                SELECT DISTINCT date FROM stock_history
                ORDER BY date DESC LIMIT 20
            )
            GROUP BY sh.date
            ORDER BY sh.date
        `).all();

        const mapped = result.map(d => ({
            date: d.date,
            value: d.value,
            cost: d.cost,
            profitRate: d.cost > 0
                ? parseFloat(((d.value - d.cost) / d.cost * 100).toFixed(2))
                : 0,
        }));

        res.json(mapped);
    } catch (error) {
        console.error('Holdings History Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings history' });
    }
});

// Stock volatility: standard deviation of daily returns over recent N days
app.get('/api/stock/:code/volatility', (req, res) => {
    const { code } = req.params;
    try {
        const history = db.prepare(
            'SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 6'
        ).all(code);

        if (history.length < 2) {
            return res.json({ volatility: null });
        }

        const prices = history.map(h => h.price).reverse();
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = parseFloat((Math.sqrt(variance) * 100).toFixed(2));

        res.json({ volatility });
    } catch (error) {
        console.error('Volatility Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate volatility' });
    }
});

// --- Alerts API ---
app.get('/api/alerts', (req, res) => {
    try {
        const alerts = db.prepare(
            'SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50'
        ).all();
        res.json(alerts);
    } catch (error) {
        console.error('Alerts GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

app.get('/api/alerts/unread-count', (req, res) => {
    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE read = 0').get();
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to count alerts' });
    }
});

app.post('/api/alerts/read', (req, res) => {
    try {
        db.prepare('UPDATE alerts SET read = 1 WHERE read = 0').run();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark alerts as read' });
    }
});

app.delete('/api/alerts/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});

// --- Market Index API ---
app.get('/api/market/indices', async (req, res) => {
    try {
        const indices = [
            { symbol: 'KOSPI', code: '0001' },
            { symbol: 'KOSDAQ', code: '1001' }
        ];
        const results = await Promise.all(indices.map(async (idx) => {
            try {
                const r = await axios.get(`https://finance.naver.com/sise/sise_index.naver?code=${idx.code}`, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const html = new TextDecoder('euc-kr').decode(r.data);
                const priceMatch = html.match(/id="now_value"[^>]*>([\d,.]+)/);
                const changeMatch = html.match(/id="change_value_and_rate"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
                const value = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
                let change = '';
                let changeRate = '';
                if (changeMatch) {
                    const raw = changeMatch[1].replace(/<[^>]+>/g, '').trim();
                    const parts = raw.split(/\s+/);
                    change = parts[0] || '';
                    changeRate = parts[1] || '';
                }
                const isUp = html.includes('ico_up') || html.includes('plus');
                return { symbol: idx.symbol, value, change, changeRate, positive: isUp };
            } catch {
                return { symbol: idx.symbol, value: null, change: '', changeRate: '', positive: true };
            }
        }));
        res.json(results);
    } catch (error) {
        console.error('Market Index Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch indices' });
    }
});

// --- Watchlist API ---
app.get('/api/watchlist', (req, res) => {
    try {
        const items = db.prepare(`
            SELECT s.code, s.name, s.category, s.price, a.opinion, w.added_at
            FROM watchlist w
            JOIN stocks s ON w.code = s.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            ORDER BY w.added_at DESC
        `).all();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
});

app.post('/api/watchlist', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    try {
        await getStockData(code);
        db.prepare('INSERT OR IGNORE INTO watchlist (code) VALUES (?)').run(code);
        const item = db.prepare(`
            SELECT s.code, s.name, s.category, s.price, a.opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.code = ?
        `).get(code);
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add to watchlist' });
    }
});

app.delete('/api/watchlist/:code', (req, res) => {
    try {
        db.prepare('DELETE FROM watchlist WHERE code = ?').run(req.params.code);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
});

// --- Technical Indicators Calculation (shared function) ---
function calculateIndicators(code) {
    const history = db.prepare(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date ASC'
    ).all(code);

    if (history.length < 2) {
        return { rsi: null, macd: null, bollinger: null, summary: null };
    }

    const prices = history.map(h => h.price);

    // RSI (14-day)
    let rsi = null;
    if (prices.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = prices.length - 14; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        rsi = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
    }

    // MACD (12, 26, 9)
    let macd = null;
    if (prices.length >= 26) {
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            for (let i = period; i < data.length; i++) {
                emaVal = data[i] * k + emaVal * (1 - k);
            }
            return emaVal;
        };
        const ema12 = ema(prices, 12);
        const ema26 = ema(prices, 26);
        const macdLine = parseFloat((ema12 - ema26).toFixed(0));
        const recentMacds = [];
        for (let i = Math.max(26, prices.length - 20); i <= prices.length; i++) {
            const slice = prices.slice(0, i);
            if (slice.length >= 26) recentMacds.push(ema(slice, 12) - ema(slice, 26));
        }
        const signal = recentMacds.length >= 9
            ? parseFloat((recentMacds.slice(-9).reduce((a, b) => a + b, 0) / 9).toFixed(0))
            : macdLine;
        const histogram = parseFloat((macdLine - signal).toFixed(0));
        macd = { macdLine, signal, histogram };
    }

    // Bollinger Bands (20, 2)
    let bollinger = null;
    if (prices.length >= 20) {
        const recent20 = prices.slice(-20);
        const sma20 = recent20.reduce((a, b) => a + b, 0) / 20;
        const stdDev = Math.sqrt(recent20.reduce((a, p) => a + Math.pow(p - sma20, 2), 0) / 20);
        const upper = Math.round(sma20 + 2 * stdDev);
        const lower = Math.round(sma20 - 2 * stdDev);
        const currentPrice = prices[prices.length - 1];
        const percentB = stdDev > 0 ? parseFloat(((currentPrice - lower) / (upper - lower) * 100).toFixed(1)) : 50;
        bollinger = { upper, middle: Math.round(sma20), lower, percentB };
    }

    // Summary for beginners
    const details = [];
    if (rsi !== null) {
        if (rsi >= 70) details.push({ indicator: 'RSI', signal: '과매수', description: '주가가 단기간에 많이 올라 쉬어갈 수 있어요.', color: 'red' });
        else if (rsi <= 30) details.push({ indicator: 'RSI', signal: '과매도', description: '주가가 많이 떨어져서 반등할 수 있어요.', color: 'green' });
        else details.push({ indicator: 'RSI', signal: '보통', description: '현재 과열이나 침체 없이 안정적이에요.', color: 'neutral' });
    }
    if (macd) {
        if (macd.histogram > 0) details.push({ indicator: 'MACD', signal: '상승 추세', description: '매수 힘이 매도 힘보다 강해요.', color: 'green' });
        else details.push({ indicator: 'MACD', signal: '하락 추세', description: '매도 힘이 매수 힘보다 강해요.', color: 'red' });
    }
    if (bollinger) {
        if (bollinger.percentB > 80) details.push({ indicator: '볼린저밴드', signal: '상단 근접', description: '주가가 평소보다 많이 올라간 상태예요.', color: 'red' });
        else if (bollinger.percentB < 20) details.push({ indicator: '볼린저밴드', signal: '하단 근접', description: '주가가 평소보다 많이 내려간 상태예요.', color: 'green' });
        else details.push({ indicator: '볼린저밴드', signal: '중간', description: '주가가 평균 부근에서 움직이고 있어요.', color: 'neutral' });
    }

    const greenCount = details.filter(d => d.color === 'green').length;
    const redCount = details.filter(d => d.color === 'red').length;
    let summary;
    if (greenCount > redCount) summary = { signal: '긍정적', description: '여러 지표가 매수에 유리한 신호를 보내고 있어요.', details };
    else if (redCount > greenCount) summary = { signal: '주의', description: '일부 지표가 주의 신호를 보내고 있어요. 신중하게 판단하세요.', details };
    else summary = { signal: '중립', description: '특별한 매수/매도 신호 없이 안정적이에요.', details };

    return { rsi, macd, bollinger, summary };
}

app.get('/api/stock/:code/indicators', (req, res) => {
    try {
        res.json(calculateIndicators(req.params.code));
    } catch (error) {
        console.error('Indicators Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate indicators' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
