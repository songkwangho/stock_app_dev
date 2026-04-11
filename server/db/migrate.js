// PostgreSQL 전환 후 migrate.js는 대부분 no-op.
// 신규 DB는 schema.js가 모든 컬럼을 초기 DDL에 포함시켜 생성하므로 ALTER가 불필요.
// 이 파일은 다음 용도로만 남겨둔다:
//   1) SQLite → PG 데이터 마이그레이션 후, 예상 컬럼이 모두 존재하는지 검증
//   2) 향후 새 컬럼 추가 시 information_schema 기반 가드 패턴을 제공
export async function runMigrations(pool) {
    // 주요 컬럼 존재 검증 — 누락 시 경고만 출력 (DDL은 schema.js가 책임)
    const expectations = [
        { table: 'stocks',             columns: ['category', 'eps_current', 'eps_previous'] },
        { table: 'holding_stocks',     columns: ['device_id', 'quantity'] },
        { table: 'alerts',             columns: ['device_id', 'source'] },
        { table: 'watchlist',          columns: ['device_id'] },
        { table: 'stock_analysis',     columns: ['opinion', 'toss_url'] },
        { table: 'recommended_stocks', columns: ['source', 'created_at'] },
    ];

    for (const { table, columns } of expectations) {
        for (const column of columns) {
            const exists = await columnExists(pool, table, column);
            if (!exists) {
                console.warn(`[migrate] Expected column ${table}.${column} not found — check schema.js`);
            }
        }
    }

    console.log('PostgreSQL migration checks complete.');
}

// information_schema 기반 컬럼 존재 체크 — PG 전용, SQLite PRAGMA 대체.
async function columnExists(pool, table, column) {
    const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, column]
    );
    return rows.length > 0;
}
