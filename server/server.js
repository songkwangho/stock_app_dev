import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Separated Modules ---
import db from './db/connection.js';
import { initSchema } from './db/schema.js';
import { runMigrations } from './db/migrate.js';
import { getDeviceId, requireDeviceId } from './helpers/deviceId.js';
import { getCached, setCache, invalidateCache } from './helpers/cache.js';
import { NAVER_FINANCE_URL, mapToCategory } from './scrapers/naver.js';
import { captureChart } from './scrapers/toss.js';
import { calculateValuationScore, calculateTechnicalScore, calculateSupplyDemandScore, calculateTrendScore, calculateHoldingOpinion, median } from './domains/analysis/scoring.js';
import { calculateIndicators } from './domains/analysis/indicators.js';
import { generateAlerts } from './domains/alert/service.js';
import { setupCleanup } from './scheduler.js';

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
    validate: { xForwardedForHeader: false },
});
app.use('/api/', apiLimiter);
app.use('/charts', express.static(path.join(__dirname, '..', 'public', 'charts')));

// Cleanup old data (20 days+)
setupCleanup(db);

// ===== Data Sync: all registered major stocks =====
async function syncAllStocks() {
    const allStocks = db.prepare('SELECT code, name FROM stocks ORDER BY code').all();
    console.log(`Syncing ${allStocks.length} stocks...`);
    const BATCH_SIZE = 5;
    let synced = 0;
    for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map(s => getStockData(s.code, s.name).catch(e =>
                console.error(`Failed to sync ${s.name}:`, e.message)
            ))
        );
        synced += batch.length;
        if (synced % 25 === 0) console.log(`  ... ${synced}/${allStocks.length} synced`);
    }
    console.log(`Stock sync complete (${synced} stocks).`);
}

// Schedule: 매일 오전 8시 자동 업데이트
function scheduleDaily8AM() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (now >= next8AM) next8AM.setDate(next8AM.getDate() + 1);
    const msUntil8AM = next8AM.getTime() - now.getTime();
    console.log(`Next data sync scheduled at ${next8AM.toLocaleString('ko-KR')} (in ${Math.round(msUntil8AM / 60000)}min)`);

    setTimeout(() => {
        syncAllStocks();
        // After first trigger, repeat every 24 hours
        setInterval(syncAllStocks, 24 * 60 * 60 * 1000);
    }, msUntil8AM);
}

