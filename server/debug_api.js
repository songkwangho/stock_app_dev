
import axios from 'axios';
import Database from 'better-sqlite3';

const code = '000660'; // SK Hynix
const NAVER_FINANCE_URL = 'https://api.finance.naver.com/siseJson.naver';

async function test() {
    console.log(`Testing for ${code}...`);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 65);
    const startTime = sixtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
    const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const response = await axios.get(NAVER_FINANCE_URL, {
        params: {
            symbol: code,
            requestType: 1,
            startTime: startTime,
            endTime: endTime,
            timeframe: 'day'
        }
    });

    const rawData = response.data.trim();
    const cleanedData = rawData.replace(/\s+/g, '');
    console.log('Raw sample:', rawData.substring(0, 200));

    const regex = /\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g;
    const allMatches = [...cleanedData.matchAll(regex)];

    if (allMatches.length > 0) {
        const last = allMatches[allMatches.length - 1];
        console.log('Last row match:', last[0]);
        console.log('Map: 1:Date, 2:Open, 3:High, 4:Low, 5:Close, 6:Vol, 7:Foreign');
        console.log(`Price parsed (match[5]): ${last[5]}`);
        console.log(`Volume parsed (match[6]): ${last[6]}`);

        // Also test scraping target price
        try {
            const pageResponse = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const html = new TextDecoder('euc-kr').decode(pageResponse.data);
            const tpMatch = html.match(/class="rwidth"[\s\S]*?<span class="bar">l<\/span>[\s\S]*?<em>([\d,]+)<\/em>/);
            const targetPrice = tpMatch ? parseInt(tpMatch[1].replace(/,/g, '')) : null;
            console.log(`Scraped Target Price (Consensus): ${targetPrice}`);
        } catch (e) {
            console.error('Scraping error:', e.message);
        }
    }

    test();
