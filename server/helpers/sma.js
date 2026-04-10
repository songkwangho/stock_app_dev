// SMA5/SMA20 helper — 도메인 간 의존성을 피하기 위해 helpers/ 수준에 둔다.
// 포트폴리오 라우터(holding_opinion 런타임 계산)와 분석 도메인 모두 자유롭게 import 가능.
// sma_available은 sma5 !== null (히스토리 5일 이상 보유)로 판단한다.
export function computeSMA(db, code) {
    const history = db.prepare(
        'SELECT price FROM stock_history WHERE code = ? ORDER BY date DESC LIMIT 20'
    ).all(code);
    let sma5 = null, sma20 = null;
    if (history.length >= 5) sma5 = Math.round(history.slice(0, 5).reduce((s, r) => s + r.price, 0) / 5);
    if (history.length >= 20) sma20 = Math.round(history.slice(0, 20).reduce((s, r) => s + r.price, 0) / 20);
    return { sma5, sma20 };
}