// Run sync on start (delayed to avoid blocking startup) + schedule daily 8AM
setTimeout(() => syncAllStocks(), 5000);
scheduleDaily8AM();

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

                // Persist investor data to investor_history
                if (investorData.length > 0) {
                    const insertInvestor = db.prepare(`
                        INSERT INTO investor_history (code, date, institution, foreign_net, individual)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(code, date) DO UPDATE SET
                            institution = excluded.institution,
                            foreign_net = excluded.foreign_net,
                            individual = excluded.individual
                    `);
                    const investorTx = db.transaction((rows) => {
                        for (const r of rows) {
                            insertInvestor.run(code, r.date, r.institution, r.foreign, r.individual);
                        }
                    });
                    investorTx(investorData);
                }
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

                // EPS extraction: 3rd td = previous year, 4th td = current/estimate year
                const epsPrevRegex = /th_cop_anal17(?:[\s\S]*?<td.*?>){3}\s*([\d,.-]+)/;
                const epsCurRegex = /th_cop_anal17(?:[\s\S]*?<td.*?>){4}\s*([\d,.-]+)/;
                const epsPrevMatch = html.match(epsPrevRegex);
                const epsCurMatch = html.match(epsCurRegex);
                var epsPrevious = (epsPrevMatch && epsPrevMatch[1].trim() !== '-') ? parseFloat(epsPrevMatch[1].replace(/,/g, '')) : null;
                var epsCurrent = (epsCurMatch && epsCurMatch[1].trim() !== '-') ? parseFloat(epsCurMatch[1].replace(/,/g, '')) : null;

                console.log(`Scraped for ${code}: PER=${per}, PBR=${pbr}, ROE=${roe}, TP=${targetPrice}, EPS=${epsPrevious}→${epsCurrent}`);
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
            INSERT INTO stocks (code, name, price, change, change_rate, per, pbr, roe, target_price, category, eps_current, eps_previous, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                price = excluded.price,
                name = excluded.name,
                per = excluded.per,
                pbr = excluded.pbr,
                roe = excluded.roe,
                target_price = excluded.target_price,
                category = excluded.category,
                eps_current = excluded.eps_current,
                eps_previous = excluded.eps_previous,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, nameToSave, latestPrice, "0", "0.00", per, pbr, roe, targetPrice, categoryToSave, epsCurrent || null, epsPrevious || null);

        // Advanced Analysis Generation Logic
        const historyRev = history.reverse();
        const getSMA = (days) => {
            if (historyRev.length < days) return null;
            const slice = historyRev.slice(-days);
            return Math.round(slice.reduce((acc, cur) => acc + cur.price, 0) / days);
        };

        const sma5 = getSMA(5);
        const sma20 = getSMA(20);

        let analysis = '';
        let advice = '';
        let market_opinion = '중립적'; // MarketOpinion: always calculated via 10-point scoring
        let scoringBreakdown = null;

        // Always calculate MarketOpinion (10-point scoring) for all stocks
        {
            const valuation = calculateValuationScore(db, code, per, pbr, roe, latestPrice, targetPrice, epsCurrent, epsPrevious);
            const technical = calculateTechnicalScore(db, code);
            const supplyDemand = calculateSupplyDemandScore(db, code);
            const trend = calculateTrendScore(latestPrice, sma5, sma20);

            const totalScore = parseFloat((valuation.total + technical.total + supplyDemand.total + trend.total).toFixed(2));
            scoringBreakdown = {
                valuation: valuation.total,
                technical: technical.total,
                supplyDemand: supplyDemand.total,
                trend: trend.total,
                total: totalScore,
                per_negative: per !== null && per !== undefined && per < 0,
                low_confidence: valuation.detail?.low_confidence || false,
                detail: {
                    valuation: valuation.detail,
                    technical: technical.detail,
                    supplyDemand: supplyDemand.detail,
                    trend: trend.detail
                }
            };

            const isBullish = sma5 && sma20 && sma5 > sma20;
            const alignment = isBullish ? '정배열' : '역배열/혼조';
            const distance = sma5 ? Math.abs((latestPrice - sma5) / sma5 * 100).toFixed(1) : 0;
            const trendDir = latestPrice > sma5 ? '위' : '아래';

            analysis = `현재 주가는 5일선(${sma5?.toLocaleString() || '-'}원) ${trendDir}에 위치하고 있으며, 이평선은 ${alignment} 상태입니다. `;
            analysis += `이격도 ${distance}%(${parseFloat(distance) > 5 ? '과열' : '안정'}). `;
            analysis += `PER ${per || '-'}, PBR ${pbr || '-'}, ROE ${roe || '-'}%. `;
            analysis += `[종합점수 ${totalScore}/10] 밸류에이션 ${valuation.total}/3, 기술지표 ${technical.total}/3, 수급 ${supplyDemand.total}/2, 추세 ${trend.total}/2.`;

            if (totalScore >= 7.0) {
                market_opinion = '긍정적';
                advice = `종합점수 ${totalScore}점으로 매수에 유리한 조건입니다. `;
                advice += valuation.total >= 2 ? '밸류에이션이 섹터 대비 저평가 상태이며, ' : '';
                advice += technical.total >= 2 ? '기술적 지표도 매수를 지지합니다. ' : '';
                advice += supplyDemand.total >= 1.5 ? '외국인/기관의 연속 순매수도 긍정적입니다.' : '';
            } else if (totalScore >= 4.0) {
                market_opinion = '중립적';
                advice = `종합점수 ${totalScore}점으로 적극적 매수보다는 관망이 적절합니다. `;
                if (valuation.total < 1) advice += '밸류에이션 매력이 부족하거나 ';
                if (technical.total < 1) advice += '기술적 지표가 약세를 보이고 있어 ';
                advice += '분할매수 관점에서 접근을 권장합니다.';
            } else {
                market_opinion = '부정적';
                advice = `종합점수 ${totalScore}점으로 보수적 접근이 필요합니다. `;
                if (valuation.total < 1) advice += '밸류에이션 부담이 크고, ';
                if (technical.total < 1) advice += '기술적 지표가 주의 신호를 보내고 있으며, ';
                if (supplyDemand.total < 0.5) advice += '수급도 비우호적입니다.';
            }
        }

        const tossUrl = `https://tossinvest.com/stocks/${code}/order`;

        // Capture chart in background (don't block response)
        const chartPath = `/charts/${code}.png`;
        captureChart(code).catch(e => console.error(`Background chart capture error for ${code}:`, e.message));

        console.log(`Saving analysis for ${code} with chartPath: ${chartPath}`);

        // Generate alerts for significant events
        generateAlerts(db, code, nameToSave, latestPrice, sma5, targetPrice, market_opinion);

        // Save MarketOpinion to DB (공용, 비보유 기준)
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
        `).run(code, analysis, advice, market_opinion, tossUrl, chartPath);

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
            market_opinion,
            tossUrl,
            chartPath,
            scoringBreakdown
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
            market_opinion: analysisData?.opinion,
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
    invalidateCache(code);
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

// API Endpoints for Holdings (Portfolio) - device_id scoped
app.get('/api/holdings', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const holdings = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = ?
        `).all(deviceId);

        // Calculate holding_opinion at runtime for each holding
        const enriched = holdings.map(h => {
            const history = db.prepare(
                'SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 20'
            ).all(h.code);
            let sma5 = null, sma20 = null;
            if (history.length >= 5) sma5 = Math.round(history.slice(0, 5).reduce((s, r) => s + r.price, 0) / 5);
            if (history.length >= 20) sma20 = Math.round(history.slice(0, 20).reduce((s, r) => s + r.price, 0) / 20);
            return {
                ...h,
                market_opinion: h.market_opinion || '중립적',
                holding_opinion: calculateHoldingOpinion(h.avg_price, h.price, sma5, sma20),
            };
        });

        res.json(enriched);
    } catch (error) {
        console.error('Holdings GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});

// Recalculate weight for all holdings of a device based on investment cost
function recalcWeights(deviceId) {
    const holdings = db.prepare(
        'SELECT code, avg_price, quantity FROM holding_stocks WHERE device_id = ?'
    ).all(deviceId);
    const totalCost = holdings.reduce((sum, h) => sum + (h.avg_price || 0) * (h.quantity || 0), 0);
    if (totalCost <= 0) return;
    const updateStmt = db.prepare('UPDATE holding_stocks SET weight = ? WHERE device_id = ? AND code = ?');
    const txn = db.transaction(() => {
        for (const h of holdings) {
            const cost = (h.avg_price || 0) * (h.quantity || 0);
            const weight = Math.round(cost / totalCost * 100);
            updateStmt.run(weight, deviceId, h.code);
        }
    });
    txn();
}

app.post('/api/holdings', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code, name, avgPrice, quantity } = req.body;
    try {
        // Ensure master stock data exists
        const stockData = await getStockData(code, name);

        db.prepare(`
            INSERT INTO holding_stocks (device_id, code, avg_price, weight, quantity, last_updated)
            VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(device_id, code) DO UPDATE SET
                avg_price = excluded.avg_price,
                quantity = excluded.quantity,
                last_updated = CURRENT_TIMESTAMP
        `).run(deviceId, code, avgPrice, quantity || 0);

        // Recalculate weights for all holdings
        recalcWeights(deviceId);

        const updated = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = ? AND s.code = ?
        `).get(deviceId, code);

        // Calculate holding_opinion at runtime
        if (updated) {
            const history = db.prepare(
                'SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 20'
            ).all(code);
            let sma5 = null, sma20 = null;
            if (history.length >= 5) sma5 = Math.round(history.slice(0, 5).reduce((s, r) => s + r.price, 0) / 5);
            if (history.length >= 20) sma20 = Math.round(history.slice(0, 20).reduce((s, r) => s + r.price, 0) / 20);
            updated.holding_opinion = calculateHoldingOpinion(updated.avg_price, updated.price, sma5, sma20);
            updated.market_opinion = updated.market_opinion || '중립적';
        }
        res.json(updated);
    } catch (error) {
        console.error('Holdings POST Error:', error.message);
        res.status(500).json({ error: 'Failed to add/update holding' });
    }
});

app.delete('/api/holdings/:code', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.params;
    try {
        db.prepare('DELETE FROM holding_stocks WHERE device_id = ? AND code = ?').run(deviceId, code);
        // Recalculate weights for remaining holdings
        recalcWeights(deviceId);
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
            SELECT s.*, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            ORDER BY s.category, s.name
        `).all();

        const results = stocks.map(s => ({
            ...s,
            price: s.price || 0,
            market_opinion: s.market_opinion || '중립적'
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
            db.prepare('DELETE FROM holding_stocks WHERE code = ?').run(stockCode); // all devices
            db.prepare('DELETE FROM watchlist WHERE code = ?').run(stockCode); // all devices
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

        // 3. Merge and deduplicate, marking source
        const combined = [...manualRecs.map(r => ({ ...r, source: r.source || 'manual' }))];
        for (const ar of analysisRecs) {
            if (!combined.some(c => c.code === ar.code)) {
                combined.push({
                    code: ar.code,
                    reason: ar.reason,
                    fair_price: ar.fair_price || 0,
                    score: ar.score,
                    name: ar.name,
                    category: ar.category,
                    source: 'algorithm'
                });
            }
        }

        // 4. Exclude Holdings (device-specific)
        const deviceId = getDeviceId(req);
        const holdingCodes = deviceId
            ? db.prepare('SELECT code FROM holding_stocks WHERE device_id = ?').all(deviceId).map(h => h.code)
            : [];
        const nonHoldings = combined.filter(c => !holdingCodes.includes(c.code));

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
                market_opinion: stockData.market_opinion,
                source: rec.source || 'manual',
                tossUrl: stockData.tossUrl,
                chartPath: stockData.chartPath
            };
        }));

        // Filter and sort
        const filteredResults = results.filter(r => r !== null && r.market_opinion === '긍정적').sort((a, b) => b.score - a.score);

        res.json(filteredResults);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// Portfolio History: aggregate daily portfolio value via single JOIN query - device_id scoped
app.get('/api/holdings/history', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const result = db.prepare(`
            SELECT
                sh.date,
                CAST(SUM(sh.price * h.quantity) AS INTEGER) as value,
                CAST(SUM(h.avg_price * h.quantity) AS INTEGER) as cost
            FROM stock_history sh
            JOIN holding_stocks h ON sh.code = h.code
            WHERE h.device_id = ? AND sh.date IN (
                SELECT DISTINCT date FROM stock_history
                ORDER BY date DESC LIMIT 20
            )
            GROUP BY sh.date
            ORDER BY sh.date
        `).all(deviceId);

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

// --- Alerts API --- device_id scoped
app.get('/api/alerts', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const alerts = db.prepare(
            'SELECT * FROM alerts WHERE device_id = ? ORDER BY created_at DESC LIMIT 50'
        ).all(deviceId);
        res.json(alerts);
    } catch (error) {
        console.error('Alerts GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

app.get('/api/alerts/unread-count', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE device_id = ? AND read = 0').get(deviceId);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to count alerts' });
    }
});

