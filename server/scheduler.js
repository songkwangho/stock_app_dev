// Scheduler: syncAllStocks delayed startup + daily 8AM
// This module is imported by server.js after getStockData is defined

export function setupScheduler(syncAllStocks) {
    // Delay initial sync by 5 seconds to avoid blocking server startup
    setTimeout(() => syncAllStocks(), 5000);

    // Schedule daily 8AM sync
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (now >= next8AM) next8AM.setDate(next8AM.getDate() + 1);
    const msUntil8AM = next8AM.getTime() - now.getTime();
    console.log(`Next data sync scheduled at ${next8AM.toLocaleString('ko-KR')} (in ${Math.round(msUntil8AM / 60000)}min)`);

    setTimeout(() => {
        syncAllStocks();
        setInterval(syncAllStocks, 24 * 60 * 60 * 1000);
    }, msUntil8AM);
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
