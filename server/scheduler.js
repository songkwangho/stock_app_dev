// Scheduler: syncAllStocks delayed startup + daily 8AM + cleanup
import { syncAllStocks, scheduleDaily8AM } from './domains/stock/service.js';

export function setupScheduler() {
    // Delay initial sync by 5 seconds to avoid blocking server startup
    setTimeout(() => syncAllStocks(), 5000);

    // Schedule daily 8AM sync
    scheduleDaily8AM();
}

// Cleanup function for data older than 20 days
export function setupCleanup(db) {
    function cleanupOldData() {
        console.log('Running cleanup for data older than 20 days...');
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - 20);
            const thresholdStr = thresholdDate.toISOString();
            const delAnalysis = db.prepare('DELETE FROM stock_analysis WHERE created_at < ?').run(thresholdStr);
            const delRecs = db.prepare('DELETE FROM recommended_stocks WHERE created_at < ?').run(thresholdStr);
            console.log(`Cleanup complete: Deleted ${delAnalysis.changes} analysis rows and ${delRecs.changes} recommendation rows.`);
        } catch (error) {
            console.error('Cleanup Error:', error.message);
        }
    }

    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
}