app.post('/api/alerts/read', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('UPDATE alerts SET read = 1 WHERE device_id = ? AND read = 0').run(deviceId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark alerts as read' });
    }
});

app.delete('/api/alerts/:id', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('DELETE FROM alerts WHERE id = ? AND device_id = ?').run(req.params.id, deviceId);
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

// --- Watchlist API --- device_id scoped
app.get('/api/watchlist', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const items = db.prepare(`
            SELECT s.code, s.name, s.category, s.price, a.opinion AS market_opinion, w.added_at
            FROM watchlist w
            JOIN stocks s ON w.code = s.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE w.device_id = ?
            ORDER BY w.added_at DESC
        `).all(deviceId);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
});

app.post('/api/watchlist', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    try {
        await getStockData(code);
        db.prepare(`
            INSERT INTO watchlist (device_id, code) VALUES (?, ?)
            ON CONFLICT(device_id, code) DO NOTHING
        `).run(deviceId, code);
        const item = db.prepare(`
            SELECT s.code, s.name, s.category, s.price, a.opinion AS market_opinion
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
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('DELETE FROM watchlist WHERE device_id = ? AND code = ?').run(deviceId, req.params.code);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
});

app.get('/api/stock/:code/indicators', (req, res) => {
    try {
        res.json(calculateIndicators(db, req.params.code));
    } catch (error) {
        console.error('Indicators Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate indicators' });
    }
});

// --- Screener API: filter stocks by conditions ---
app.get('/api/screener', (req, res) => {
    try {
        const { perMax, perMin, pbrMax, pbrMin, roeMin, priceMin, priceMax, category } = req.query;
        let sql = `
            SELECT s.*, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.price > 0
        `;
        const params = [];

        if (perMin || perMax) { sql += ' AND s.per > 0'; } // PER 음수(적자 기업) 제외
        if (perMin) { sql += ' AND s.per >= ?'; params.push(Number(perMin)); }
        if (perMax) { sql += ' AND s.per <= ?'; params.push(Number(perMax)); }
        if (pbrMin) { sql += ' AND s.pbr >= ?'; params.push(Number(pbrMin)); }
        if (pbrMax) { sql += ' AND s.pbr <= ?'; params.push(Number(pbrMax)); }
        if (roeMin) { sql += ' AND s.roe >= ?'; params.push(Number(roeMin)); }
        if (priceMin) { sql += ' AND s.price >= ?'; params.push(Number(priceMin)); }
        if (priceMax) { sql += ' AND s.price <= ?'; params.push(Number(priceMax)); }
        if (category) { sql += ' AND s.category = ?'; params.push(category); }

        sql += ' ORDER BY s.roe DESC NULLS LAST LIMIT 50';
        const results = db.prepare(sql).all(...params);
        res.json(results);
    } catch (error) {
        console.error('Screener Error:', error.message);
        res.status(500).json({ error: 'Screener failed' });
    }
});

// --- Financial Statements API: scrape quarterly data ---
app.get('/api/stock/:code/financials', async (req, res) => {
    const { code } = req.params;
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);
        if (html.includes('\uFFFD')) {
            // retry not needed for euc-kr pages
        }

        // Extract quarterly financial data from the table
        // Look for the table with id="content" area containing 매출액, 영업이익, 당기순이익
        const financials = [];

        // Extract period headers (e.g., 2024.03, 2024.06, etc.)
        const periodMatch = html.match(/id="highlight_D_Q"[\s\S]*?<tr[\s\S]*?<th[^>]*>구분<\/th>([\s\S]*?)<\/tr>/);
        const periods = [];
        if (periodMatch) {
            const thMatches = [...periodMatch[1].matchAll(/<th[^>]*>([\d.]+)<\/th>/g)];
            for (const m of thMatches) periods.push(m[1]);
        }

        // Extract rows: 매출액, 영업이익, 당기순이익
        const extractRow = (label) => {
            const rowRegex = new RegExp(label + '[\\s\\S]*?<tr[\\s\\S]*?>([\\s\\S]*?)<\\/tr>');
            const rowMatch = html.match(rowRegex);
            if (!rowMatch) return [];
            const tdMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\d,.-]+)<\/td>/g)];
            return tdMatches.map(m => {
                const val = m[1].replace(/,/g, '');
                return val === '' ? null : Number(val);
            });
        };

        // Alternative: simpler approach using highlight_D_Q table
        const tableMatch = html.match(/id="highlight_D_Q"([\s\S]*?)<\/table>/);
        if (tableMatch) {
            const tableHtml = tableMatch[1];
            const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

            for (const row of rows) {
                const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c =>
                    c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
                );
                if (cells.length > 1) {
                    const label = cells[0];
                    if (['매출액', '영업이익', '당기순이익'].includes(label)) {
                        const values = cells.slice(1).map(v => {
                            const num = v.replace(/,/g, '');
                            return num === '' || isNaN(Number(num)) ? null : Number(num);
                        });
                        financials.push({ label, values });
                    }
                }
            }
        }

        res.json({ periods, financials });
    } catch (error) {
        console.error('Financials Error:', error.message);
        res.json({ periods: [], financials: [] });
    }
});

// --- News API: scrape recent news for a stock ---
app.get('/api/stock/:code/news', async (req, res) => {
    const { code } = req.params;
    try {
        const response = await axios.get(`https://finance.naver.com/item/news_news.naver?code=${code}&page=1`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const news = [];
        const rows = [...html.matchAll(/<tr[\s\S]*?class="(?:first|last|)"[\s\S]*?>([\s\S]*?)<\/tr>/g)];

        for (const row of rows) {
            const titleMatch = row[1].match(/<a[^>]*href="([^"]*)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/);
            const dateMatch = row[1].match(/<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/);
            const sourceMatch = row[1].match(/<td[^>]*class="info"[^>]*>([\s\S]*?)<\/td>/);

            if (titleMatch) {
                news.push({
                    title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
                    url: titleMatch[1].startsWith('http') ? titleMatch[1] : `https://finance.naver.com${titleMatch[1]}`,
                    date: dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : '',
                    source: sourceMatch ? sourceMatch[1].replace(/<[^>]+>/g, '').trim() : '',
                });
            }
            if (news.length >= 10) break;
        }

        res.json(news);
    } catch (error) {
        console.error('News Error:', error.message);
        res.json([]);
    }
});

