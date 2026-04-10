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
            // source='manual' (initialRecommendations 시드)은 영구 보존.
            // ON CONFLICT가 created_at을 갱신하지 않아 시드 데이터의 created_at은 최초 부팅 시점에 고정되며,
            // 서버가 20일 이상 무중단 운영 시 시드 추천 종목이 통째로 삭제되는 버그를 방지한다.
            const delRecs = db.prepare("DELETE FROM recommended_stocks WHERE created_at < ? AND source != 'manual'").run(thresholdStr);
            console.log(`Cleanup complete: Deleted ${delAnalysis.changes} analysis rows and ${delRecs.changes} recommendation rows.`);
        } catch (error) {
            console.error('Cleanup Error:', error.message);
        }
    }

    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
}
