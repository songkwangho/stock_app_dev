export function median(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Valuation Score: 0.0 ~ 3.0
export function calculateValuationScore(db, code, per, pbr, roe, price, targetPrice, epsCurrent, epsPrevious) {
    const stock = db.prepare('SELECT category FROM stocks WHERE code = ?').get(code);
    const category = stock?.category;
    let per_negative = false;
    let low_confidence = false;

    let perScore = 0;
    if (per !== null && per !== undefined && per < 0) {
        perScore = 0;
        per_negative = true;
    } else if (per && per > 0 && category) {
        const peers = db.prepare(
            'SELECT per FROM stocks WHERE category = ? AND per > 0 AND per < 200 AND code != ?'
        ).all(category, code).map(r => r.per);
        if (peers.length < 5) low_confidence = true;
        if (peers.length >= 3) {
            const sectorPer = median(peers);
            if (per < sectorPer * 0.7) perScore = 1.0;
            else if (per < sectorPer) perScore = 0.5 + 0.5 * (1 - per / sectorPer);
            else perScore = Math.max(0, 0.5 - 0.5 * (per / sectorPer - 1));
        } else if (targetPrice && price < targetPrice) {
            perScore = Math.min(0.5, (targetPrice - price) / targetPrice);
        }
    } else if (targetPrice && price < targetPrice) {
        perScore = Math.min(0.5, (targetPrice - price) / targetPrice);
    }

    let pbrScore = 0;
    if (pbr && pbr > 0 && category) {
        const peers = db.prepare(
            'SELECT pbr FROM stocks WHERE category = ? AND pbr > 0 AND pbr < 20 AND code != ?'
        ).all(category, code).map(r => r.pbr);
        if (peers.length < 5 && !low_confidence) low_confidence = true;
        if (peers.length >= 3) {
            const sectorPbr = median(peers);
            if (pbr < sectorPbr * 0.7) pbrScore = 1.0;
            else if (pbr < sectorPbr) pbrScore = 0.5 + 0.5 * (1 - pbr / sectorPbr);
            else pbrScore = Math.max(0, 0.5 - 0.5 * (pbr / sectorPbr - 1));
        }
    }

    let pegScore = 0;
    let pegInvalid = false;
    if (epsCurrent && epsPrevious && Math.abs(epsPrevious) > 0 && per && per > 0) {
        const epsGrowth = (epsCurrent - epsPrevious) / Math.abs(epsPrevious) * 100;
        if (epsGrowth > 0) {
            const peg = per / epsGrowth;
            if (peg < 0.5) pegScore = 1.0;
            else if (peg < 1.0) pegScore = 0.75;
            else if (peg < 1.5) pegScore = 0.5;
            else if (peg < 2.0) pegScore = 0.25;
        } else {
            pegInvalid = true;
        }
    } else if (roe && roe > 15) {
        pegScore = 0.5;
    } else if (roe && roe > 10) {
        pegScore = 0.25;
    } else {
        pegInvalid = true;
    }

    let total;
    if (pegInvalid) {
        total = parseFloat(((perScore + pbrScore) / 2.0 * 3.0).toFixed(2));
    } else {
        total = parseFloat((perScore + pbrScore + pegScore).toFixed(2));
    }

    return {
        total: Math.min(3.0, total),
        detail: {
            perScore: parseFloat(perScore.toFixed(2)),
            pbrScore: parseFloat(pbrScore.toFixed(2)),
            pegScore: parseFloat(pegScore.toFixed(2)),
            per_negative,
            low_confidence
        }
    };
}

// Technical Score: 0.0 ~ 3.0
export function calculateTechnicalScore(db, code) {
    const history = db.prepare(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date ASC'
    ).all(code);
    if (history.length < 15) return { total: 1.5, detail: {} };

    const prices = history.map(h => h.price);
    const volumes = history.map(h => h.volume);
    const latestPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];

    let rsiScore = 0.5;
    if (prices.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = prices.length - 14; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) gains += diff; else losses -= diff;
        }
        const avgGain = gains / 14, avgLoss = losses / 14;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        rsiScore = Math.max(0, Math.min(1, (70 - rsi) / 40));
        if (rsi >= 30 && rsi <= 50) {
            rsiScore += (50 - rsi) / 20 * 0.3;
            rsiScore = Math.min(1, rsiScore);
        }
    }

    let macdScore = 0.5;
    if (prices.length >= 26) {
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let v = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            for (let i = period; i < data.length; i++) v = data[i] * k + v * (1 - k);
            return v;
        };
        const recentMacds = [];
        for (let i = Math.max(26, prices.length - 20); i <= prices.length; i++) {
            const slice = prices.slice(0, i);
            if (slice.length >= 26) recentMacds.push(ema(slice, 12) - ema(slice, 26));
        }
        if (recentMacds.length >= 9) {
            const signal = recentMacds.slice(-9).reduce((a, b) => a + b, 0) / 9;
            const histCurrent = recentMacds[recentMacds.length - 1] - signal;
            const histPrev = recentMacds.length >= 10
                ? recentMacds[recentMacds.length - 2] - (recentMacds.slice(-10, -1).slice(-9).reduce((a, b) => a + b, 0) / 9)
                : histCurrent;
            const increasing = histCurrent > histPrev;
            if (histCurrent > 0 && increasing) macdScore = 1.0;
            else if (histCurrent > 0) macdScore = 0.6;
            else if (histCurrent < 0 && increasing) macdScore = 0.4;
            else macdScore = 0.0;
        }
    }

    let bollingerScore = 0.5;
    if (prices.length >= 20) {
        const recent20 = prices.slice(-20);
        const sma20 = recent20.reduce((a, b) => a + b, 0) / 20;
        const stdDev = Math.sqrt(recent20.reduce((a, p) => a + Math.pow(p - sma20, 2), 0) / 20);
        if (stdDev > 0) {
            const upper = sma20 + 2 * stdDev;
            const lower = sma20 - 2 * stdDev;
            const percentB = (latestPrice - lower) / (upper - lower) * 100;
            bollingerScore = Math.max(0, Math.min(1, (80 - percentB) / 80));
        }
    }

    let volumeScore = 0.5;
    if (volumes.length >= 20) {
        const volMA20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        if (volMA20 > 0) {
            const volumeRatio = volumes[volumes.length - 1] / volMA20;
            const priceUp = latestPrice > prevPrice;
            if (priceUp && volumeRatio > 1.5) volumeScore = 1.0;
            else if (priceUp && volumeRatio > 1.0) volumeScore = 0.7;
            else if (priceUp) volumeScore = 0.4;
            else if (!priceUp && volumeRatio > 1.5) volumeScore = 0.0;
            else volumeScore = 0.2;
        }
    }

    const weighted = 0.3 * rsiScore + 0.25 * macdScore + 0.2 * bollingerScore + 0.25 * volumeScore;
    return {
        total: parseFloat((weighted * 3).toFixed(2)),
        detail: {
            rsiScore: parseFloat(rsiScore.toFixed(2)),
            macdScore: parseFloat(macdScore.toFixed(2)),
            bollingerScore: parseFloat(bollingerScore.toFixed(2)),
            volumeScore: parseFloat(volumeScore.toFixed(2))
        }
    };
}

