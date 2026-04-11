import express from 'express';
import { query } from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';

const router = express.Router();

// GET /api/alerts - list 50 most recent alerts for device
router.get('/', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const { rows: alerts } = await query(
            'SELECT * FROM alerts WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50',
            [deviceId]
        );
        res.json(alerts);
    } catch (error) {
        console.error('Alerts GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// GET /api/alerts/unread-count
router.get('/unread-count', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const { rows } = await query(
            'SELECT COUNT(*)::int AS count FROM alerts WHERE device_id = $1 AND read = 0',
            [deviceId]
        );
        res.json({ count: rows[0].count });
    } catch (error) {
        console.error('Alerts unread-count Error:', error.message);
        res.status(500).json({ error: 'Failed to count alerts' });
    }
});

// POST /api/alerts/read - mark all unread alerts as read
router.post('/read', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        await query('UPDATE alerts SET read = 1 WHERE device_id = $1 AND read = 0', [deviceId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Alerts read Error:', error.message);
        res.status(500).json({ error: 'Failed to mark alerts as read' });
    }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        await query('DELETE FROM alerts WHERE id = $1 AND device_id = $2', [req.params.id, deviceId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Alerts DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});

export default router;
