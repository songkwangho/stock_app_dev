import axios from 'axios';

const NAVER_FINANCE_URL = 'https://api.finance.naver.com/siseJson.naver';

async function verifyAPI(code) {
    try {
        console.log(`Fetching data for ${code}...`);
        const response = await axios.get(NAVER_FINANCE_URL, {
            params: {
                symbol: code,
                requestType: 1,
                startTime: '20250205',
                endTime: '20250205',
                timeframe: 'day'
            }
        });

        const rawData = response.data.trim();
        const cleanedData = rawData.replace(/\s+/g, '');
        const matches = cleanedData.match(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/);

        if (matches) {
            console.log('API Verification Successful!');
            console.log('Stock Code:', code);
            console.log('Close Price:', matches[5]);
        } else {
            console.log('API returned unexpected format or empty data.');
            console.log('Response:', response.data);
        }
    } catch (error) {
        console.error('API Verification Failed:', error.message);
    }
}

verifyAPI('005930');
