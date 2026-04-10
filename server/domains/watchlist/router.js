import express from 'express';
import db from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';
import { getStockData } from '../stock/service.js';

const router = express.Router();

// GET /api/watchlist - list watchlist items for device
router.get('/', (req, res) => {
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

// POST /api/watchlist - add a code to watchlist
router.post('/', async (req, res) => {
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

// DELETE /api/watchlist/:code
router.delete('/:code', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('DELETE FROM watchlist WHERE device_id = ? AND code = ?').run(deviceId, req.params.code);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
});

export default router;
