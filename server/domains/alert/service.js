// Alert cooldown per type (in milliseconds)
export const ALERT_COOLDOWNS = {
    sell_signal: 48 * 60 * 60 * 1000,  // 48h
    sma5_break: 24 * 60 * 60 * 1000,   // 24h
    sma5_touch: 24 * 60 * 60 * 1000,   // 24h
    target_near: 12 * 60 * 60 * 1000,  // 12h
    undervalued: 24 * 60 * 60 * 1000,  // 24h
};

export function generateAlerts(db, code, name, price, sma5, targetPrice) {
    const holders = db.prepare('SELECT DISTINCT device_id FROM holding_stocks WHERE code = ?').all(code);

    for (const { device_id } of holders) {
        const hasDuplicate = (type) => {
            const cooldown = ALERT_COOLDOWNS[type] || 24 * 60 * 60 * 1000;
            const cutoff = new Date(Date.now() - cooldown).toISOString();
            return db.prepare(
                'SELECT 1 FROM alerts WHERE device_id = ? AND code = ? AND type = ? AND created_at > ?'
            ).get(device_id, code, type, cutoff);
        };

        // Holding alerts
        if (sma5) {
            if (price < sma5 && !hasDuplicate('sma5_break')) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'sma5_break',
                    `${name}(${code}) 주가가 5일선(${sma5.toLocaleString()}원)을 하향 이탈했습니다. 리스크 관리가 필요합니다.`
                );
            }
            if (price >= sma5 * 0.99 && price <= sma5 * 1.01 && !hasDuplicate('sma5_touch')) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'sma5_touch',
                    `${name}(${code}) 주가가 5일선(${sma5.toLocaleString()}원) 부근에서 지지를 받고 있습니다. 추가매수 타점을 검토해 보세요.`
                );
            }
        }

        // sell_signal: when both 5MA AND 20MA broken (이중 이탈)
        const sma20ForAlert = (() => {
            const hist = db.prepare('SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 20').all(code);
            return hist.length >= 20 ? Math.round(hist.reduce((s, r) => s + r.price, 0) / 20) : null;
        })();
        if (sma5 && sma20ForAlert && price < sma5 && price < sma20ForAlert && !hasDuplicate('sell_signal')) {
            db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                device_id, code, name, 'sell_signal',
                `${name}(${code}) 주가가 5일선과 20일선을 모두 이탈했습니다. 매도를 검토해 주세요.`
            );
        }
    }

    // Target price alerts for all watchers (holders + watchlist)
    const watchers = db.prepare(`
        SELECT DISTINCT device_id FROM (
            SELECT device_id FROM holding_stocks WHERE code = ?
            UNION
            SELECT device_id FROM watchlist WHERE code = ?
        )
    `).all(code, code);

    if (targetPrice && price > 0) {
        for (const { device_id } of watchers) {
            const hasDuplicate = (type) => {
                const cooldown = ALERT_COOLDOWNS[type] || 24 * 60 * 60 * 1000;
                const cutoff = new Date(Date.now() - cooldown).toISOString();
                return db.prepare(
                    'SELECT 1 FROM alerts WHERE device_id = ? AND code = ? AND type = ? AND created_at > ?'
                ).get(device_id, code, type, cutoff);
            };

            if (price >= targetPrice * 0.95 && !hasDuplicate('target_near')) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'target_near',
                    `${name}(${code}) 현재가(${price.toLocaleString()}원)가 목표가(${targetPrice.toLocaleString()}원)에 근접했습니다.`
                );
            }
            if (price < targetPrice * 0.7 && !hasDuplicate('undervalued')) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'undervalued',
                    `${name}(${code}) 현재가가 목표가 대비 30% 이상 저평가 상태입니다. 매수 기회를 검토해 보세요.`
                );
            }
        }
    }
}
