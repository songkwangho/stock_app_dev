import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/charts', express.static(path.join(__dirname, '..', 'public', 'charts')));

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
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code) REFERENCES stocks (code)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS stock_history (
    code TEXT,
    date TEXT,
    price INTEGER,
    PRIMARY KEY (code, date)
  )
`).run();

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
async function syncMajorStocks() {
    console.log('Syncing major stocks prices...');
    for (const r of initialRecommendations) {
        try {
            await getStockData(r.code, r.name);
        } catch (e) {
            console.error(`Failed to sync ${r.name}:`, e.message);
        }
    }
    console.log('Major stocks sync complete.');
}

// Naver Finance API URL
const NAVER_FINANCE_URL = 'https://api.finance.naver.com/siseJson.naver';

// Run sync on start and every 1 hour
syncMajorStocks();
setInterval(syncMajorStocks, 60 * 60 * 1000);

// Helper function to fetch and store stock data
async function getStockData(code, fallbackName = null) {
    try {
        // Fetch last 60 days to ensure we have enough for 40 business days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 65);
        const startTime = sixtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
        const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const response = await axios.get(NAVER_FINANCE_URL, {
            params: {
                symbol: code,
                requestType: 1,
                startTime: startTime,
                endTime: endTime,
                timeframe: 'day'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://finance.naver.com/'
            }
        });

        const rawData = response.data.trim();
        const cleanedData = rawData.replace(/\s+/g, '');
        console.log('Raw Data Length:', rawData.length);
        const allMatches = [...cleanedData.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];
        console.log('Matches Count:', allMatches.length);

        if (allMatches.length === 0) {
            const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
            const history = db.prepare('SELECT date, price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
            return stock ? { ...stock, history: history.reverse() } : null;
        }

        // Save History
        const insertHistory = db.prepare(`
            INSERT INTO stock_history (code, date, price)
            VALUES (?, ?, ?)
            ON CONFLICT(code, date) DO UPDATE SET price = excluded.price
        `);

        // Use a transaction for better performance
        const transaction = db.transaction((matches) => {
            for (const match of matches) {
                insertHistory.run(code, match[1], parseInt(match[5]));
            }
        });
        transaction(allMatches);

        // Scraping investor data from frgn.naver
        let investorData = [];
        try {
            const investorResponse = await axios.get(`https://finance.naver.com/item/frgn.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const investorHtml = new TextDecoder('euc-kr').decode(investorResponse.data);

            // Extract the last 20 rows of the investor table
            // Table structure: Date, Close, Change, Rate, Volume, Institution Net, Foreign Net, ...
            const investorRegex = /<tr.*?>\s*<td.*?><span.*?>([\d.]{10})<\/span><\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>/g;
            let invMatch;
            const matches = [];
            while ((invMatch = investorRegex.exec(investorHtml)) !== null && matches.length < 20) {
                const date = invMatch[1].replace(/\./g, '');
                const instNet = parseInt(invMatch[4].replace(/,/g, ''));
                const foreignNet = parseInt(invMatch[5].replace(/,/g, ''));
                const volume = parseInt(invMatch[3].replace(/,/g, ''));
                // Estimate Individual as a portion of non-inst/non-foreign volume for UI purposes, or leave as 0
                // Actually, let's just stick to what we accurately scrape.
                matches.push({
                    date,
                    institution: instNet,
                    foreign: foreignNet,
                    individual: -(instNet + foreignNet) // This is a common heuristic: Net buy sum is approx zero excluding 'Others'
                });
            }
            investorData = matches.reverse();
        } catch (investorError) {
            console.error(`Investor Scraping Error for ${code}:`, investorError.message);
        }

        // Scraping additional metrics from main page
        let per = null, pbr = null, roe = null, targetPrice = null;
        let html = '';
        try {
            const pageResponse = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            html = new TextDecoder('euc-kr').decode(pageResponse.data);

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

        const latestMatch = allMatches[allMatches.length - 1];
        const latestPrice = parseInt(latestMatch[5]);

        const history = db.prepare('SELECT date, price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);

        const existing = db.prepare('SELECT name FROM stocks WHERE code = ?').get(code);
        let nameToSave = code;
        if (fallbackName) {
            nameToSave = fallbackName;
        } else if (existing && existing.name !== code) {
            nameToSave = existing.name;
        } else {
            const nameMatch = html?.match(/<title>(.*?) : Npay 증권<\/title>/);
            if (nameMatch) nameToSave = nameMatch[1];
        }

        db.prepare(`
            INSERT INTO stocks (code, name, price, change, change_rate, per, pbr, roe, target_price, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                price = excluded.price,
                name = excluded.name,
                per = excluded.per,
                pbr = excluded.pbr,
                roe = excluded.roe,
                target_price = excluded.target_price,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, nameToSave, latestPrice, "0", "0.00", per, pbr, roe, targetPrice);

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
            // Rules 9, 10, 11, 12: Recommendations analysis
            const isBullish = sma5 && sma20 && sma5 > sma20;
            const alignment = isBullish ? '정배열' : '역배열/혼조';
            const distance = sma5 ? Math.abs((latestPrice - sma5) / sma5 * 100).toFixed(1) : 0;
            const trend = latestPrice > sma5 ? '위' : '아래';

            analysis = `현재 주가는 5일선(${sma5?.toLocaleString() || '-'}원) ${trend}에 위치하고 있으며, 이평선은 ${alignment} 상태입니다. `;
            analysis += `주가와 5일선의 이격도는 ${distance}%로 ${parseFloat(distance) > 5 ? '단기 과열' : '안정적'} 수준입니다. `;
            analysis += `지표상 PER ${per || '-'}, PBR ${pbr || '-'}, ROE ${roe || '-'}%를 기록 중입니다.`;

            // Enhanced Fair Price & Opinion Logic
            // Prioritize analyst target price, otherwise use ROE-based estimation
            const calculatedFairPrice = targetPrice || (roe ? Math.round(latestPrice * (1 + (roe / 100))) : Math.round(latestPrice * 1.1));

            if (latestPrice < calculatedFairPrice * 0.9 && opinion !== '매도') {
                opinion = '긍정적';
                advice = targetPrice
                    ? `증권사 목표주가(${targetPrice.toLocaleString()}원) 대비 현재가가 낮아 상승 여력이 충분합니다.`
                    : `최근 실적(ROE ${roe}%) 기반 적정가 대비 저평가 국면으로 판단됩니다.`;
            } else if (latestPrice > sma5 && isBullish) {
                opinion = '중립적';
                advice = '단기 추세는 긍정적이나, 밸류에이션 측면에서 매수 매력도가 보통 수준입니다.';
            } else {
                opinion = '부정적';
                advice = '단기 추세 이탈 또는 밸류에이션 부담이 있어 보수적 접근이 필요합니다.';
            }
        }

        const tossUrl = `https://tose.im/stock/${code}`;
        const chartPath = `/charts/${code}.png`;

        console.log(`Saving analysis for ${code} with chartPath: ${chartPath}`);

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

        return {
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
    } catch (error) {
        console.error(`API Error for ${code}:`, error.message);
        const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
        const history = db.prepare('SELECT date, price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
        const analysisData = db.prepare('SELECT * FROM stock_analysis WHERE code = ?').get(code);

        return stock ? {
            ...stock,
            history: history.reverse(),
            investorData: [],
            analysis: analysisData?.analysis,
            advice: analysisData?.advice,
            opinion: analysisData?.opinion,
            tossUrl: analysisData?.toss_url,
            chartPath: analysisData?.chart_path
        } : null;
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

// API Endpoints for Holdings (Portfolio)
app.get('/api/holdings', async (req, res) => {
    try {
        const holdings = db.prepare(`
            SELECT s.*, h.avg_price, h.weight 
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
    const { code, name, avgPrice, weight } = req.body;
    try {
        // Ensure master stock data exists
        const stockData = await getStockData(code, name);

        db.prepare(`
            INSERT INTO holding_stocks (code, avg_price, weight, last_updated)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                avg_price = excluded.avg_price,
                weight = excluded.weight,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, avgPrice, weight);

        const updated = db.prepare(`
            SELECT s.*, h.avg_price, h.weight 
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
app.get('/api/stocks', async (req, res) => {
    try {
        const stocks = db.prepare('SELECT * FROM stocks ORDER BY category, name').all();
        const results = await Promise.all(stocks.map(async (s) => {
            let currentPrice = s.price;
            // If price is missing, attempt to fetch it
            if (!currentPrice) {
                const refreshed = await getStockData(s.code, s.name);
                currentPrice = refreshed?.price || 0;
            }

            const analysis = db.prepare('SELECT opinion FROM stock_analysis WHERE code = ?').get(s.code);
            return {
                ...s,
                price: currentPrice,
                opinion: analysis ? analysis.opinion : '중립적'
            };
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