// --- Sector Comparison API ---
app.get('/api/sector/:category/compare', (req, res) => {
    const { category } = req.params;
    try {
        const stocks = db.prepare(`
            SELECT s.code, s.name, s.price, s.per, s.pbr, s.roe, s.target_price, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.category = ? AND s.price > 0
            ORDER BY s.roe DESC NULLS LAST
        `).all(category);

        // Compute sector averages and medians
        const perVals = stocks.filter(s => s.per && s.per > 0).map(s => s.per);
        const pbrVals = stocks.filter(s => s.pbr && s.pbr > 0).map(s => s.pbr);
        const roeVals = stocks.filter(s => s.roe).map(s => s.roe);

        const avgPer = perVals.length ? perVals.reduce((a, v) => a + v, 0) / perVals.length : 0;
        const avgPbr = pbrVals.length ? pbrVals.reduce((a, v) => a + v, 0) / pbrVals.length : 0;
        const avgRoe = roeVals.length ? roeVals.reduce((a, v) => a + v, 0) / roeVals.length : 0;

        const medPer = median(perVals) || 0;
        const medPbr = median(pbrVals) || 0;
        const medRoe = median(roeVals) || 0;

        res.json({
            category,
            averages: {
                per: parseFloat(avgPer.toFixed(2)),
                pbr: parseFloat(avgPbr.toFixed(2)),
                roe: parseFloat(avgRoe.toFixed(2)),
            },
            medians: {
                per: parseFloat(medPer.toFixed(2)),
                pbr: parseFloat(medPbr.toFixed(2)),
                roe: parseFloat(medRoe.toFixed(2)),
            },
            stocks: stocks.map(s => ({
                ...s,
                perVsAvg: s.per ? parseFloat(((s.per - avgPer) / avgPer * 100).toFixed(1)) : null,
                pbrVsAvg: s.pbr ? parseFloat(((s.pbr - avgPbr) / avgPbr * 100).toFixed(1)) : null,
                roeVsAvg: s.roe ? parseFloat(((s.roe - avgRoe) / avgRoe * 100).toFixed(1)) : null,
            })),
        });
    } catch (error) {
        console.error('Sector Compare Error:', error.message);
        res.status(500).json({ error: 'Sector comparison failed' });
    }
});

