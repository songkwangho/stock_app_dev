import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', 'stocks.db');

const db = new Database(dbPath);

const holdings = db.prepare('SELECT code FROM holding_stocks').all();
const recommendations = db.prepare('SELECT code FROM recommended_stocks').all();

console.log('HOLDINGS:', JSON.stringify(holdings.map(h => h.code)));
console.log('RECOMMENDATIONS:', JSON.stringify(recommendations.map(r => r.code)));

db.close();
