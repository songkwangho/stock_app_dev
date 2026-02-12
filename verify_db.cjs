const Database = require('better-sqlite3');
const db = new Database('./server/stocks.db');

const rows = db.prepare('SELECT * FROM recommended_stocks').all();
console.log('Count:', rows.length);
console.log('First 3:', rows.slice(0, 3));
