import pg from 'pg';

// PostgreSQL 풀 — Neon 무료 플랜 연결 수 제한(~20)을 고려해 max 5로 제한.
// 로컬 개발 시 DATABASE_URL 미설정이면 localhost:5432 기본 접속 시도.
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('Unexpected PG pool error:', err);
});

// 편의 래퍼: 단일 쿼리 실행 (풀에서 connection 자동 반환).
// 사용: const { rows } = await query('SELECT * FROM stocks WHERE code = $1', [code]);
export function query(text, params) {
    return pool.query(text, params);
}

// 트랜잭션 래퍼: fn(client) 내부에서 client.query(...) 사용.
// BEGIN/COMMIT/ROLLBACK + release 자동 처리.
//
// 사용 예:
//   await withTransaction(async (client) => {
//       for (const row of rows) {
//           await client.query('INSERT INTO ... VALUES ($1, $2)', [row.a, row.b]);
//       }
//   });
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

console.log('PostgreSQL pool initialized:',
    process.env.DATABASE_URL ? 'DATABASE_URL set' : 'using pg defaults (localhost)');

export default pool;
