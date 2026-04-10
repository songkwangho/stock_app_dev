import express from 'express';
import axios from 'axios';
import db from '../../db/connection.js';

const router = express.Router();

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

export default router;
