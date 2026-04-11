// PostgreSQL 초기 DDL — SQLite의 migrate.js로 추가되던 컬럼(eps_current, eps_previous,
// source, category 등)을 모두 초기 스키마에 내재화한다.
// (chart_path 컬럼은 Puppeteer 제거와 함께 삭제됐다.)
// 신규 DB에서는 migrate.js가 사실상 불필요 (기존 SQLite 데이터 마이그레이션 검증용으로만 남김).
export async function initSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stocks (
            code         TEXT PRIMARY KEY,
            name         TEXT,
            category     TEXT,
            price        INTEGER,
            change       TEXT,
            change_rate  TEXT,
            per          NUMERIC(10,4),
            pbr          NUMERIC(10,4),
            roe          NUMERIC(10,4),
            target_price INTEGER,
            eps_current  NUMERIC(14,4),
            eps_previous NUMERIC(14,4),
            last_updated TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS holding_stocks (
            device_id    TEXT NOT NULL DEFAULT 'default',
            code         TEXT NOT NULL REFERENCES stocks (code) ON DELETE CASCADE,
            avg_price    INTEGER,
            weight       INTEGER,
            quantity     INTEGER DEFAULT 0,
            last_updated TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (device_id, code)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_history (
            code   TEXT NOT NULL,
            date   TEXT NOT NULL,
            price  INTEGER,
            open   INTEGER,
            high   INTEGER,
            low    INTEGER,
            volume BIGINT,
            PRIMARY KEY (code, date)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS recommended_stocks (
            code       TEXT PRIMARY KEY REFERENCES stocks (code) ON DELETE CASCADE,
            reason     TEXT,
            fair_price INTEGER,
            score      INTEGER,
            source     TEXT DEFAULT 'manual',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_analysis (
            code       TEXT PRIMARY KEY REFERENCES stocks (code) ON DELETE CASCADE,
            analysis   TEXT,
            advice     TEXT,
            opinion    TEXT,
            toss_url   TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // source: 'holding' | 'watchlist' — 프론트에서 알림 출처를 구분 표시하는 용도 (14차 5-1).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
            id         BIGSERIAL PRIMARY KEY,
            device_id  TEXT NOT NULL DEFAULT 'default',
            code       TEXT NOT NULL,
            name       TEXT,
            type       TEXT NOT NULL,
            source     TEXT NOT NULL DEFAULT 'holding',
            message    TEXT NOT NULL,
            read       INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS watchlist (
            device_id TEXT NOT NULL DEFAULT 'default',
            code      TEXT NOT NULL REFERENCES stocks (code) ON DELETE CASCADE,
            added_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (device_id, code)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS investor_history (
            code         TEXT NOT NULL,
            date         TEXT NOT NULL,
            institution  BIGINT,
            foreign_net  BIGINT,
            individual   BIGINT,
            PRIMARY KEY (code, date)
        )
    `);

    // Indices
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investor_history_code_date ON investor_history(code, date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_history_code_date ON stock_history(code, date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_stocks_category ON stocks(category)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_device_read ON alerts(device_id, read, created_at)');

    console.log('PostgreSQL schema initialized.');
}
