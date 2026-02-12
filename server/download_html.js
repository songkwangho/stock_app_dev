import axios from 'axios';
import fs from 'fs';

const code = '005930';
const url = `https://finance.naver.com/item/main.naver?code=${code}`;

async function download() {
    try {
        const { data } = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        const html = new TextDecoder('euc-kr').decode(data);
        fs.writeFileSync('naver_finance_005930.html', html);
        console.log('Saved to naver_finance_005930.html');
    } catch (e) {
        console.error(e);
    }
}

download();