// Supply/Demand Score: 0.0 ~ 2.0
export function calculateSupplyDemandScore(db, code) {
    const rows = db.prepare(
        'SELECT date, institution, foreign_net FROM investor_history WHERE code = ? ORDER BY date DESC LIMIT 20'
    ).all(code);
    if (rows.length < 3) return { total: 0, detail: {} };

    let consecutiveForeignBuy = 0;
    for (const r of rows) {
        if (r.foreign_net > 0) consecutiveForeignBuy++;
        else break;
    }

    let consecutiveInstBuy = 0;
    for (const r of rows) {
        if (r.institution > 0) consecutiveInstBuy++;
        else break;
    }

    const foreignScore = consecutiveForeignBuy >= 5 ? 1.2
        : consecutiveForeignBuy >= 3 ? 0.84
        : consecutiveForeignBuy >= 1 ? 0.36 : 0;

    const instScore = consecutiveInstBuy >= 5 ? 0.8
        : consecutiveInstBuy >= 3 ? 0.56
        : consecutiveInstBuy >= 1 ? 0.24 : 0;

    return {
        total: parseFloat(Math.min(2.0, foreignScore + instScore).toFixed(2)),
        detail: {
            foreignConsecutive: consecutiveForeignBuy,
            instConsecutive: consecutiveInstBuy,
            foreignScore: parseFloat(foreignScore.toFixed(2)),
            instScore: parseFloat(instScore.toFixed(2))
        }
    };
}

// Trend Score: 0.0 ~ 2.0
export function calculateTrendScore(latestPrice, sma5, sma20) {
    if (!sma5 || !sma20) return { total: 1.0, detail: { reason: '이평선 데이터 부족' } };
    if (latestPrice > sma5 && sma5 > sma20) {
        return { total: 2.0, detail: { reason: '정배열: 주가 > 5일선 > 20일선' } };
    } else if (latestPrice > sma5 && sma5 <= sma20) {
        return { total: 1.0, detail: { reason: '5일선 위이나 역배열 상태' } };
    } else if (latestPrice > sma20 && latestPrice <= sma5) {
        return { total: 0.5, detail: { reason: '20일선 위이나 5일선 아래' } };
    } else {
        return { total: 0.0, detail: { reason: '주가가 양 이평선 아래' } };
    }
}

// Holding Opinion (runtime, not saved to DB)
export function calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20) {
    if (!avgPrice || !currentPrice) return '보유';
    const lossRate = (currentPrice - avgPrice) / avgPrice;
    const STOP_LOSS = -0.07;

    if (lossRate <= STOP_LOSS) return '매도';
    if (sma5 && sma20 && currentPrice < sma5 && currentPrice < sma20) return '매도';
    if (sma5 && sma20 && currentPrice < sma5 && currentPrice >= sma20) return '관망';
    if (sma5 && currentPrice >= sma5 && currentPrice <= sma5 * 1.01) return '추가매수';
    if (sma5 && sma20 && currentPrice > sma5 && sma5 > sma20) return '보유';
    return '보유';
}
