import { withTransaction } from '../../db/connection.js';

// Recalculate weight for all holdings of a device based on investment cost.
// PostgreSQL 전환: async + withTransaction. 호출자는 await 필수.
export async function recalcWeights(pool, deviceId) {
    const { rows: holdings } = await pool.query(
        'SELECT code, avg_price, quantity FROM holding_stocks WHERE device_id = $1',
        [deviceId]
    );
    const totalCost = holdings.reduce(
        (sum, h) => sum + Number(h.avg_price || 0) * Number(h.quantity || 0),
        0
    );
    if (totalCost <= 0) return;

    await withTransaction(async (client) => {
        for (const h of holdings) {
            const cost = Number(h.avg_price || 0) * Number(h.quantity || 0);
            const weight = Math.round(cost / totalCost * 100);
            await client.query(
                'UPDATE holding_stocks SET weight = $1 WHERE device_id = $2 AND code = $3',
                [weight, deviceId, h.code]
            );
        }
    });
}
