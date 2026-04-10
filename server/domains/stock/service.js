import db from '../../db/connection.js';
import axios from 'axios';
import { getCached, setCache } from '../../helpers/cache.js';
import { NAVER_FINANCE_URL, mapToCategory } from '../../scrapers/naver.js';
import { captureChart } from '../../scrapers/toss.js';
import { calculateValuationScore, calculateTechnicalScore, calculateSupplyDemandScore, calculateTrendScore } from '../analysis/scoring.js';
import { generateAlerts } from '../alert/service.js';

// ===== Data Sync: all registered major stocks =====
export async function syncAllStocks() {
    const allStocks = db.prepare('SELECT code, name FROM stocks ORDER BY code').all();
    console.log(`Syncing ${allStocks.length} stocks...`);
    const BATCH_SIZE = 5;
    let synced = 0;
    for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map(s => getStockData(s.code, s.name).catch(e =>
                console.error(`Failed to sync ${s.name}:`, e.message)
            ))
        );
        synced += batch.length;
        if (synced % 25 === 0) console.log(`  ... ${synced}/${allStocks.length} synced`);
    }
    console.log(`Stock sync complete (${synced} stocks).`);
}

// Schedule: 매일 오전 8시 자동 업데이트
export function scheduleDaily8AM() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (now >= next8AM) next8AM.setDate(next8AM.getDate() + 1);
    const msUntil8AM = next8AM.getTime() - now.getTime();
    console.log(`Next data sync scheduled at ${next8AM.toLocaleString('ko-KR')} (in ${Math.round(msUntil8AM / 60000)}min)`);

    setTimeout(() => {
        syncAllStocks();
        // After first trigger, repeat every 24 hours
        setInterval(syncAllStocks, 24 * 60 * 60 * 1000);
    }, msUntil8AM);
}