// --- Weekly/Monthly Chart Data API ---
app.get('/api/stock/:code/chart/:timeframe', async (req, res) => {
    const { code, timeframe } = req.params;
    try {
        const daysBack = timeframe === 'monthly' ? 400 : 200;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startTime = startDate.toISOString().slice(0, 10).replace(/-/g, '');
        const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const tf = timeframe === 'monthly' ? 'month' : 'week';
        const response = await axios.get(NAVER_FINANCE_URL, {
            params: { symbol: code, requestType: 1, startTime, endTime, timeframe: tf },
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' }
        });

        const rawData = response.data.trim().replace(/\s+/g, '');
        const matches = [...rawData.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];

        const data = matches.map(m => ({
            date: m[1],
            open: parseInt(m[2]),
            high: parseInt(m[3]),
            low: parseInt(m[4]),
            price: parseInt(m[5]),
            volume: parseInt(m[6]),
        }));

        res.json(data);
    } catch (error) {
        console.error('Chart Timeframe Error:', error.message);
        res.json([]);
    }
});

// --- Health Check API ---
app.get('/api/health', async (req, res) => {
    const status = { api: false, database: false, lastSync: null };
    try {
        // Check database
        const dbCheck = db.prepare('SELECT COUNT(*) as count FROM stocks').get();
        status.database = dbCheck.count >= 0;

        // Check Naver API connectivity
        const testResp = await axios.get('https://finance.naver.com/item/main.naver?code=005930', {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        status.api = testResp.status === 200;
    } catch {
        // api stays false
    }

    try {
        const latest = db.prepare('SELECT MAX(last_updated) as ts FROM stocks WHERE last_updated IS NOT NULL').get();
        status.lastSync = latest?.ts || null;
    } catch { /* ignore */ }

    res.json(status);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
