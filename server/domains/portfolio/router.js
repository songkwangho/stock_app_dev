import express from 'express';
import pool, { query } from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';
import { calculateHoldingOpinion } from '../analysis/scoring.js';
import { computeSMA } from '../../helpers/sma.js';
import { buildSetClause } from '../../helpers/queryBuilder.js';
import { recalcWeights } from './service.js';
import { getStockData } from '../stock/service.js';

const router = express.Router();

// GET /api/holdings - list holdings with runtime holding_opinion
router.get('/', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const { rows: holdings } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1
        `, [deviceId]);

        const enriched = await Promise.all(holdings.map(async (h) => {
            const { sma5, sma20 } = await computeSMA(pool, h.code);
            return {
                ...h,
                avg_price: h.avg_price !== null ? Number(h.avg_price) : null,
                weight: h.weight !== null ? Number(h.weight) : null,
                quantity: Number(h.quantity || 0),
                per: h.per !== null ? Number(h.per) : null,
                pbr: h.pbr !== null ? Number(h.pbr) : null,
                roe: h.roe !== null ? Number(h.roe) : null,
                market_opinion: h.market_opinion || '중립적',
                holding_opinion: calculateHoldingOpinion(h.avg_price, h.price, sma5, sma20),
                sma_available: sma5 !== null,
            };
        }));

        res.json(enriched);
    } catch (error) {
        console.error('Holdings GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});

// GET /api/holdings/history - daily aggregated portfolio value
router.get('/history', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const { rows: result } = await query(`
            SELECT
                sh.date,
                SUM(sh.price * h.quantity)::bigint AS value,
                SUM(h.avg_price * h.quantity)::bigint AS cost
            FROM stock_history sh
            JOIN holding_stocks h ON sh.code = h.code
            WHERE h.device_id = $1 AND sh.date IN (
                SELECT DISTINCT date FROM stock_history
                ORDER BY date DESC LIMIT 20
            )
            GROUP BY sh.date
            ORDER BY sh.date
        `, [deviceId]);

        const mapped = result.map(d => {
            const value = Number(d.value);
            const cost = Number(d.cost);
            return {
                date: d.date,
                value,
                cost,
                profitRate: cost > 0
                    ? parseFloat(((value - cost) / cost * 100).toFixed(2))
                    : 0,
            };
        });

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

        await query(`
            INSERT INTO holding_stocks (device_id, code, avg_price, weight, quantity, last_updated)
            VALUES ($1, $2, $3, 0, $4, NOW())
            ON CONFLICT(device_id, code) DO UPDATE SET
                avg_price = EXCLUDED.avg_price,
                quantity = EXCLUDED.quantity,
                last_updated = NOW()
        `, [deviceId, code, avgPrice, quantity || 0]);

        await recalcWeights(pool, deviceId);

        const { rows: updatedRows } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1 AND s.code = $2
        `, [deviceId, code]);
        const updated = updatedRows[0];

        if (updated) {
            const { sma5, sma20 } = await computeSMA(pool, code);
            updated.avg_price = updated.avg_price !== null ? Number(updated.avg_price) : null;
            updated.weight = updated.weight !== null ? Number(updated.weight) : null;
            updated.quantity = Number(updated.quantity || 0);
            updated.per = updated.per !== null ? Number(updated.per) : null;
            updated.pbr = updated.pbr !== null ? Number(updated.pbr) : null;
            updated.roe = updated.roe !== null ? Number(updated.roe) : null;
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
router.put('/:code', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.params;
    const { avgPrice, quantity } = req.body;
    try {
        const { rows: existingRows } = await query(
            'SELECT 1 FROM holding_stocks WHERE device_id = $1 AND code = $2',
            [deviceId, code]
        );
        if (existingRows.length === 0) return res.status(404).json({ error: 'Holding not found' });

        const { clause, params, nextIndex } = buildSetClause(
            { avg_price: avgPrice, quantity },
            1
        );
        if (!clause) return res.status(400).json({ error: 'No fields to update' });

        // last_updated = NOW() + WHERE device_id / code 뒤에 이어 붙임
        const sql = `UPDATE holding_stocks SET ${clause}, last_updated = NOW()
                     WHERE device_id = $${nextIndex} AND code = $${nextIndex + 1}`;
        await query(sql, [...params, deviceId, code]);

        await recalcWeights(pool, deviceId);

        const { rows: updatedRows } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1 AND s.code = $2
        `, [deviceId, code]);
        const updated = updatedRows[0];

        if (updated) {
            const { sma5, sma20 } = await computeSMA(pool, code);
            updated.avg_price = updated.avg_price !== null ? Number(updated.avg_price) : null;
            updated.weight = updated.weight !== null ? Number(updated.weight) : null;
            updated.quantity = Number(updated.quantity || 0);
            updated.per = updated.per !== null ? Number(updated.per) : null;
            updated.pbr = updated.pbr !== null ? Number(updated.pbr) : null;
            updated.roe = updated.roe !== null ? Number(updated.roe) : null;
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
router.delete('/:code', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.params;
    try {
        await query('DELETE FROM holding_stocks WHERE device_id = $1 AND code = $2', [deviceId, code]);
        await recalcWeights(pool, deviceId);
        res.json({ success: true });
    } catch (error) {
        console.error('Holdings DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to delete holding' });
    }
});

export default router;
