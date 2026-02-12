import axios from 'axios';
import Database from 'better-sqlite3';

const db = new Database('stocks.db');

// Ensure tables and columns exist
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

try {
    const columns = db.prepare("PRAGMA table_info(stocks)").all();
    if (!columns.some(col => col.name === 'category')) {
        db.prepare('ALTER TABLE stocks ADD COLUMN category TEXT').run();
    }
} catch (e) {
    console.error('Migration error:', e.message);
}

const categoryMapping = {
    'IT/반도체': [266, 274], // 반도체와반도체장비, IT서비스
    '플랫폼': [261, 262], // 인터넷, 소프트웨어
    '자동차': [281, 282], // 자동차, 자동차부품
    '2차전지': [271], // 전기제품
    '에너지/철강': [301, 290], // 철강, 석유와가스
    '바이오': [304, 307], // 제약, 생물공학
    '금융': [310, 311], // 은행, 증권
    '화장품/소비재': [277, 303], // 화장품, 가정용품
    '유통': [293], // 유통업
    '엔터테인먼트': [308], // 엔터테인먼트와미디어
    '조선': [284] // 조선
};

async function getStocksInIndustry(industryId, categoryName) {
    console.log(`Fetching category: ${categoryName} (Industry ID: ${industryId})`);
    try {
        const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=${industryId}`;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        // Regex to match stock codes and names
        // Example: <a href="/item/main.naver?code=005930">삼성전자</a>
        const regex = /<a href="\/item\/main\.naver\?code=(\d{6})">(.*?)<\/a>/g;
        let matches = [...html.matchAll(regex)];

        // Filter out unique codes and limit to 20
        const seen = new Set();
        const results = [];
        for (const match of matches) {
            const code = match[1];
            const name = match[2];
            if (!seen.has(code)) {
                seen.add(code);
                results.push({ code, name, category: categoryName });
            }
            if (results.length >= 20) break;
        }

        return results;
    } catch (e) {
        console.error(`Error fetching industry ${industryId}:`, e.message);
        return [];
    }
}

async function run() {
    console.log('Starting Stock Collection...');

    for (const [category, ids] of Object.entries(categoryMapping)) {
        let allResults = [];
        for (const id of ids) {
            const stocks = await getStocksInIndustry(id, category);
            allResults = [...allResults, ...stocks];
            if (allResults.length >= 20) break;
        }

        const finalResults = allResults.slice(0, 20);
        console.log(`Saving ${finalResults.length} stocks for ${category}`);

        const insertStock = db.prepare(`
            INSERT INTO stocks (code, name, category)
            VALUES (?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                category = excluded.category
        `);

        const transaction = db.transaction((stocks) => {
            for (const s of stocks) {
                insertStock.run(s.code, s.name, s.category);
            }
        });

        transaction(finalResults);
    }

    console.log('Stock Collection Completed.');
}

run();
