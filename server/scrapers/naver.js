import axios from 'axios';

const NAVER_FINANCE_URL = 'https://api.finance.naver.com/siseJson.naver';

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

export function mapToCategory(industry) {
    if (!industry) return '기타/미분류';
    for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
        if (keywords.some(kw => industry.includes(kw))) {
            return cat;
        }
    }
    return '소비재/서비스';
}

// Fetch price history from Naver Finance API
export async function fetchPriceHistory(code, startTime, endTime) {
    const response = await axios.get(NAVER_FINANCE_URL, {
        params: {
            symbol: code,
            requestType: 1,
            startTime,
            endTime,
            timeframe: 'day'
        },
        responseType: 'text'
    });
    // Parse Naver's JSONP-like response
    const raw = response.data.replace(/'/g, '"').trim();
    const rows = JSON.parse(raw);
    // Skip header row
    return rows.slice(1).map(row => ({
        date: row[0]?.trim()?.replace(/"/g, ''),
        open: parseInt(row[1]),
        high: parseInt(row[2]),
        low: parseInt(row[3]),
        price: parseInt(row[4]),
        volume: parseInt(row[5])
    })).filter(r => r.date && !isNaN(r.price));
}

// Fetch weekly/monthly chart data from Naver Finance API
export async function fetchChartData(code, timeframe, startTime, endTime) {
    const response = await axios.get(NAVER_FINANCE_URL, {
        params: {
            symbol: code,
            requestType: 1,
            startTime,
            endTime,
            timeframe: timeframe === 'weekly' ? 'week' : 'month'
        },
        responseType: 'text'
    });
    const raw = response.data.replace(/'/g, '"').trim();
    const rows = JSON.parse(raw);
    return rows.slice(1).map(row => ({
        date: row[0]?.trim()?.replace(/"/g, ''),
        open: parseInt(row[1]),
        high: parseInt(row[2]),
        low: parseInt(row[3]),
        price: parseInt(row[4]),
        volume: parseInt(row[5])
    })).filter(r => r.date && !isNaN(r.price));
}

// Scrape main page metrics (PER, PBR, ROE, target, EPS, industry) — EUC-KR
export async function scrapeMainPage(code) {
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer'
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const getMatch = (regex) => { const m = html.match(regex); return m ? m[1] : null; };

        const per = parseFloat(getMatch(/PER.*?<em[^>]*>([\d,.-]+)<\/em>/s)) || null;
        const pbr = parseFloat(getMatch(/PBR.*?<em[^>]*>([\d,.-]+)<\/em>/s)) || null;
        const roe = parseFloat(getMatch(/ROE.*?<em[^>]*>([\d,.-]+)<\/em>/s)) || null;
        const targetPrice = parseInt(getMatch(/목표주가.*?<em[^>]*>([\d,]+)<\/em>/s)?.replace(/,/g, '')) || null;

        // Industry for category mapping
        const industry = getMatch(/class="sub_tit.*?">\s*<a[^>]*>([^<]+)<\/a>/s)?.trim() || null;

        // EPS (for PEG calculation)
        let epsCurrent = null, epsPrevious = null;
        const epsMatch = html.match(/th_cop_anal17.*?<\/tr>([\s\S]*?)<\/table>/);
        if (epsMatch) {
            const tds = epsMatch[1].match(/<td[^>]*>([\d,.-]+)<\/td>/g);
            if (tds && tds.length >= 4) {
                epsPrevious = parseFloat(tds[2]?.match(/([\d,.-]+)/)?.[1]?.replace(/,/g, '')) || null;
                epsCurrent = parseFloat(tds[3]?.match(/([\d,.-]+)/)?.[1]?.replace(/,/g, '')) || null;
            }
        }

        return { per, pbr, roe, targetPrice, industry, epsCurrent, epsPrevious };
    } catch (e) {
        console.error(`Naver main page scrape failed for ${code}:`, e.message);
        return { per: null, pbr: null, roe: null, targetPrice: null, industry: null, epsCurrent: null, epsPrevious: null };
    }
}

// Scrape investor data (foreign/institutional/individual) — EUC-KR
export async function scrapeInvestorData(code) {
    try {
        const response = await axios.get(`https://finance.naver.com/item/frgn.naver?code=${code}`, {
            responseType: 'arraybuffer'
        });
        const html = new TextDecoder('euc-kr').decode(response.data);
        const rows = html.match(/<tr[^>]*class="(bg|)"[^>]*>[\s\S]*?<\/tr>/g) || [];

        return rows.slice(0, 20).map(row => {
            const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
            const getText = (i) => tds[i]?.replace(/<[^>]+>/g, '')?.trim()?.replace(/,/g, '') || '0';
            return {
                date: getText(0).replace(/\./g, ''),
                institution: parseInt(getText(5)) || 0,
                foreign_net: parseInt(getText(6)) || 0,
                individual: parseInt(getText(7)) || 0
            };
        }).filter(r => r.date && r.date.length === 8);
    } catch (e) {
        console.error(`Naver investor scrape failed for ${code}:`, e.message);
        return [];
    }
}

// Scrape financial statements — EUC-KR
export async function scrapeFinancials(code) {
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer'
        });
        const html = new TextDecoder('euc-kr').decode(response.data);
        const tableMatch = html.match(/highlight_D_Q[\s\S]*?<table[\s\S]*?<\/table>/);
        if (!tableMatch) return { periods: [], financials: [] };

        const table = tableMatch[0];
        const headerMatch = table.match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
        const periods = headerMatch.slice(1).map(h => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

        const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/g) || [];
        const financials = [];
        for (const row of rowMatches) {
            const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) || [];
            if (cells.length < 2) continue;
            const label = cells[0].replace(/<[^>]+>/g, '').trim();
            if (['매출액', '영업이익', '당기순이익'].some(k => label.includes(k))) {
                const values = cells.slice(1).map(c => {
                    const v = c.replace(/<[^>]+>/g, '').trim().replace(/,/g, '');
                    return v ? parseFloat(v) : null;
                });
                financials.push({ label, values });
            }
        }
        return { periods, financials };
    } catch (e) {
        console.error(`Naver financials scrape failed for ${code}:`, e.message);
        return { periods: [], financials: [] };
    }
}