// Helper function to fetch and store stock data (with cache)
export async function getStockData(code, fallbackName = null) {
    // Check cache first
    const cached = getCached(code);
    if (cached) return cached;

    try {
        // Fetch last 60 days to ensure we have enough for 40 business days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 65);
        const startTime = sixtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
        const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // Parallel fetch: price history + investor data + main page metrics
        const [response, investorResult, mainPageResult] = await Promise.allSettled([
            axios.get(NAVER_FINANCE_URL, {
                params: { symbol: code, requestType: 1, startTime, endTime, timeframe: 'day' },
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' }
            }),
            axios.get(`https://finance.naver.com/item/frgn.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }),
            axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
        ]);

        // --- Process price history ---
        const priceResponse = response.status === 'fulfilled' ? response.value : null;
        let allMatches = [];
        if (priceResponse) {
            const rawData = priceResponse.data.trim();
            const cleanedData = rawData.replace(/\s+/g, '');
            allMatches = [...cleanedData.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];
        }

        if (allMatches.length === 0) {
            const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
            const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
            const result = stock ? { ...stock, history: history.reverse() } : null;
            if (result) setCache(code, result);
            return result;
        }

        // Save History (OHLCV) in transaction
        const insertHistory = db.prepare(`
            INSERT INTO stock_history (code, date, price, open, high, low, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code, date) DO UPDATE SET
                price = excluded.price, open = excluded.open,
                high = excluded.high, low = excluded.low, volume = excluded.volume
        `);
        const transaction = db.transaction((matches) => {
            for (const match of matches) {
                // match groups: [1]=date, [2]=open, [3]=high, [4]=low, [5]=close, [6]=volume
                insertHistory.run(code, match[1],
                    parseInt(match[5]), parseInt(match[2]),
                    parseInt(match[3]), parseInt(match[4]), parseInt(match[6]));
            }
        });
        transaction(allMatches);

        // --- Process investor data ---
        let investorData = [];
        if (investorResult.status === 'fulfilled') {
            try {
                const investorHtml = new TextDecoder('euc-kr').decode(investorResult.value.data);
                const investorRegex = /<tr.*?>\s*<td.*?><span.*?>([\d.]{10})<\/span><\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>/g;
                let invMatch;
                const matches = [];
                while ((invMatch = investorRegex.exec(investorHtml)) !== null && matches.length < 20) {
                    const date = invMatch[1].replace(/\./g, '');
                    const instNet = parseInt(invMatch[4].replace(/,/g, ''));
                    const foreignNet = parseInt(invMatch[5].replace(/,/g, ''));
                    matches.push({
                        date,
                        institution: instNet,
                        foreign: foreignNet,
                        individual: -(instNet + foreignNet)
                    });
                }
                investorData = matches.reverse();

                // Persist investor data to investor_history
                if (investorData.length > 0) {
                    const insertInvestor = db.prepare(`
                        INSERT INTO investor_history (code, date, institution, foreign_net, individual)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(code, date) DO UPDATE SET
                            institution = excluded.institution,
                            foreign_net = excluded.foreign_net,
                            individual = excluded.individual
                    `);
                    const investorTx = db.transaction((rows) => {
                        for (const r of rows) {
                            insertInvestor.run(code, r.date, r.institution, r.foreign, r.individual);
                        }
                    });
                    investorTx(investorData);
                }
            } catch (investorError) {
                console.error(`Investor Parse Error for ${code}:`, investorError.message);
            }
        }

        // --- Process main page metrics ---
        let per = null, pbr = null, roe = null, targetPrice = null;
        let html = '';
        if (mainPageResult.status === 'fulfilled') {
            try {
                const buffer = mainPageResult.value.data;
                const tempStr = buffer.toString('ascii');
                let charset = 'euc-kr';

                const metaMatch = tempStr.match(/<meta.*?charset=["']?([\w-]+)["']?/i);
                if (metaMatch) {
                    charset = metaMatch[1].toLowerCase();
                } else {
                    const contentType = mainPageResult.value.headers['content-type'];
                    if (contentType && contentType.includes('charset=')) {
                        charset = contentType.split('charset=')[1].trim().toLowerCase();
                    }
                }

                html = new TextDecoder(charset).decode(buffer);
                // If decoded text contains replacement characters, retry with euc-kr
                if (html.includes('\uFFFD')) {
                    html = new TextDecoder('euc-kr').decode(buffer);
                }

                const perMatch = html.match(/<em id="_per">([\d.]+)<\/em>/);
                const pbrMatch = html.match(/<em id="_pbr">([\d.]+)<\/em>/);
                const tpMatch = html.match(/class="rwidth"[\s\S]*?<span class="bar">l<\/span>[\s\S]*?<em>([\d,]+)<\/em>/);

                per = perMatch ? parseFloat(perMatch[1]) : null;
                pbr = pbrMatch ? parseFloat(pbrMatch[1]) : null;
                targetPrice = tpMatch ? parseInt(tpMatch[1].replace(/,/g, '')) : null;

                const roeRegex = /th_cop_anal13(?:[\s\S]*?<td.*?>){4}\s*([\d.-]+)/;
                const roeMatch = html.match(roeRegex);
                roe = (roeMatch && roeMatch[1] !== '-') ? parseFloat(roeMatch[1]) : null;

                // EPS extraction: 3rd td = previous year, 4th td = current/estimate year
                const epsPrevRegex = /th_cop_anal17(?:[\s\S]*?<td.*?>){3}\s*([\d,.-]+)/;
                const epsCurRegex = /th_cop_anal17(?:[\s\S]*?<td.*?>){4}\s*([\d,.-]+)/;
                const epsPrevMatch = html.match(epsPrevRegex);
                const epsCurMatch = html.match(epsCurRegex);
                var epsPrevious = (epsPrevMatch && epsPrevMatch[1].trim() !== '-') ? parseFloat(epsPrevMatch[1].replace(/,/g, '')) : null;
                var epsCurrent = (epsCurMatch && epsCurMatch[1].trim() !== '-') ? parseFloat(epsCurMatch[1].replace(/,/g, '')) : null;

                console.log(`Scraped for ${code}: PER=${per}, PBR=${pbr}, ROE=${roe}, TP=${targetPrice}, EPS=${epsPrevious}→${epsCurrent}`);
            } catch (scrapingError) {
                console.error(`Scraping Error for ${code}:`, scrapingError.message);
            }
        }

        const latestMatch = allMatches[allMatches.length - 1];
        const latestPrice = parseInt(latestMatch[5]);

        const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);

        const existing = db.prepare('SELECT name, category FROM stocks WHERE code = ?').get(code);

        let industry = null;
        try {
            // Updated industry regex: more flexible with attributes
            const indMatch = html.match(/type=upjong&no=\d+["'][^>]*>([^<]+)<\/a>/);
            if (indMatch) industry = indMatch[1].trim();
            console.log(`Detected industry for ${code}: ${industry}`);
        } catch (e) {
            console.error(`Industry Scrape Error for ${code}:`, e.message);
        }

        const categoryToSave = mapToCategory(industry);

        // Extract name from HTML title tag (most reliable source)
        let scrapedName = null;
        const nameMatch = html?.match(/<title>(.*?) : /);
        if (nameMatch) {
            scrapedName = nameMatch[1].trim();
        }

        let nameToSave = code;
        if (scrapedName) {
            // Prefer freshly scraped name (avoids stale garbled data)
            nameToSave = scrapedName;
        } else if (fallbackName) {
            nameToSave = fallbackName;
        } else if (existing && existing.name && existing.name !== code) {
            nameToSave = existing.name;
        }

        db.prepare(`
            INSERT INTO stocks (code, name, price, change, change_rate, per, pbr, roe, target_price, category, eps_current, eps_previous, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                price = excluded.price,
                name = excluded.name,
                per = excluded.per,
                pbr = excluded.pbr,
                roe = excluded.roe,
                target_price = excluded.target_price,
                category = excluded.category,
                eps_current = excluded.eps_current,
                eps_previous = excluded.eps_previous,
                last_updated = CURRENT_TIMESTAMP
        `).run(code, nameToSave, latestPrice, "0", "0.00", per, pbr, roe, targetPrice, categoryToSave, epsCurrent || null, epsPrevious || null);

        // Advanced Analysis Generation Logic
        const historyRev = history.reverse();
        const getSMA = (days) => {
            if (historyRev.length < days) return null;
            const slice = historyRev.slice(-days);
            return Math.round(slice.reduce((acc, cur) => acc + cur.price, 0) / days);
        };

        const sma5 = getSMA(5);
        const sma20 = getSMA(20);

        let analysis = '';
        let advice = '';
        let market_opinion = '중립적'; // MarketOpinion: always calculated via 10-point scoring
        let scoringBreakdown = null;

        // Always calculate MarketOpinion (10-point scoring) for all stocks
        {
            const valuation = calculateValuationScore(db, code, per, pbr, roe, latestPrice, targetPrice, epsCurrent, epsPrevious);
            const technical = calculateTechnicalScore(db, code);
            const supplyDemand = calculateSupplyDemandScore(db, code);
            const trend = calculateTrendScore(latestPrice, sma5, sma20);

            const totalScore = parseFloat((valuation.total + technical.total + supplyDemand.total + trend.total).toFixed(2));
            scoringBreakdown = {
                valuation: valuation.total,
                technical: technical.total,
                supplyDemand: supplyDemand.total,
                trend: trend.total,
                total: totalScore,
                per_negative: per !== null && per !== undefined && per < 0,
                low_confidence: valuation.detail?.low_confidence || false,
                detail: {
                    valuation: valuation.detail,
                    technical: technical.detail,
                    supplyDemand: supplyDemand.detail,
                    trend: trend.detail
                }
            };

            const isBullish = sma5 && sma20 && sma5 > sma20;
            const alignment = isBullish ? '정배열' : '역배열/혼조';
            const distance = sma5 ? Math.abs((latestPrice - sma5) / sma5 * 100).toFixed(1) : 0;
            const trendDir = latestPrice > sma5 ? '위' : '아래';

            analysis = `현재 주가는 5일선(${sma5?.toLocaleString() || '-'}원) ${trendDir}에 위치하고 있으며, 이평선은 ${alignment} 상태입니다. `;
            analysis += `이격도 ${distance}%(${parseFloat(distance) > 5 ? '과열' : '안정'}). `;
            analysis += `PER ${per || '-'}, PBR ${pbr || '-'}, ROE ${roe || '-'}%. `;
            analysis += `[종합점수 ${totalScore}/10] 밸류에이션 ${valuation.total}/3, 기술지표 ${technical.total}/3, 수급 ${supplyDemand.total}/2, 추세 ${trend.total}/2.`;

            // 임시 임계값 — Phase 4 백테스팅 후 데이터 기반 최적화 예정
            if (totalScore >= 7.0) {
                market_opinion = '긍정적';
                advice = `종합점수 ${totalScore}점으로 매수에 유리한 조건입니다. `;
                advice += valuation.total >= 2 ? '밸류에이션이 섹터 대비 저평가 상태이며, ' : '';
                advice += technical.total >= 2 ? '기술적 지표도 매수를 지지합니다. ' : '';
                advice += supplyDemand.total >= 1.5 ? '외국인/기관의 연속 순매수도 긍정적입니다.' : '';
            } else if (totalScore >= 4.0) {
                market_opinion = '중립적';
                advice = `종합점수 ${totalScore}점으로 적극적 매수보다는 관망이 적절합니다. `;
                if (valuation.total < 1) advice += '밸류에이션 매력이 부족하거나 ';
                if (technical.total < 1) advice += '기술적 지표가 약세를 보이고 있어 ';
                advice += '분할매수 관점에서 접근을 권장합니다.';
            } else {
                market_opinion = '부정적';
                advice = `종합점수 ${totalScore}점으로 보수적 접근이 필요합니다. `;
                if (valuation.total < 1) advice += '밸류에이션 부담이 크고, ';
                if (technical.total < 1) advice += '기술적 지표가 주의 신호를 보내고 있으며, ';
                if (supplyDemand.total < 0.5) advice += '수급도 비우호적입니다.';
            }
        }

        const tossUrl = `https://tossinvest.com/stocks/${code}/order`;

        // Capture chart in background (don't block response)
        const chartPath = `/charts/${code}.png`;
        captureChart(code).catch(e => console.error(`Background chart capture error for ${code}:`, e.message));

        console.log(`Saving analysis for ${code} with chartPath: ${chartPath}`);

        // Generate alerts for significant events
        generateAlerts(db, code, nameToSave, latestPrice, sma5, targetPrice, market_opinion);

        // Save MarketOpinion to DB (공용, 비보유 기준)
        db.prepare(`
            INSERT INTO stock_analysis (code, analysis, advice, opinion, toss_url, chart_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                analysis = excluded.analysis,
                advice = excluded.advice,
                opinion = excluded.opinion,
                toss_url = excluded.toss_url,
                chart_path = excluded.chart_path,
                created_at = CURRENT_TIMESTAMP
        `).run(code, analysis, advice, market_opinion, tossUrl, chartPath);

        const result = {
            code,
            name: nameToSave,
            price: latestPrice,
            change: "0",
            change_rate: "0.00",
            per, pbr, roe, targetPrice,
            history: historyRev,
            investorData,
            analysis,
            advice,
            market_opinion,
            tossUrl,
            chartPath,
            scoringBreakdown
        };
        setCache(code, result);
        return result;
    } catch (error) {
        console.error(`API Error for ${code}:`, error.message);
        const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code);
        const history = db.prepare('SELECT date, price, open, high, low, volume FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 40').all(code);
        const analysisData = db.prepare('SELECT * FROM stock_analysis WHERE code = ?').get(code);

        const fallback = stock ? {
            ...stock,
            history: history.reverse(),
            investorData: [],
            analysis: analysisData?.analysis,
            advice: analysisData?.advice,
            market_opinion: analysisData?.opinion,
            tossUrl: analysisData?.toss_url,
            chartPath: analysisData?.chart_path
        } : null;
        if (fallback) setCache(code, fallback);
        return fallback;
    }
}
