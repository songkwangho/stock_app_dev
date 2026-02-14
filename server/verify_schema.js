import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', 'stocks.db');

const db = new Database(dbPath);
console.log('Stock Analysis Table info:');
console.log(JSON.stringify(db.prepare('PRAGMA table_info(stock_analysis)').all(), null, 2));

console.log('\nRecommended Stocks Table info (checking created_at):');
console.log(JSON.stringify(db.prepare('PRAGMA table_info(recommended_stocks)').all(), null, 2));

db.close();