// Scrape news
export async function scrapeNews(code) {
    try {
        const response = await axios.get(`https://finance.naver.com/item/news_news.naver?code=${code}&page=1`, {
            responseType: 'arraybuffer'
        });
        const html = new TextDecoder('euc-kr').decode(response.data);
        const rows = html.match(/<tr[\s\S]*?class="relation_lst"[\s\S]*?<\/tr>/g)
                  || html.match(/<tr[\s\S]*?<td[\s\S]*?class="title"[\s\S]*?<\/tr>/g) || [];

        return rows.slice(0, 10).map(row => {
            const titleMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
            const dateMatch = row.match(/<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/);
            const sourceMatch = row.match(/<td[^>]*class="info"[^>]*>([\s\S]*?)<\/td>/);
            return {
                title: titleMatch?.[2]?.replace(/<[^>]+>/g, '').trim() || '',
                url: titleMatch?.[1] ? `https://finance.naver.com${titleMatch[1]}` : '',
                date: dateMatch?.[1]?.trim() || '',
                source: sourceMatch?.[1]?.trim() || ''
            };
        }).filter(n => n.title);
    } catch (e) {
        console.error(`Naver news scrape failed for ${code}:`, e.message);
        return [];
    }
}

// Scrape market indices (KOSPI/KOSDAQ)
export async function scrapeMarketIndices() {
    try {
        const response = await axios.get('https://finance.naver.com/', {
            responseType: 'arraybuffer'
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const parseIndex = (name) => {
            const regex = new RegExp(`${name}[\\s\\S]*?<span[^>]*class="num"[^>]*>([\\d,.]+)<\\/span>[\\s\\S]*?class="(up|down|same)"[^>]*>[\\s\\S]*?([\\d,.]+)[\\s\\S]*?([\\d,.%]+)`, 'i');
            const m = html.match(regex);
            if (!m) return { symbol: name, value: null, change: '', changeRate: '', positive: false };
            return {
                symbol: name,
                value: parseFloat(m[1].replace(/,/g, '')),
                change: m[3],
                changeRate: m[4],
                positive: m[2] === 'up'
            };
        };

        return [parseIndex('코스피'), parseIndex('코스닥')];
    } catch (e) {
        console.error('Market indices scrape failed:', e.message);
        return [];
    }
}

export { NAVER_FINANCE_URL };
