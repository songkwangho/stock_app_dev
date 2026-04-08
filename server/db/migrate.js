export function runMigrations(db) {
    // Migration: add OHLCV columns to stock_history
    tryMigration(db, 'stock_history OHLCV', () => {
        const cols = db.prepare("PRAGMA table_info(stock_history)").all();
        const colNames = cols.map(c => c.name);
        if (!colNames.includes('open')) db.prepare('ALTER TABLE stock_history ADD COLUMN open INTEGER').run();
        if (!colNames.includes('high')) db.prepare('ALTER TABLE stock_history ADD COLUMN high INTEGER').run();
        if (!colNames.includes('low')) db.prepare('ALTER TABLE stock_history ADD COLUMN low INTEGER').run();
        if (!colNames.includes('volume')) db.prepare('ALTER TABLE stock_history ADD COLUMN volume INTEGER').run();
    });

    // Migration: add quantity to holding_stocks
    tryMigration(db, 'holding_stocks.quantity', () => {
        const cols = db.prepare("PRAGMA table_info(holding_stocks)").all();
        if (!cols.some(c => c.name === 'quantity')) {
            db.prepare('ALTER TABLE holding_stocks ADD COLUMN quantity INTEGER DEFAULT 0').run();
        }
    });

    // Migration: add device_id to holding_stocks (recreate table for PK change)
    tryMigration(db, 'holding_stocks.device_id', () => {
        const cols = db.prepare("PRAGMA table_info(holding_stocks)").all();
        if (!cols.some(c => c.name === 'device_id')) {
            console.log('Migrating holding_stocks: adding device_id column...');
            db.exec(`
                CREATE TABLE holding_stocks_new (
                    device_id TEXT NOT NULL DEFAULT 'default',
                    code TEXT NOT NULL,
                    avg_price INTEGER,
                    weight INTEGER,
                    quantity INTEGER DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (device_id, code),
                    FOREIGN KEY (code) REFERENCES stocks (code)
                );
                INSERT INTO holding_stocks_new (device_id, code, avg_price, weight, quantity, last_updated)
                    SELECT 'default', code, avg_price, weight, quantity, last_updated FROM holding_stocks;
                DROP TABLE holding_stocks;
                ALTER TABLE holding_stocks_new RENAME TO holding_stocks;
            `);
            console.log('holding_stocks migration complete.');
        }
    });

    // Migration: add device_id to alerts
    tryMigration(db, 'alerts.device_id', () => {
        const cols = db.prepare("PRAGMA table_info(alerts)").all();
        if (!cols.some(c => c.name === 'device_id')) {
            db.prepare("ALTER TABLE alerts ADD COLUMN device_id TEXT NOT NULL DEFAULT 'default'").run();
        }
    });

    // Migration: add device_id to watchlist (recreate table for PK change)
    tryMigration(db, 'watchlist.device_id', () => {
        const cols = db.prepare("PRAGMA table_info(watchlist)").all();
        if (!cols.some(c => c.name === 'device_id')) {
            db.exec(`
                CREATE TABLE watchlist_new (
                    device_id TEXT NOT NULL DEFAULT 'default',
                    code TEXT NOT NULL,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (device_id, code),
                    FOREIGN KEY (code) REFERENCES stocks (code)
                );
                INSERT INTO watchlist_new (device_id, code, added_at)
                    SELECT 'default', code, added_at FROM watchlist;
                DROP TABLE watchlist;
                ALTER TABLE watchlist_new RENAME TO watchlist;
            `);
        }
    });

    // Migration: add category column to stocks
    tryMigration(db, 'stocks.category', () => {
        const columns = db.prepare("PRAGMA table_info(stocks)").all();
        if (!columns.some(col => col.name === 'category')) {
            db.prepare('ALTER TABLE stocks ADD COLUMN category TEXT').run();
        }
    });

    // Migration: migrate existing holdings from stocks to holding_stocks
    tryMigration(db, 'holding_stocks data', () => {
        const existingHoldings = db.prepare('SELECT code, avg_price, weight FROM stocks WHERE avg_price IS NOT NULL').all();
        for (const h of existingHoldings) {
            db.prepare(`
                INSERT INTO holding_stocks (device_id, code, avg_price, weight)
                VALUES ('default', ?, ?, ?)
                ON CONFLICT(device_id, code) DO UPDATE SET
                    avg_price = excluded.avg_price,
                    weight = excluded.weight
            `).run(h.code, h.avg_price, h.weight);
        }
    });

    // Migration: add created_at to recommended_stocks
    tryMigration(db, 'recommended_stocks.created_at', () => {
        const columns = db.prepare("PRAGMA table_info(recommended_stocks)").all();
        if (!columns.some(col => col.name === 'created_at')) {
            db.prepare('ALTER TABLE recommended_stocks ADD COLUMN created_at DATETIME').run();
            db.prepare('UPDATE recommended_stocks SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL').run();
        }
    });

    // Migration: add EPS columns to stocks
    tryMigration(db, 'stocks.eps', () => {
        const columns = db.prepare("PRAGMA table_info(stocks)").all();
        if (!columns.some(col => col.name === 'eps_current')) {
            db.prepare('ALTER TABLE stocks ADD COLUMN eps_current REAL').run();
        }
        if (!columns.some(col => col.name === 'eps_previous')) {
            db.prepare('ALTER TABLE stocks ADD COLUMN eps_previous REAL').run();
        }
    });

    // Migration: add chart_path to stock_analysis
    tryMigration(db, 'stock_analysis.chart_path', () => {
        const columns = db.prepare("PRAGMA table_info(stock_analysis)").all();
        if (!columns.some(col => col.name === 'chart_path')) {
            db.prepare('ALTER TABLE stock_analysis ADD COLUMN chart_path TEXT').run();
        }
    });

    // Migration: add source to recommended_stocks
    tryMigration(db, 'recommended_stocks.source', () => {
        const columns = db.prepare("PRAGMA table_info(recommended_stocks)").all();
        if (!columns.some(col => col.name === 'source')) {
            db.prepare("ALTER TABLE recommended_stocks ADD COLUMN source TEXT DEFAULT 'manual'").run();
        }
    });

    console.log('All migrations complete.');
}

function tryMigration(db, name, fn) {
    try {
        fn();
    } catch (e) {
        console.error(`Migration error (${name}):`, e.message);
    }
}
