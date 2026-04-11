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

// 쿨다운 중복 체크 — holders/watchers 루프에서 공통으로 사용.
async function hasDuplicate(pool, device_id, code, type) {
    const cooldown = ALERT_COOLDOWNS[type] || 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - cooldown).toISOString();
    const { rows } = await pool.query(
        'SELECT 1 FROM alerts WHERE device_id = $1 AND code = $2 AND type = $3 AND created_at > $4',
        [device_id, code, type, cutoff]
    );
    return rows.length > 0;
}

// 일 N건 빈도 가드: 오늘(KST 기준) 동일 device_id × 동일 종목 알림이 N건 이상이면 신규 INSERT 스킵.
// PostgreSQL TIMESTAMPTZ → KST 날짜 변환: (created_at AT TIME ZONE 'Asia/Seoul')::date
async function dailyLimitReached(pool, device_id, code) {
    const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS cnt FROM alerts
        WHERE device_id = $1 AND code = $2
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date
              = (NOW() AT TIME ZONE 'Asia/Seoul')::date
    `, [device_id, code]);
    return rows[0].cnt >= DAILY_ALERT_LIMIT_PER_STOCK;
}

// source: 'holding' | 'watchlist' — UI에서 알림 출처 뱃지로 표시 (14차 5-1).
async function insertAlert(pool, device_id, code, name, type, source, message) {
    await pool.query(
        'INSERT INTO alerts (device_id, code, name, type, source, message) VALUES ($1, $2, $3, $4, $5, $6)',
        [device_id, code, name, type, source, message]
    );
}

export async function generateAlerts(pool, code, name, price, sma5, targetPrice) {
    const { rows: holders } = await pool.query(
        'SELECT DISTINCT device_id FROM holding_stocks WHERE code = $1',
        [code]
    );
    const holderSet = new Set(holders.map(h => h.device_id));

    // sma20 선계산 (holders 루프 전체에서 재사용)
    const { rows: hist } = await pool.query(
        'SELECT price FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 20',
        [code]
    );
    const sma20ForAlert = hist.length >= 20
        ? Math.round(hist.reduce((s, r) => s + Number(r.price), 0) / 20)
        : null;

    for (const device_id of holderSet) {
        // Holding alerts — 모든 메시지는 중립적·서술형 표현으로 작성한다 (앱스토어 심사 대비).
        // sma5_break(price < sma5)와 sma5_touch(±1% 지지)는 경계 조건에서 동시 발생할 수 있으므로
        // 우선순위: 이탈(부정적) > 지지(긍정적). break가 발생하면 touch는 발생시키지 않는다.
        if (sma5) {
            const broken = price < sma5;
            const touched = !broken && price >= sma5 * 0.99 && price <= sma5 * 1.01;

            if (broken && !(await hasDuplicate(pool, device_id, code, 'sma5_break')) && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'sma5_break', 'holding',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 아래로 내려갔어요. 단기 하락 흐름이에요.`
                );
            } else if (touched && !(await hasDuplicate(pool, device_id, code, 'sma5_touch')) && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'sma5_touch', 'holding',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 부근에서 지지받고 있어요.`
                );
            }
        }

        // sell_signal: 5MA + 20MA 이중 이탈 — 중립적 표현 ("주의가 필요해요")
        if (sma5 && sma20ForAlert && price < sma5 && price < sma20ForAlert
            && !(await hasDuplicate(pool, device_id, code, 'sell_signal'))
            && !(await dailyLimitReached(pool, device_id, code))) {
            await insertAlert(pool, device_id, code, name, 'sell_signal', 'holding',
                `${name}(${code}) 주가가 5일·20일 평균 모두 아래로 내려갔어요. 하락 추세이니 주의가 필요해요.`
            );
        }
    }

    // Target price alerts for all watchers (holders + watchlist)
    // source는 "동일 device가 보유 중이면 holding, 아니면 watchlist"로 결정.
    if (targetPrice && price > 0) {
        const { rows: watchers } = await pool.query(`
            SELECT DISTINCT device_id FROM (
                SELECT device_id FROM holding_stocks WHERE code = $1
                UNION
                SELECT device_id FROM watchlist WHERE code = $1
            ) AS w
        `, [code]);

        for (const { device_id } of watchers) {
            const source = holderSet.has(device_id) ? 'holding' : 'watchlist';
            if (price >= targetPrice * 0.95
                && !(await hasDuplicate(pool, device_id, code, 'target_near'))
                && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'target_near', source,
                    `${name}(${code}) 현재가(${price.toLocaleString()}원)가 목표가(${targetPrice.toLocaleString()}원)에 근접했어요.`
                );
            }
            if (price < targetPrice * 0.7
                && !(await hasDuplicate(pool, device_id, code, 'undervalued'))
                && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'undervalued', source,
                    `${name}(${code}) 현재가가 목표가 대비 30% 이상 낮은 수준이에요. 분석 결과를 확인해보세요.`
                );
            }
        }
    }
}
