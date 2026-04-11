// ===== 업종별 상위 기업 등록 (시가총액 기준) =====
const topStocks = [
    // 기술/IT (15종)
    { code: '005930', name: '삼성전자' },
    { code: '000660', name: 'SK하이닉스' },
    { code: '035420', name: 'NAVER' },
    { code: '035720', name: '카카오' },
    { code: '036570', name: '엔씨소프트' },
    { code: '263750', name: '펄어비스' },
    { code: '251270', name: '넷마블' },
    { code: '017670', name: 'SK텔레콤' },
    { code: '030200', name: 'KT' },
    { code: '032640', name: 'LG유플러스' },
    { code: '066570', name: 'LG전자' },
    { code: '009150', name: '삼성전기' },
    { code: '034730', name: 'SK' },
    { code: '000990', name: 'DB하이텍' },
    { code: '402340', name: 'SK스퀘어' },
    // 바이오/헬스케어 (11종)
    { code: '207940', name: '삼성바이오로직스' },
    { code: '068270', name: '셀트리온' },
    { code: '128940', name: '한미약품' },
    { code: '326030', name: 'SK바이오팜' },
    { code: '145020', name: '휴젤' },
    { code: '006280', name: '녹십자' },
    { code: '214370', name: '케어젠' },
    { code: '302440', name: 'SK바이오사이언스' },
    { code: '000100', name: '유한양행' },
    { code: '069620', name: '대웅제약' },
    { code: '009420', name: '한올바이오파마' },
    // 자동차/모빌리티 (8종)
    { code: '005380', name: '현대차' },
    { code: '000270', name: '기아' },
    { code: '012330', name: '현대모비스' },
    { code: '018880', name: '한온시스템' },
    { code: '161390', name: '한국타이어앤테크놀로지' },
    { code: '298050', name: '효성첨단소재' },
    { code: '204320', name: '만도' },
    { code: '011210', name: '현대위아' },
    // 에너지/소재 (14종)
    { code: '373220', name: 'LG에너지솔루션' },
    { code: '006400', name: '삼성SDI' },
    { code: '051910', name: 'LG화학' },
    { code: '005490', name: 'POSCO홀딩스' },
    { code: '096770', name: 'SK이노베이션' },
    { code: '003670', name: '포스코퓨처엠' },
    { code: '010130', name: '고려아연' },
    { code: '011170', name: '롯데케미칼' },
    { code: '006260', name: 'LS' },
    { code: '078930', name: 'GS' },
    { code: '036460', name: '한국가스공사' },
    { code: '015760', name: '한국전력' },
    { code: '267250', name: 'HD현대' },
    { code: '003410', name: '쌍용C&E' },
    // 금융/지주 (13종)
    { code: '105560', name: 'KB금융' },
    { code: '055550', name: '신한지주' },
    { code: '086790', name: '하나금융지주' },
    { code: '316140', name: '우리금융지주' },
    { code: '138930', name: 'BNK금융지주' },
    { code: '175330', name: 'JB금융지주' },
    { code: '024110', name: '기업은행' },
    { code: '000810', name: '삼성화재' },
    { code: '032830', name: '삼성생명' },
    { code: '005830', name: 'DB손해보험' },
    { code: '003540', name: '대신증권' },
    { code: '016360', name: '삼성증권' },
    { code: '006800', name: '미래에셋증권' },
    // 소비재/서비스 (15종)
    { code: '090430', name: '아모레퍼시픽' },
    { code: '139480', name: '이마트' },
    { code: '051900', name: 'LG생활건강' },
    { code: '004990', name: '롯데지주' },
    { code: '097950', name: 'CJ제일제당' },
    { code: '271560', name: '오리온' },
    { code: '007070', name: 'GS리테일' },
    { code: '282330', name: 'BGF리테일' },
    { code: '069960', name: '현대백화점' },
    { code: '023530', name: '롯데쇼핑' },
    { code: '192820', name: '코스맥스' },
    { code: '004170', name: '신세계' },
    { code: '030000', name: '제일기획' },
    { code: '034220', name: 'LG디스플레이' },
    { code: '003550', name: 'LG' },
    // 엔터테인먼트/미디어 (9종)
    { code: '352820', name: '하이브' },
    { code: '041510', name: 'SM' },
    { code: '122870', name: 'YG엔터테인먼트' },
    { code: '259960', name: '크래프톤' },
    { code: '293490', name: '카카오게임즈' },
    { code: '112040', name: '위메이드' },
    { code: '078340', name: '컴투스' },
    { code: '214320', name: '이노션' },
    { code: '030520', name: '한글과컴퓨터' },
    // 조선/기계/방산 (12종)
    { code: '329180', name: 'HD현대중공업' },
    { code: '010140', name: '삼성중공업' },
    { code: '009540', name: '한국조선해양' },
    { code: '042660', name: '한화오션' },
    { code: '012450', name: '한화에어로스페이스' },
    { code: '047810', name: '한국항공우주' },
    { code: '079550', name: 'LIG넥스원' },
    { code: '000120', name: 'CJ대한통운' },
    { code: '028050', name: '삼성엔지니어링' },
    { code: '000210', name: 'DL' },
    { code: '034020', name: '두산에너빌리티' },
    { code: '042670', name: '두산인프라코어' },
];

