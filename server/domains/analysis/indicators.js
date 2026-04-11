// Technical Indicators Calculation (RSI, MACD, Bollinger) with beginner-friendly summary
// 각 지표마다 *_available 플래그를 함께 반환한다 (sma_available과 동일 패턴).
// UI는 플래그가 false일 때 "데이터 수집 중" 안내를 표시해야 한다.
// 필요 히스토리: RSI 15일, MACD 26일, 볼린저밴드 20일 (해당 일수가 없으면 false)
//
// PostgreSQL 전환: pool/async 시그니처. pg는 NUMERIC/BIGINT를 string으로 반환하므로 Number() 캐스팅.
export async function calculateIndicators(pool, code) {
    const { rows: rawHistory } = await pool.query(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = $1 ORDER BY date ASC',
        [code]
    );
    const history = rawHistory.map(h => ({
        date: h.date,
        price: Number(h.price),
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        volume: Number(h.volume),
    }));

    const histLen = history.length;
    const availability = {
        rsi_available: histLen >= 15,
        macd_available: histLen >= 26,
        bollinger_available: histLen >= 20,
        history_days: histLen,
    };

    if (histLen < 2) {
        return { rsi: null, macd: null, bollinger: null, summary: null, ...availability };
    }

    const prices = history.map(h => h.price);

    // RSI (14-day)
    let rsi = null;
    if (prices.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = prices.length - 14; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        rsi = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
    }

    // MACD (12, 26, 9)
    let macd = null;
    if (prices.length >= 26) {
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            for (let i = period; i < data.length; i++) {
                emaVal = data[i] * k + emaVal * (1 - k);
            }
            return emaVal;
        };
        const ema12 = ema(prices, 12);
        const ema26 = ema(prices, 26);
        const macdLine = parseFloat((ema12 - ema26).toFixed(0));
        const recentMacds = [];
        for (let i = Math.max(26, prices.length - 20); i <= prices.length; i++) {
            const slice = prices.slice(0, i);
            if (slice.length >= 26) recentMacds.push(ema(slice, 12) - ema(slice, 26));
        }
        const signal = recentMacds.length >= 9
            ? parseFloat((recentMacds.slice(-9).reduce((a, b) => a + b, 0) / 9).toFixed(0))
            : macdLine;
        const histogram = parseFloat((macdLine - signal).toFixed(0));
        macd = { macdLine, signal, histogram };
    }

    // Bollinger Bands (20, 2)
    let bollinger = null;
    if (prices.length >= 20) {
        const recent20 = prices.slice(-20);
        const sma20 = recent20.reduce((a, b) => a + b, 0) / 20;
        const stdDev = Math.sqrt(recent20.reduce((a, p) => a + Math.pow(p - sma20, 2), 0) / 20);
        const upper = Math.round(sma20 + 2 * stdDev);
        const lower = Math.round(sma20 - 2 * stdDev);
        const currentPrice = prices[prices.length - 1];
        const percentB = stdDev > 0 ? parseFloat(((currentPrice - lower) / (upper - lower) * 100).toFixed(1)) : 50;
        bollinger = { upper, middle: Math.round(sma20), lower, percentB };
    }

    // Summary for beginners
    const details = [];
    if (rsi !== null) {
        if (rsi >= 70) details.push({ indicator: 'RSI', signal: '과매수', description: '주가가 단기간에 많이 올라 쉬어갈 수 있어요.', color: 'red' });
        else if (rsi <= 30) details.push({ indicator: 'RSI', signal: '과매도', description: '주가가 많이 떨어져서 반등할 수 있어요.', color: 'green' });
        else details.push({ indicator: 'RSI', signal: '보통', description: '현재 과열이나 침체 없이 안정적이에요.', color: 'neutral' });
    }
    if (macd) {
        if (macd.histogram > 0) details.push({ indicator: 'MACD', signal: '상승 추세', description: '매수 힘이 매도 힘보다 강해요.', color: 'green' });
        else details.push({ indicator: 'MACD', signal: '하락 추세', description: '매도 힘이 매수 힘보다 강해요.', color: 'red' });
    }
    if (bollinger) {
        if (bollinger.percentB > 80) details.push({ indicator: '볼린저밴드', signal: '상단 근접', description: '주가가 평소보다 많이 올라간 상태예요.', color: 'red' });
        else if (bollinger.percentB < 20) details.push({ indicator: '볼린저밴드', signal: '하단 근접', description: '주가가 평소보다 많이 내려간 상태예요.', color: 'green' });
        else details.push({ indicator: '볼린저밴드', signal: '중간', description: '주가가 평균 부근에서 움직이고 있어요.', color: 'neutral' });
    }

    const greenCount = details.filter(d => d.color === 'green').length;
    const redCount = details.filter(d => d.color === 'red').length;
    let summary;
    if (greenCount > redCount) summary = { signal: '긍정적', description: '여러 지표가 긍정적인 신호를 보이고 있어요.', details };
    else if (redCount > greenCount) summary = { signal: '주의', description: '일부 지표가 주의 신호를 보내고 있어요. 신중하게 판단하세요.', details };
    else summary = { signal: '중립', description: '특별한 방향성 없이 안정적이에요.', details };

    return { rsi, macd, bollinger, summary, ...availability };
}
