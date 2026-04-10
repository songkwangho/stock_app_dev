import express from 'express';
import axios from 'axios';
import db from '../../db/connection.js';
import { calculateIndicators } from './indicators.js';
import { median } from './scoring.js';
import { NAVER_FINANCE_URL } from '../../scrapers/naver.js';

const router = express.Router();

// GET /api/stock/:code/indicators
router.get('/stock/:code/indicators', (req, res) => {
    try {
        res.json(calculateIndicators(db, req.params.code));
    } catch (error) {
        console.error('Indicators Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate indicators' });
    }
});

// GET /api/stock/:code/volatility - stddev of daily returns over recent N days
router.get('/stock/:code/volatility', (req, res) => {
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

// GET /api/stock/:code/financials - scrape quarterly highlight table
router.get('/stock/:code/financials', async (req, res) => {
    const { code } = req.params;
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const financials = [];

        const periodMatch = html.match(/id="highlight_D_Q"[\s\S]*?<tr[\s\S]*?<th[^>]*>구분<\/th>([\s\S]*?)<\/tr>/);
        const periods = [];
        if (periodMatch) {
            const thMatches = [...periodMatch[1].matchAll(/<th[^>]*>([\d.]+)<\/th>/g)];
            for (const m of thMatches) periods.push(m[1]);
        }

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

// GET /api/stock/:code/news - scrape recent news for a stock
router.get('/stock/:code/news', async (req, res) => {
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

// GET /api/stock/:code/chart/:timeframe - weekly/monthly chart data
router.get('/stock/:code/chart/:timeframe', async (req, res) => {
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

// GET /api/screener - filter stocks by conditions
router.get('/screener', (req, res) => {
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

// GET /api/sector/:category/compare - sector medians + per-stock comparison
router.get('/sector/:category/compare', (req, res) => {
    const { category } = req.params;
    try {
        const stocks = db.prepare(`
            SELECT s.code, s.name, s.price, s.per, s.pbr, s.roe, s.target_price, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.category = ? AND s.price > 0
            ORDER BY s.roe DESC NULLS LAST
        `).all(category);

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

export default router;