// Deduplicate by code
const majorStockMap = new Map();
topStocks.forEach(s => majorStockMap.set(s.code, s));
const majorStocks = Array.from(majorStockMap.values());

// Initial Recommendations (manual, 20 stocks)
const initialRecommendations = [
    { code: '005930', reason: '실적 턴어라운드 및 HBM 수요 기대', fairPrice: 85000, score: 92 },
    { code: '000660', reason: 'HBM 시장 독점적 지위 및 메모리 단가 상승', fairPrice: 210000, score: 95 },
    { code: '035420', reason: 'AI 검색 엔진 경쟁력 및 광고 수익 회복', fairPrice: 230000, score: 88 },
    { code: '035720', reason: '카카오톡 비즈니스 모델 고도화', fairPrice: 65000, score: 82 },
    { code: '005380', reason: '하이브리드/전기차 점유율 확대 및 고배당', fairPrice: 280000, score: 90 },
    { code: '000270', reason: '역대급 수익성 지속 및 주주환원 강화', fairPrice: 140000, score: 91 },
    { code: '373220', reason: '글로벌 수주 잔고 압도적 1위', fairPrice: 450000, score: 85 },
    { code: '006400', reason: '차세대 배터리 수익성 위주 성장', fairPrice: 420000, score: 84 },
    { code: '005490', reason: '리튬 사업 가치 가시화', fairPrice: 480000, score: 83 },
    { code: '207940', reason: '압도적인 CMO 생산 능력 및 수주', fairPrice: 1050000, score: 89 },
    { code: '068270', reason: '짐펜트라 등 신약 매출 본격화', fairPrice: 220000, score: 87 },
    { code: '105560', reason: '밸류업 프로그램 최대 수혜주', fairPrice: 95000, score: 93 },
    { code: '055550', reason: '안정적 배당 및 자사주 소각', fairPrice: 62000, score: 86 },
    { code: '090430', reason: '코스알엑스 실적 반영 및 서구권 매출 증대', fairPrice: 180000, score: 81 },
    { code: '139480', reason: '자회사 구조조정 및 본업 수익성 개선', fairPrice: 85000, score: 78 },
    { code: '051910', reason: '양극재 비중 확대에 따른 밸류에이션 재평가', fairPrice: 500000, score: 80 },
    { code: '096770', reason: 'SK E&S 합병에 따른 재무 건전성 확보', fairPrice: 140000, score: 79 },
    { code: '352820', reason: '위버스 플랫폼 수익화 및 아티스트 라인업 다변화', fairPrice: 250000, score: 83 },
    { code: '329180', reason: '조선 업황 슈퍼사이클 진입 및 선가 상승', fairPrice: 210000, score: 94 },
    { code: '012330', reason: '전동화 부품 매출 비중 확대', fairPrice: 270000, score: 84 },
];

// PostgreSQL 전환: server.js의 top-level await에서 호출되는 초기화 함수.
// 모듈 import 만으로는 부작용이 발생하지 않으며, 명시적으로 registerInitialData(pool)을 호출해야 한다.
//
// ON CONFLICT 동작 의도:
// - stocks: name만 upsert (다른 필드는 syncAllStocks가 갱신).
// - recommended_stocks:
//   - reason, score: 서버 재시작마다 코드 내 최신 값으로 덮어씌움 (운영자가 코드에서 관리).
//   - fair_price: 최초 등록 후 고정 (DB 값 유지, 시세 변동과 무관).
//   - source: 기존 값 우선 (algorithm으로 변경된 경우 보존).
export async function registerInitialData(pool) {
    // stocks 시드 — 한 번의 트랜잭션으로 묶어 idle connection 감소.
    {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const s of majorStocks) {
                await client.query(
                    'INSERT INTO stocks (code, name) VALUES ($1, $2) ON CONFLICT(code) DO NOTHING',
                    [s.code, s.name]
                );
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
    console.log(`Registered ${majorStocks.length} major stocks for tracking.`);

    // recommended_stocks 시드
    {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const r of initialRecommendations) {
                await client.query(`
                    INSERT INTO recommended_stocks (code, reason, fair_price, score, source)
                    VALUES ($1, $2, $3, $4, 'manual')
                    ON CONFLICT(code) DO UPDATE SET
                        reason = EXCLUDED.reason,
                        score = EXCLUDED.score,
                        source = COALESCE(recommended_stocks.source, EXCLUDED.source)
                `, [r.code, r.reason, r.fairPrice, r.score]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
    console.log(`Seeded ${initialRecommendations.length} initial recommendations.`);
}
