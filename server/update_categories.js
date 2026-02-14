
import axios from 'axios';
import Database from 'better-sqlite3';

const db = new Database('stocks.db');

const CATEGORY_MAP = {
    '기술/IT': ['반도체', '디스플레이', 'IT', '하드웨어', '통신장비', '전자제품', '컴퓨터', '핸드셋', '소프트웨어', '네트워크장비'],
    '바이오/헬스케어': ['제약', '생물공학', '의료기기', '건강관리', '바이오'],
    '자동차/모빌리티': ['자동차', '부품', '타이어'],
    '에너지/소재': ['전기제품', '화학', '철강', '비철금속', '에너지장비', '석유', '가스', '2차전지', '배터리'],
    '금융/지주': ['은행', '증권', '보험', '지주사', '금융'],
    '소비재/서비스': ['식품', '화장품', '소매', '백화점', '섬유', '의류', '의복', '생활용품', '악기', '레저', '가구', '유통', '음식료'],
    '엔터테인먼트/미디어': ['게임', '양방향미디어', '방송', '광고', '영화', '콘텐츠', '기획사', '포털'],
    '조선/기계/방산': ['조선', '기계', '항공우주', '건설', '방산', '방위산업']
};

async function getIndustry(code) {
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('utf-8').decode(response.data);
        // More flexible regex for industry link
        const match = html.match(/type=upjong&no=\d+">([^<]+)<\/a>/);
        return match ? match[1].trim() : null;
    } catch (e) {
        console.error(`Error fetching industry for ${code}:`, e.message);
        return null;
    }
}

function mapToCategory(industry) {
    if (!industry) return '기타/미분류';

    // Check specific keywords
    for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
        if (keywords.some(kw => industry.includes(kw))) {
            return cat.replace(':', ''); // Fix '에너지/소재:'
        }
    }
    return '소비재/서비스'; // Default for things like '악기' or others not explicitly caught
}

async function run() {
    const stocks = db.prepare('SELECT code, name FROM stocks').all();
    console.log(`Starting categorization for ${stocks.length} stocks...`);

    for (const stock of stocks) {
        const industry = await getIndustry(stock.code);
        const category = mapToCategory(industry);

        console.log(`[${stock.code}] ${stock.name} | Industry: ${industry} -> Category: ${category}`);

        db.prepare('UPDATE stocks SET category = ? WHERE code = ?').run(category, stock.code);

        // Wait a bit to avoid rate limit
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('Update complete.');
}

run();
