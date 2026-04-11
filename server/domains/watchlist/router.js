import express from 'express';
import { query } from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';
import { getStockData } from '../stock/service.js';

const router = express.Router();

// GET /api/watchlist - list watchlist items for device
router.get('/', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const { rows: items } = await query(`
            SELECT s.code, s.name, s.category, s.price, a.opinion AS market_opinion, w.added_at
            FROM watchlist w
            JOIN stocks s ON w.code = s.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE w.device_id = $1
            ORDER BY w.added_at DESC
        `, [deviceId]);
        res.json(items);
    } catch (error) {
        console.error('Watchlist GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
});

// POST /api/watchlist - add a code to watchlist
router.post('/', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    try {
        await getStockData(code);
        await query(`
            INSERT INTO watchlist (device_id, code) VALUES ($1, $2)
            ON CONFLICT(device_id, code) DO NOTHING
        `, [deviceId, code]);
        const { rows } = await query(`
            SELECT s.code, s.name, s.category, s.price, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.code = $1
        `, [code]);
        res.json(rows[0] || null);
    } catch (error) {
        console.error('Watchlist POST Error:', error.message);
        res.status(500).json({ error: 'Failed to add to watchlist' });
    }
});

// DELETE /api/watchlist/:code
router.delete('/:code', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        await query('DELETE FROM watchlist WHERE device_id = $1 AND code = $2', [deviceId, req.params.code]);
        res.json({ success: true });
    } catch (error) {
        console.error('Watchlist DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
});

export default router;
