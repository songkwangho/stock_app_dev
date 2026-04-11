// PostgreSQL 동적 플레이스홀더 빌더 — screener, PUT /api/holdings 등에서 공통 사용.
// SQLite는 '?' 무순서, PostgreSQL은 '$1, $2, ...' 순서가 중요하므로 인덱스를 추적해야 한다.

// 부분 UPDATE SET 절 생성.
//   buildSetClause({ avg_price: 50000, quantity: 10 })
//   → { clause: 'avg_price = $1, quantity = $2', params: [50000, 10], nextIndex: 3 }
//
// startIndex를 지정하면 WHERE 절 파라미터와 이어 붙일 때 사용.
//   buildSetClause({ avg_price: 50000 }, 1)
//   → { clause: 'avg_price = $1', params: [50000], nextIndex: 2 }
export function buildSetClause(fields, startIndex = 1) {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    const params = entries.map(([, v]) => v);
    const clause = entries.map(([k], i) => `${k} = $${startIndex + i}`).join(', ');
    return { clause, params, nextIndex: startIndex + entries.length };
}

// WHERE 조건들을 AND로 결합 + 플레이스홀더 번호 부여.
//   buildWhereClause([
//     { sql: 's.per > ', value: 10 },
//     { sql: 's.pbr < ', value: 2 },
//   ], 3)
//   → { clause: 's.per > $3 AND s.pbr < $4', params: [10, 2], nextIndex: 5 }
export function buildWhereClause(conditions, startIndex = 1) {
    const active = conditions.filter(c => c.value !== undefined && c.value !== null && c.value !== '');
    const params = active.map(c => c.value);
    const clause = active.map((c, i) => `${c.sql}$${startIndex + i}`).join(' AND ');
    return { clause, params, nextIndex: startIndex + active.length };
}
