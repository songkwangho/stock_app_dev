import pool, { query, withTransaction } from '../../db/connection.js';
import axios from 'axios';
import { getCached, setCache } from '../../helpers/cache.js';
import { NAVER_FINANCE_URL, mapToCategory } from '../../scrapers/naver.js';
import { calculateValuationScore, calculateTechnicalScore, calculateSupplyDemandScore, calculateTrendScore } from '../analysis/scoring.js';
import { generateAlerts } from '../alert/service.js';

// Neon 무료 플랜은 풀 5 제한 — 동시 종목 fetch가 5를 넘지 않도록 BATCH_SIZE를 3으로 낮춤.
// (한 종목 sync마다 stock_history/investor_history upsert로 트랜잭션 클라이언트 1개를 점유할 수 있음)
const BATCH_SIZE = 3;

// ===== Data Sync: all registered major stocks =====
export async function syncAllStocks() {
    const { rows: allStocks } = await query('SELECT code, name FROM stocks ORDER BY code');
    console.log(`Syncing ${allStocks.length} stocks...`);
    let synced = 0;
    for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map(s => getStockData(s.code, s.name).catch(e =>
                console.error(`Failed to sync ${s.name}:`, e.message)
            ))
        );
        synced += batch.length;
        if (synced % 15 === 0) console.log(`  ... ${synced}/${allStocks.length} synced`);
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

// 보조 유틸: pg numeric(string) → number, null 유지
function num(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}

