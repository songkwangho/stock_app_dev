/**
 * backfill-history.js — 97종목 × 3년치 stock_history 적재 스크립트 (Phase 4 선행).
 *
 * 사용 예:
 *   DATABASE_URL=postgres://... node scripts/backfill-history.js              # 전체 진행
 *   DATABASE_URL=postgres://... node scripts/backfill-history.js --days 365   # 1년만
 *   DATABASE_URL=postgres://... node scripts/backfill-history.js --resume     # 체크포인트에서 이어 받기
 *
 * 설계 메모:
 * - 네이버 증권 fchart API는 한 번에 수년치 조회 가능. 종목당 1회 호출로 끝냄.
 * - 종목 간 1초 딜레이로 rate limit 회피 (97 × 1s = ~1.6분).
 * - 하루 20~30종목 분할 권장 — `--limit N --offset M`으로 배치 가능.
 * - 체크포인트: `scripts/.backfill-state.json`에 완료된 code 배열 저장.
 *   실패 시 재실행하면 해당 종목부터 이어받음 (--resume).
 * - DB 쓰기는 종목 단위 withTransaction으로 원자성 보장.
 *
 * 주의:
 * - DATABASE_URL 환경변수 필수 (.env 또는 쉘에서 export).
 * - 실제 실행 전 Neon 무료 플랜 저장 용량(0.5GB) 여유 확인.
 *   97종목 × 750거래일 ≈ 72,750행 × 80B ≈ 6MB → 안전.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import pool, { withTransaction } from '../server/db/connection.js';
import { NAVER_FINANCE_URL } from '../server/scrapers/naver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '.backfill-state.json');

function parseArgs() {
    const args = process.argv.slice(2);
    const out = { days: 365 * 3, resume: false, limit: null, offset: 0 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--days') out.days = parseInt(args[++i], 10);
        else if (args[i] === '--resume') out.resume = true;
        else if (args[i] === '--limit') out.limit = parseInt(args[++i], 10);
        else if (args[i] === '--offset') out.offset = parseInt(args[++i], 10);
    }
    return out;
}

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
        return { completed: [] };
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function toYYYYMMDD(date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchHistory(code, days) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    const res = await axios.get(NAVER_FINANCE_URL, {
        params: { symbol: code, requestType: 1, startTime: toYYYYMMDD(start), endTime: toYYYYMMDD(new Date()), timeframe: 'day' },
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' },
        timeout: 30000,
    });
    const cleaned = res.data.trim().replace(/\s+/g, '');
    return [...cleaned.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];
}

async function upsertHistory(code, matches) {
    if (matches.length === 0) return 0;
    await withTransaction(async (client) => {
        for (const m of matches) {
            // match groups: [1]=date, [2]=open, [3]=high, [4]=low, [5]=close, [6]=volume
            await client.query(`
                INSERT INTO stock_history (code, date, price, open, high, low, volume)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT(code, date) DO UPDATE SET
                    price = EXCLUDED.price, open = EXCLUDED.open,
                    high = EXCLUDED.high, low = EXCLUDED.low, volume = EXCLUDED.volume
            `, [code, m[1], parseInt(m[5]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[6])]);
        }
    });
    return matches.length;
}

async function main() {
    const args = parseArgs();
    const state = args.resume ? loadState() : { completed: [] };
    const completed = new Set(state.completed);

    const { rows: allStocks } = await pool.query('SELECT code, name FROM stocks ORDER BY code');
    let targets = allStocks.filter(s => !completed.has(s.code));
    if (args.offset) targets = targets.slice(args.offset);
    if (args.limit) targets = targets.slice(0, args.limit);

    console.log(`Backfill: ${targets.length} stocks (${args.days} days each) — completed=${completed.size}, target offset=${args.offset}, limit=${args.limit ?? 'all'}`);

    let totalRows = 0;
    let i = 0;
    for (const s of targets) {
        i++;
        try {
            const matches = await fetchHistory(s.code, args.days);
            const rows = await upsertHistory(s.code, matches);
            totalRows += rows;
            completed.add(s.code);
            saveState({ completed: [...completed] });
            console.log(`  [${i}/${targets.length}] ${s.name} (${s.code}): ${rows} rows`);
        } catch (e) {
            console.error(`  [${i}/${targets.length}] ${s.name} (${s.code}) FAILED:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1000)); // rate limit
    }

    console.log(`Done. Total rows upserted: ${totalRows}. State saved to ${STATE_FILE}`);
    await pool.end();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
