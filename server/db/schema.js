export function initSchema(db) {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS stocks (
        code TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        price INTEGER,
        change TEXT,
        change_rate TEXT,
        per REAL,
        pbr REAL,
        roe REAL,
        target_price INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS holding_stocks (
        device_id TEXT NOT NULL DEFAULT 'default',
        code TEXT NOT NULL,
        avg_price INTEGER,
        weight INTEGER,
        quantity INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (device_id, code),
        FOREIGN KEY (code) REFERENCES stocks (code)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS stock_history (
        code TEXT,
        date TEXT,
        price INTEGER,
        open INTEGER,
        high INTEGER,
        low INTEGER,
        volume INTEGER,
        PRIMARY KEY (code, date)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS recommended_stocks (
        code TEXT PRIMARY KEY,
        reason TEXT,
        fair_price INTEGER,
        score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (code) REFERENCES stocks (code)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS stock_analysis (
        code TEXT PRIMARY KEY,
        analysis TEXT,
        advice TEXT,
        opinion TEXT,
        toss_url TEXT,
        chart_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (code) REFERENCES stocks (code)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL DEFAULT 'default',
        code TEXT NOT NULL,
        name TEXT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS watchlist (
        device_id TEXT NOT NULL DEFAULT 'default',
        code TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (device_id, code),
        FOREIGN KEY (code) REFERENCES stocks (code)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS investor_history (
        code TEXT NOT NULL,
        date TEXT NOT NULL,
        institution INTEGER,
        foreign_net INTEGER,
        individual INTEGER,
        PRIMARY KEY (code, date)
      )
    `).run();

    // Indices
    db.prepare('CREATE INDEX IF NOT EXISTS idx_investor_history_code_date ON investor_history(code, date)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_history_code_date ON stock_history(code, date)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_stocks_category ON stocks(category)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_alerts_device_read ON alerts(device_id, read, created_at)').run();

    console.log('Database schema initialized.');
}
