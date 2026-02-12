import fs from 'fs';

const html = fs.readFileSync('naver_finance_investor_005930.html', 'utf-8');
const lines = html.split('\n');

lines.forEach((line, i) => {
    if (line.includes('class="type2"')) {
        console.log(`TYPE2 at line ${i + 1}`);
    }
    if (line.includes('기관')) {
        console.log(`기관 at line ${i + 1}`);
    }
    if (line.includes('외국인')) {
        console.log(`외국인 at line ${i + 1}`);
    }
});
