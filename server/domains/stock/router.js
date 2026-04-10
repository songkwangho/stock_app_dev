import express from 'express';
import axios from 'axios';
import db from '../../db/connection.js';
import { getDeviceId } from '../../helpers/deviceId.js';
import { invalidateCache } from '../../helpers/cache.js';
import { captureChart } from '../../scrapers/toss.js';
import { getStockData } from './service.js';

const router = express.Router();

// GET /api/stock/:code - fetch and store stock data
router.get('/stock/:code', async (req, res) => {
    const { code } = req.params;
    const data = await getStockData(code);
    if (data) {
        res.json(data);
    } else {
        res.status(404).json({ error: 'Stock not found' });
    }
});

// POST /api/stock/:code/refresh - invalidate cache and re-fetch
router.post('/stock/:code/refresh', async (req, res) => {
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

// GET /api/stocks - list all stocks; prices kept fresh by background sync
router.get('/stocks', (req, res) => {
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

// GET /api/search?q=...
// 인덱스: stocks.code, stock_analysis.code 모두 PRIMARY KEY (자동 인덱스).
// LEFT JOIN은 PK 기준이므로 효율적. name/code LIKE 검색은 풀스캔이지만
// 97종목 규모에서 무시 가능. 종목 수가 1,000개 이상으로 늘어나면 FTS 인덱스 검토.
router.get('/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const results = db.prepare(`
            SELECT s.code, s.name, s.category, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.name LIKE ? OR s.code LIKE ?
            LIMIT 10
        `).all(`%${q}%`, `%${q}%`);
        res.json(results);
    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/stocks - manually add a stock by code
router.post('/stocks', async (req, res) => {
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

// DELETE /api/stocks/:code - remove a stock and all related rows
router.delete('/stocks/:code', (req, res) => {
    const { code } = req.params;
    try {
        const deleteTransaction = db.transaction((stockCode) => {
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

// GET /api/recommendations - manual + analysis-based recommendations, excluding holdings
router.get('/recommendations', async (req, res) => {
    try {
        const manualRecs = db.prepare(`
            SELECT r.*, s.name, s.category
            FROM recommended_stocks r
            JOIN stocks s ON r.code = s.code
        `).all();

        const analysisRecs = db.prepare(`
            SELECT a.code, s.name, s.category, a.analysis as reason, 50 as score
            FROM stock_analysis a
            JOIN stocks s ON a.code = s.code
            WHERE a.opinion = '긍정적'
        `).all();

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

        const deviceId = getDeviceId(req);
        const holdingCodes = deviceId
            ? db.prepare('SELECT code FROM holding_stocks WHERE device_id = ?').all(deviceId).map(h => h.code)
            : [];
        const nonHoldings = combined.filter(c => !holdingCodes.includes(c.code));

        const results = await Promise.all(nonHoldings.map(async (rec) => {
            const stockData = await getStockData(rec.code, rec.name);
            if (!stockData) return null;

            const currentPrice = stockData.price;
            // Prioritize: 1. Manual fair_price, 2. Analyst target_price, 3. Calculated 1.1x
            const fairPrice = rec.fair_price || stockData.targetPrice || Math.round(currentPrice * 1.1);

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

        const filteredResults = results.filter(r => r !== null && r.market_opinion === '긍정적').sort((a, b) => b.score - a.score);
        res.json(filteredResults);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// GET /api/market/indices - KOSPI / KOSDAQ scrape
router.get('/market/indices', async (req, res) => {
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

// GET /api/health - liveness + connectivity probe
router.get('/health', async (req, res) => {
    const status = { api: false, database: false, lastSync: null };
    try {
        const dbCheck = db.prepare('SELECT COUNT(*) as count FROM stocks').get();
        status.database = dbCheck.count >= 0;

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

export default router;
