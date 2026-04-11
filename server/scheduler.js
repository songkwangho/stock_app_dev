// Scheduler: syncAllStocks delayed startup + daily 8AM + cleanup
import { syncAllStocks, scheduleDaily8AM } from './domains/stock/service.js';

export function setupScheduler() {
    // Delay initial sync by 5 seconds to avoid blocking server startup
    setTimeout(() => syncAllStocks(), 5000);

    // Schedule daily 8AM sync
    scheduleDaily8AM();
}

// Cleanup function for data older than 20 days.
// PostgreSQL 전환: pool을 명시적으로 주입받는다 (server.js → setupCleanup(pool)).
export function setupCleanup(pool) {
    async function cleanupOldData() {
        console.log('Running cleanup for data older than 20 days...');
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - 20);
            const thresholdStr = thresholdDate.toISOString();

            const delAnalysis = await pool.query(
                'DELETE FROM stock_analysis WHERE created_at < $1',
                [thresholdStr]
            );
            // source='manual' (initialRecommendations 시드)은 영구 보존.
            // ON CONFLICT가 created_at을 갱신하지 않아 시드 데이터의 created_at은 최초 부팅 시점에 고정되며,
            // 서버가 20일 이상 무중단 운영 시 시드 추천 종목이 통째로 삭제되는 버그를 방지한다.
            const delRecs = await pool.query(
                "DELETE FROM recommended_stocks WHERE created_at < $1 AND source != 'manual'",
                [thresholdStr]
            );
            console.log(`Cleanup complete: Deleted ${delAnalysis.rowCount} analysis rows and ${delRecs.rowCount} recommendation rows.`);
        } catch (error) {
            console.error('Cleanup Error:', error.message);
        }
    }

    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
}
