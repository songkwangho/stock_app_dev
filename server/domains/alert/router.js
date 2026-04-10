import express from 'express';
import db from '../../db/connection.js';
import { requireDeviceId } from '../../helpers/deviceId.js';

const router = express.Router();

// GET /api/alerts - list 50 most recent alerts for device
router.get('/', (req, res) => {
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

// GET /api/alerts/unread-count
router.get('/unread-count', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        const result = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE device_id = ? AND read = 0').get(deviceId);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to count alerts' });
    }
});

// POST /api/alerts/read - mark all unread alerts as read
router.post('/read', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('UPDATE alerts SET read = 1 WHERE device_id = ? AND read = 0').run(deviceId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark alerts as read' });
    }
});

// DELETE /api/alerts/:id
router.delete('/:id', (req, res) => {
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;
    try {
        db.prepare('DELETE FROM alerts WHERE id = ? AND device_id = ?').run(req.params.id, deviceId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alert' });
    }
});

export default router;
