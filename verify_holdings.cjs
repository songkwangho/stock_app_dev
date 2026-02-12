const Database = require('better-sqlite3');
const db = new Database('./server/stocks.db');

// Check schema
const info = db.prepare('PRAGMA table_info(stocks)').all();
console.log('Stocks Table Schema:', info);

// Manually add a holding
try {
    // Upsert if code exists or insert
    const stockExists = db.prepare('SELECT * FROM stocks WHERE code = ?').get('005930');
    if (stockExists) {
        db.prepare('UPDATE stocks SET avg_price = 70000, weight = 40 WHERE code = ?').run('005930');
    } else {
        db.prepare('INSERT INTO stocks (code, name, avg_price, weight) VALUES (?, ?, ?, ?)').run('005930', '삼성전자', 70000, 40);
    }
    console.log('Successfully added/updated holding.');
} catch (e) {
    console.error('Failed to add holding:', e.message);
}

const holdings = db.prepare('SELECT * FROM stocks WHERE avg_price IS NOT NULL').all();
console.log('Current Holdings:', holdings);
