import express from 'express';
import { query, withTransaction } from '../../db/connection.js';
import { getDeviceId } from '../../helpers/deviceId.js';
import { invalidateCache } from '../../helpers/cache.js';
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

// POST /api/stock/:code/refresh - invalidate cache and re-fetch.
// Puppeteer 제거: 차트 캡처 경로가 사라졌으므로 단순히 getStockData만 재호출.
router.post('/stock/:code/refresh', async (req, res) => {
    const { code } = req.params;
    invalidateCache(code);
    try {
        const stockData = await getStockData(code);
        if (stockData) {
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
router.get('/stocks', async (req, res) => {
    try {
        const { rows: stocks } = await query(`
            SELECT s.*, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            ORDER BY s.category, s.name
        `);

        const results = stocks.map(s => ({
            ...s,
            price: s.price || 0,
            per: s.per !== null ? Number(s.per) : null,
            pbr: s.pbr !== null ? Number(s.pbr) : null,
            roe: s.roe !== null ? Number(s.roe) : null,
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
// 97종목 규모에서 무시 가능. 종목 수가 1,000개 이상으로 늘어나면 tsvector/trigram 인덱스 검토.
router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const like = `%${q}%`;
        const { rows: results } = await query(`
            SELECT s.code, s.name, s.category, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.name ILIKE $1 OR s.code ILIKE $1
            LIMIT 10
        `, [like]);
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

// DELETE /api/stocks/:code - remove a stock and all related rows.
// FK ON DELETE CASCADE는 holding_stocks / watchlist / recommended_stocks / stock_analysis를 자동 삭제한다.
// stock_history / investor_history는 FK가 없어 수동 삭제.
router.delete('/stocks/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const { changes } = await withTransaction(async (client) => {
            await client.query('DELETE FROM stock_history WHERE code = $1', [code]);
            await client.query('DELETE FROM investor_history WHERE code = $1', [code]);
            const result = await client.query('DELETE FROM stocks WHERE code = $1', [code]);
            return { changes: result.rowCount };
        });
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
        const { rows: manualRecs } = await query(`
            SELECT r.*, s.name, s.category
            FROM recommended_stocks r
            JOIN stocks s ON r.code = s.code
        `);

        const { rows: analysisRecs } = await query(`
            SELECT a.code, s.name, s.category, a.analysis AS reason, 50 AS score
            FROM stock_analysis a
            JOIN stocks s ON a.code = s.code
            WHERE a.opinion = '긍정적'
        `);

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
        let holdingCodes = [];
        if (deviceId) {
            const { rows: hrows } = await query('SELECT code FROM holding_stocks WHERE device_id = $1', [deviceId]);
            holdingCodes = hrows.map(h => h.code);
        }
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
            };
        }));

        const filteredResults = results.filter(r => r !== null && r.market_opinion === '긍정적').sort((a, b) => b.score - a.score);
        res.json(filteredResults);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

export default router;