// DB 스냅샷 fallback — API 실패 시 기존 데이터를 반환.
// market_opinion이 없으면 '중립적'으로 보정 (null이 프론트로 그대로 나가던 버그 수정).
async function buildFallback(code) {
    const { rows: stockRows } = await query('SELECT * FROM stocks WHERE code = $1', [code]);
    if (stockRows.length === 0) return null;
    const stock = stockRows[0];
    const { rows: historyRows } = await query(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 40',
        [code]
    );
    const { rows: analysisRows } = await query('SELECT * FROM stock_analysis WHERE code = $1', [code]);
    const analysisData = analysisRows[0];
    return {
        ...stock,
        per: num(stock.per),
        pbr: num(stock.pbr),
        roe: num(stock.roe),
        eps_current: num(stock.eps_current),
        eps_previous: num(stock.eps_previous),
        history: historyRows.map(h => ({
            date: h.date,
            price: num(h.price),
            open: num(h.open),
            high: num(h.high),
            low: num(h.low),
            volume: num(h.volume),
        })).reverse(),
        investorData: [],
        analysis: analysisData?.analysis,
        advice: analysisData?.advice,
        market_opinion: analysisData?.opinion || '중립적',
        tossUrl: analysisData?.toss_url,
    };
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
            const result = await buildFallback(code);
            if (result) setCache(code, result);
            return result;
        }

        // Save History (OHLCV) in transaction
        await withTransaction(async (client) => {
            for (const match of allMatches) {
                // match groups: [1]=date, [2]=open, [3]=high, [4]=low, [5]=close, [6]=volume
                await client.query(`
                    INSERT INTO stock_history (code, date, price, open, high, low, volume)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT(code, date) DO UPDATE SET
                        price = EXCLUDED.price, open = EXCLUDED.open,
                        high = EXCLUDED.high, low = EXCLUDED.low, volume = EXCLUDED.volume
                `, [code, match[1],
                    parseInt(match[5]), parseInt(match[2]),
                    parseInt(match[3]), parseInt(match[4]), parseInt(match[6])]);
            }
        });

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
                    await withTransaction(async (client) => {
                        for (const r of investorData) {
                            await client.query(`
                                INSERT INTO investor_history (code, date, institution, foreign_net, individual)
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT(code, date) DO UPDATE SET
                                    institution = EXCLUDED.institution,
                                    foreign_net = EXCLUDED.foreign_net,
                                    individual = EXCLUDED.individual
                            `, [code, r.date, r.institution, r.foreign, r.individual]);
                        }
                    });
                }
            } catch (investorError) {
                console.error(`Investor Parse Error for ${code}:`, investorError.message);
            }
        }

        // --- Process main page metrics ---
        let per = null, pbr = null, roe = null, targetPrice = null;
        let epsCurrent = null, epsPrevious = null;
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
                epsPrevious = (epsPrevMatch && epsPrevMatch[1].trim() !== '-') ? parseFloat(epsPrevMatch[1].replace(/,/g, '')) : null;
                epsCurrent = (epsCurMatch && epsCurMatch[1].trim() !== '-') ? parseFloat(epsCurMatch[1].replace(/,/g, '')) : null;

                console.log(`Scraped for ${code}: PER=${per}, PBR=${pbr}, ROE=${roe}, TP=${targetPrice}, EPS=${epsPrevious}→${epsCurrent}`);
            } catch (scrapingError) {
                console.error(`Scraping Error for ${code}:`, scrapingError.message);
            }
        }

        const latestMatch = allMatches[allMatches.length - 1];
        const latestPrice = parseInt(latestMatch[5]);

        // 16차 5-5: change/change_rate를 "0"으로 저장하던 것을 실제 계산으로 교체.
        // 최근 2거래일 종가 비교 (allMatches는 오름차순).
        let changeStr = '0';
        let changeRateStr = '0.00';
        if (allMatches.length >= 2) {
            const prevPrice = parseInt(allMatches[allMatches.length - 2][5]);
            const diff = latestPrice - prevPrice;
            const rate = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;
            changeStr = diff >= 0 ? `+${diff}` : `${diff}`;
            changeRateStr = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}`;
        }

        const { rows: historyRows } = await query(
            'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 40',
            [code]
        );
        const history = historyRows.map(h => ({
            date: h.date,
            price: num(h.price),
            open: num(h.open),
            high: num(h.high),
            low: num(h.low),
            volume: num(h.volume),
        }));

        const { rows: existingRows } = await query('SELECT name, category FROM stocks WHERE code = $1', [code]);
        const existing = existingRows[0];

        let industry = null;
        try {
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

        await query(`
            INSERT INTO stocks (code, name, price, change, change_rate, per, pbr, roe, target_price, category, eps_current, eps_previous, last_updated)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT(code) DO UPDATE SET
                price = EXCLUDED.price,
                name = EXCLUDED.name,
                per = EXCLUDED.per,
                pbr = EXCLUDED.pbr,
                roe = EXCLUDED.roe,
                target_price = EXCLUDED.target_price,
                category = EXCLUDED.category,
                eps_current = EXCLUDED.eps_current,
                eps_previous = EXCLUDED.eps_previous,
                last_updated = NOW()
        `, [code, nameToSave, latestPrice, changeStr, changeRateStr, per, pbr, roe, targetPrice, categoryToSave, epsCurrent, epsPrevious]);

        // Advanced Analysis Generation Logic
        const historyRev = [...history].reverse();
        const getSMA = (days) => {
            if (historyRev.length < days) return null;
            const slice = historyRev.slice(-days);
            return Math.round(slice.reduce((acc, cur) => acc + cur.price, 0) / days);
        };

        const sma5 = getSMA(5);
        const sma20 = getSMA(20);

        let analysis = '';
        let advice = '';
        let market_opinion = '중립적';
        let scoringBreakdown = null;

        // Always calculate MarketOpinion (10-point scoring) for all stocks
        {
            const valuation = await calculateValuationScore(pool, code, per, pbr, roe, latestPrice, targetPrice, epsCurrent, epsPrevious);
            const technical = await calculateTechnicalScore(pool, code);
            const supplyDemand = await calculateSupplyDemandScore(pool, code);
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
            // advice 문구는 앱스토어 심사 대비 중립/서술형으로 작성 (투자 권유로 해석되지 않도록).
            if (totalScore >= 7.0) {
                market_opinion = '긍정적';
                advice = `종합점수 ${totalScore}점으로 긍정적인 지표가 많아요. `;
                advice += valuation.total >= 2 ? '밸류에이션이 섹터 대비 낮은 편이며, ' : '';
                advice += technical.total >= 2 ? '기술적 지표도 우호적인 흐름이에요. ' : '';
                advice += supplyDemand.total >= 1.5 ? '외국인·기관 수급도 우호적이에요.' : '';
            } else if (totalScore >= 4.0) {
                market_opinion = '중립적';
                advice = `종합점수 ${totalScore}점으로 강한 방향성은 보이지 않아요. `;
                if (valuation.total < 1) advice += '밸류에이션 매력이 낮고, ';
                if (technical.total < 1) advice += '기술적 지표가 약세를 보이고 있어 ';
                advice += '지표를 직접 확인해보세요.';
            } else {
                market_opinion = '부정적';
                advice = `종합점수 ${totalScore}점으로 주의가 필요한 상태예요. `;
                if (valuation.total < 1) advice += '밸류에이션 부담이 있고, ';
                if (technical.total < 1) advice += '기술적 지표도 약세 흐름이며, ';
                if (supplyDemand.total < 0.5) advice += '수급도 비우호적이에요.';
            }
        }

        const tossUrl = `https://tossinvest.com/stocks/${code}/order`;

        // Generate alerts for significant events
        await generateAlerts(pool, code, nameToSave, latestPrice, sma5, targetPrice);

        // Save MarketOpinion to DB (공용, 비보유 기준)
        await query(`
            INSERT INTO stock_analysis (code, analysis, advice, opinion, toss_url, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT(code) DO UPDATE SET
                analysis = EXCLUDED.analysis,
                advice = EXCLUDED.advice,
                opinion = EXCLUDED.opinion,
                toss_url = EXCLUDED.toss_url,
                created_at = NOW()
        `, [code, analysis, advice, market_opinion, tossUrl]);

        const result = {
            code,
            name: nameToSave,
            price: latestPrice,
            change: changeStr,
            change_rate: changeRateStr,
            per, pbr, roe, targetPrice,
            category: categoryToSave,
            history: historyRev,
            investorData,
            analysis,
            advice,
            market_opinion,
            tossUrl,
            scoringBreakdown
        };
        setCache(code, result);
        return result;
    } catch (error) {
        console.error(`API Error for ${code}:`, error.message);
        const fallback = await buildFallback(code);
        if (fallback) setCache(code, fallback);
        return fallback;
    }
}
