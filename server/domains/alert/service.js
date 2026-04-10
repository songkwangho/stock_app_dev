// Alert cooldown per type (in milliseconds)
export const ALERT_COOLDOWNS = {
    sell_signal: 48 * 60 * 60 * 1000,  // 48h
    sma5_break: 24 * 60 * 60 * 1000,   // 24h
    sma5_touch: 24 * 60 * 60 * 1000,   // 24h
    target_near: 12 * 60 * 60 * 1000,  // 12h
    undervalued: 24 * 60 * 60 * 1000,  // 24h
};

// Push 빈도 제어: 동일 device_id × 동일 종목 × 같은 날짜(KST) 알림 ≤ N건
const DAILY_ALERT_LIMIT_PER_STOCK = 2;

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

        // 일 N건 빈도 가드: 동일 device_id × 동일 종목에 오늘(KST 기준) 이미 N건 발송됐으면 신규 INSERT 스킵.
        // SQLite는 created_at이 UTC이므로 'localtime' modifier로 변환해 KST 날짜 기준 카운트.
        const dailyLimitReached = () => {
            const row = db.prepare(
                "SELECT COUNT(*) as cnt FROM alerts WHERE device_id = ? AND code = ? AND DATE(created_at, 'localtime') = DATE('now', 'localtime')"
            ).get(device_id, code);
            return row.cnt >= DAILY_ALERT_LIMIT_PER_STOCK;
        };

        // Holding alerts — 모든 메시지는 중립적·서술형 표현으로 작성한다 (앱스토어 심사 대비).
        // sma5_break(price < sma5)와 sma5_touch(±1% 지지)는 경계 조건에서 동시 발생할 수 있으므로
        // 우선순위: 이탈(부정적) > 지지(긍정적). break가 발생하면 touch는 발생시키지 않는다.
        if (sma5) {
            const broken = price < sma5;
            const touched = !broken && price >= sma5 * 0.99 && price <= sma5 * 1.01;

            if (broken && !hasDuplicate('sma5_break') && !dailyLimitReached()) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'sma5_break',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 아래로 내려갔어요. 단기 하락 흐름이에요.`
                );
            } else if (touched && !hasDuplicate('sma5_touch') && !dailyLimitReached()) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'sma5_touch',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 부근에서 지지받고 있어요.`
                );
            }
        }

        // sell_signal: 5MA + 20MA 이중 이탈 — 중립적 표현 ("주의가 필요해요")
        const sma20ForAlert = (() => {
            const hist = db.prepare('SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 20').all(code);
            return hist.length >= 20 ? Math.round(hist.reduce((s, r) => s + r.price, 0) / 20) : null;
        })();
        if (sma5 && sma20ForAlert && price < sma5 && price < sma20ForAlert && !hasDuplicate('sell_signal') && !dailyLimitReached()) {
            db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                device_id, code, name, 'sell_signal',
                `${name}(${code}) 주가가 5일·20일 평균 모두 아래로 내려갔어요. 하락 추세이니 주의가 필요해요.`
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
            const dailyLimitReached = () => {
                const row = db.prepare(
                    "SELECT COUNT(*) as cnt FROM alerts WHERE device_id = ? AND code = ? AND DATE(created_at, 'localtime') = DATE('now', 'localtime')"
                ).get(device_id, code);
                return row.cnt >= DAILY_ALERT_LIMIT_PER_STOCK;
            };

            if (price >= targetPrice * 0.95 && !hasDuplicate('target_near') && !dailyLimitReached()) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'target_near',
                    `${name}(${code}) 현재가(${price.toLocaleString()}원)가 목표가(${targetPrice.toLocaleString()}원)에 근접했어요.`
                );
            }
            if (price < targetPrice * 0.7 && !hasDuplicate('undervalued') && !dailyLimitReached()) {
                db.prepare('INSERT INTO alerts (device_id, code, name, type, message) VALUES (?, ?, ?, ?, ?)').run(
                    device_id, code, name, 'undervalued',
                    `${name}(${code}) 현재가가 목표가 대비 30% 이상 낮은 수준이에요. 분석 결과를 확인해보세요.`
                );
            }
        }
    }
}
