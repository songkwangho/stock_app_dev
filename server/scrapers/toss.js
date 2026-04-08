import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chartsDir = path.join(__dirname, '..', '..', 'public', 'charts');
if (!fs.existsSync(chartsDir)) {
    fs.mkdirSync(chartsDir, { recursive: true });
}

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        try {
            browserInstance = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
        } catch (e) {
            console.error('Puppeteer launch failed:', e.message);
            browserInstance = null;
            throw e;
        }
    }
    return browserInstance;
}

// Prevent Puppeteer cleanup errors from crashing the server
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('EBUSY') || msg.includes('lockfile') || msg.includes('puppeteer')) {
        console.error('Suppressed Puppeteer cleanup error:', msg);
    } else {
        console.error('Unhandled Rejection:', msg);
    }
});

export async function captureChart(code) {
    const outputPath = path.join(chartsDir, `${code}.png`);

    // Skip if captured recently (less than 1 hour old)
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 60 * 60 * 1000) return `/charts/${code}.png`;
    }

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 460 });

        await page.goto(`https://tossinvest.com/stocks/${code}/order`, {
            waitUntil: 'networkidle2',
            timeout: 20000
        });

        await page.waitForSelector('canvas, svg, [class*="chart"], [class*="Chart"]', { timeout: 10000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));

        await page.screenshot({ path: outputPath, fullPage: false });
        await page.close();

        console.log(`Chart captured for ${code}`);
        return `/charts/${code}.png`;
    } catch (error) {
        console.error(`Chart capture failed for ${code}:`, error.message);
        return fs.existsSync(outputPath) ? `/charts/${code}.png` : null;
    }
}
