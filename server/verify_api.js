import axios from 'axios';

const NAVER_FINANCE_URL = 'https://polling.finance.naver.com/api/realtime/get/stock/';

async function verifyAPI(code) {
    try {
        console.log(`Fetching data for ${code}...`);
        const response = await axios.get(`${NAVER_FINANCE_URL}${code}`);
        const stockData = response.data.datas[0];

        if (stockData) {
            console.log('API Verification Successful!');
            console.log('Stock Name:', stockData.nm);
            console.log('Current Price:', stockData.nv);
            console.log('Change Rate:', stockData.cr);
        } else {
            console.log('API returned empty data.');
        }
    } catch (error) {
        console.error('API Verification Failed:', error.message);
    }
}

verifyAPI('005930');
