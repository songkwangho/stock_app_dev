import express from 'express';
import db from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';
import { calculateHoldingOpinion } from '../analysis/scoring.js';
import { computeSMA } from '../../helpers/sma.js';
import { recalcWeights } from './service.js';
import { getStockData } from '../stock/service.js';

const router = express.Router();

// GET /api/holdings - list holdings with runtime holding_opinion
router.get('/', (req, res) => {
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

        const enriched = holdings.map(h => {
            const { sma5, sma20 } = computeSMA(db, h.code);
            return {
                ...h,
                market_opinion: h.market_opinion || '중립적',
                holding_opinion: calculateHoldingOpinion(h.avg_price, h.price, sma5, sma20),
                sma_available: sma5 !== null,
            };
        });

        res.json(enriched);
    } catch (error) {
        console.error('Holdings GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});

// GET /api/holdings/history - daily aggregated portfolio value
router.get('/history', (req, res) => {
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

// POST /api/holdings - upsert holding (creates master stock if needed)
router.post('/', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code, name, avgPrice, quantity } = req.body;
    try {
        await getStockData(code, name);

        db.prepare(`
            INSERT INTO holding_stocks (device_id, code, avg_price, weight, quantity, last_updated)
            VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(device_id, code) DO UPDATE SET
                avg_price = excluded.avg_price,
                quantity = excluded.quantity,
                last_updated = CURRENT_TIMESTAMP
        `).run(deviceId, code, avgPrice, quantity || 0);

        recalcWeights(deviceId);

        const updated = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = ? AND s.code = ?
        `).get(deviceId, code);

        if (updated) {
            const { sma5, sma20 } = computeSMA(db, code);
            updated.holding_opinion = calculateHoldingOpinion(updated.avg_price, updated.price, sma5, sma20);
            updated.market_opinion = updated.market_opinion || '중립적';
            updated.sma_available = sma5 !== null;
        }
        res.json(updated);
    } catch (error) {
        console.error('Holdings POST Error:', error.message);
        res.status(500).json({ error: 'Failed to add/update holding' });
    }
});

// PUT /api/holdings/:code - partial update (avgPrice / quantity)
router.put('/:code', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.params;
    const { avgPrice, quantity } = req.body;
    try {
        const existing = db.prepare('SELECT 1 FROM holding_stocks WHERE device_id = ? AND code = ?').get(deviceId, code);
        if (!existing) return res.status(404).json({ error: 'Holding not found' });

        const updates = [];
        const params = [];
        if (avgPrice !== undefined) { updates.push('avg_price = ?'); params.push(avgPrice); }
        if (quantity !== undefined) { updates.push('quantity = ?'); params.push(quantity); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push('last_updated = CURRENT_TIMESTAMP');
        params.push(deviceId, code);
        db.prepare(`UPDATE holding_stocks SET ${updates.join(', ')} WHERE device_id = ? AND code = ?`).run(...params);
        recalcWeights(deviceId);

        const updated = db.prepare(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = ? AND s.code = ?
        `).get(deviceId, code);

        if (updated) {
            const { sma5, sma20 } = computeSMA(db, code);
            updated.holding_opinion = calculateHoldingOpinion(updated.avg_price, updated.price, sma5, sma20);
            updated.market_opinion = updated.market_opinion || '중립적';
            updated.sma_available = sma5 !== null;
        }
        res.json(updated);
    } catch (error) {
        console.error('Holdings PUT Error:', error.message);
        res.status(500).json({ error: 'Failed to update holding' });
    }
});

// DELETE /api/holdings/:code
router.delete('/:code', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.params;
    try {
        db.prepare('DELETE FROM holding_stocks WHERE device_id = ? AND code = ?').run(deviceId, code);
        recalcWeights(deviceId);
        res.json({ success: true });
    } catch (error) {
        console.error('Holdings DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to delete holding' });
    }
});

export default router;
