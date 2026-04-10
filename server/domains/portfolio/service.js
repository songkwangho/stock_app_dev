import db from '../../db/connection.js';

// Recalculate weight for all holdings of a device based on investment cost
export function recalcWeights(deviceId) {
    const holdings = db.prepare(
        'SELECT code, avg_price, quantity FROM holding_stocks WHERE device_id = ?'
    ).all(deviceId);
    const totalCost = holdings.reduce((sum, h) => sum + (h.avg_price || 0) * (h.quantity || 0), 0);
    if (totalCost <= 0) return;
    const updateStmt = db.prepare('UPDATE holding_stocks SET weight = ? WHERE device_id = ? AND code = ?');
    const txn = db.transaction(() => {
        for (const h of holdings) {
            const cost = (h.avg_price || 0) * (h.quantity || 0);
            const weight = Math.round(cost / totalCost * 100);
            updateStmt.run(weight, deviceId, h.code);
        }
    });
    txn();
}
