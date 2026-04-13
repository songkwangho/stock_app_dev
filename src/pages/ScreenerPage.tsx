import { useState } from 'react';
import { RefreshCw, Search, HelpCircle } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import type { Stock, StockSummary } from '../types/stock';

interface ScreenerPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

interface Preset {
  name: string;
  description: string;
  summary: string;
  emoji: string;
  filters: Record<string, string | number>;
  caveat?: string; // 프리셋 사용 시 사용자가 알아야 할 함정
}

const PRESETS: Preset[] = [
  {
    name: '저평가 우량주',
    description: '싸면서 잘 버는 기업',
    summary: 'PER < 15 + ROE > 10%',
    emoji: '💎',
    filters: { perMax: 15, roeMin: 10 },
    caveat: '⚠️ 금융·통신·자동차 업종이 많이 포함될 수 있어요. 이 업종은 원래 PER이 낮은 편이라 단순 저평가로 보기 어려워요.',
  },
  {
    name: '안전한 자산주',
    description: '자산 대비 저평가된 기업',
    summary: 'PBR ≤ 1',
    emoji: '🛡️',
    filters: { pbrMax: 1 },
    caveat: '⚠️ 자산 대비 저평가지만 사업이 부진한 경우도 많아요. ROE를 함께 확인해보세요.',
  },
  {
    name: '고수익 성장주',
    description: '돈을 아주 잘 버는 기업',
    summary: 'ROE ≥ 20%',
    emoji: '🚀',
    filters: { roeMin: 20 },
    caveat: '⚠️ 일시적 호황으로 ROE가 높을 수 있어요. 최근 분기 실적도 함께 봐주세요.',
  },
  {
    name: '소액 투자',
    description: '적은 금액으로 시작',
    summary: '주가 ≤ 10만원',
    emoji: '💰',
    filters: { priceMax: 100000 },
    caveat: '⚠️ 주가가 낮다고 좋은 종목은 아니에요. 시가총액과 사업 내용을 꼭 확인하세요.',
  },
];

const CATEGORIES = [
  '기술/IT', '바이오/헬스케어', '자동차/모빌리티', '에너지/소재',
  '금융/지주', '소비재/서비스', '엔터테인먼트/미디어', '조선/기계/방산',
];

const ScreenerPage = ({ onDetailClick }: ScreenerPageProps) => {
  const [results, setResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState({
    perMin: '', perMax: '', pbrMin: '', pbrMax: '',
    roeMin: '', priceMin: '', priceMax: '', category: '',
  });

  const handleSearch = async (filterOverride?: Record<string, string | number>) => {
    setLoading(true);
    setSearched(true);
    try {
      const params = filterOverride || Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const data = await stockApi.screener(params);
      setResults(data);
    } catch (error) {
      console.error('Screener failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset.name);
    setFilters({ perMin: '', perMax: '', pbrMin: '', pbrMax: '', roeMin: '', priceMin: '', priceMax: '', category: '' });
    handleSearch(preset.filters);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">종목 스크리너</h2>
        <p className="text-slate-500 text-sm">원하는 조건에 맞는 종목을 쉽게 찾아보세요. 아래 추천 필터를 눌러보세요!</p>
      </div>

      {/* Beginner Info Banner */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300 leading-relaxed flex items-start space-x-2">
        <HelpCircle size={14} className="mt-0.5 shrink-0" />
        <span>PER = 주가 ÷ 주당이익 (낮으면 저평가), PBR = 주가 ÷ 주당자산 (1 이하면 자산 대비 저평가), ROE = 자기자본이익률 (높으면 돈을 잘 벌어요)</span>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PRESETS.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePreset(preset)}
            className={`p-5 rounded-2xl border text-left transition-all hover:scale-[1.02] ${
              activePreset === preset.name
                ? 'bg-blue-600/10 border-blue-500/40 ring-1 ring-blue-500/20'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-2xl mb-2 block">{preset.emoji}</span>
            <h4 className="text-sm font-bold mb-1">{preset.name}</h4>
            <p className="text-xs text-blue-400 font-mono mb-1">{preset.summary}</p>
            <p className="text-xs text-slate-500 leading-relaxed">→ {preset.description}</p>
          </button>
        ))}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center space-x-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors px-4 py-3"
        >
          <Search size={16} />
          <span>직접 조건 설정하기</span>
          <span className="text-sm text-slate-600 ml-2">{showAdvanced ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">PER 최소</label>
                <input type="number" placeholder="예: 5" value={filters.perMin}
                  onChange={(e) => setFilters({ ...filters, perMin: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">PER 최대</label>
                <input type="number" placeholder="예: 20" value={filters.perMax}
                  onChange={(e) => setFilters({ ...filters, perMax: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">PBR 최대</label>
                <input type="number" placeholder="예: 1.5" value={filters.pbrMax} step="0.1"
                  onChange={(e) => setFilters({ ...filters, pbrMax: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">ROE 최소 (%)</label>
                <input type="number" placeholder="예: 10" value={filters.roeMin}
                  onChange={(e) => setFilters({ ...filters, roeMin: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">최소 가격 (₩)</label>
                <input type="number" placeholder="예: 10000" value={filters.priceMin}
                  onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">최대 가격 (₩)</label>
                <input type="number" placeholder="예: 500000" value={filters.priceMax}
                  onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-bold">업종</label>
                <select value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500">
                  <option value="">전체 업종</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={() => { setActivePreset(null); handleSearch(); }}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-2xl text-sm transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
              <span>검색하기</span>
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center h-32 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} />
          <span>조건에 맞는 종목을 찾고 있어요...</span>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-slate-500">조건에 맞는 종목이 없어요. 조건을 조금 넓혀보세요.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-4">
          {/* 결과 상단 안내 — 초보자가 결과를 "정답"으로 오해하지 않도록 */}
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-300/90 leading-relaxed">
            <p className="font-bold mb-1">📌 아래 종목들은 조건에 맞는 참고 목록이에요</p>
            <p className="text-yellow-400/70">업종마다 정상 지표 범위가 달라 직접 확인이 필요해요. 투자 결정은 본인이 하세요.</p>
            {activePreset && (() => {
              const preset = PRESETS.find(p => p.name === activePreset);
              return preset?.caveat ? (
                <p className="mt-2 pt-2 border-t border-yellow-500/20 text-yellow-400/80">{preset.caveat}</p>
              ) : null;
            })()}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{results.length}개 종목을 찾았어요</p>
          </div>

          {/* 16차 5-4: 모바일(md 미만)은 카드 레이아웃, PC는 기존 테이블. 5컬럼 테이블이 모바일에서 가로 스크롤 강제하던 문제 해소 */}
          <div className="md:hidden space-y-3">
            {results.map(stock => (
              <button
                key={stock.code}
                onClick={() => onDetailClick(stock)}
                className="w-full text-left bg-slate-900/50 border border-slate-800 rounded-2xl p-4 hover:border-blue-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-white">{stock.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{stock.code} · {stock.category}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                    stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>
                    {stock.market_opinion || '중립적'}
                  </span>
                </div>
                <p className="text-lg font-black mb-2">₩{stock.price?.toLocaleString()}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-600">PER</p>
                    <p className={stock.per && stock.per < 15 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {stock.per ? `${stock.per}배` : '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">PBR</p>
                    <p className={stock.pbr && stock.pbr <= 1 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {stock.pbr ? `${stock.pbr}배` : '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">ROE</p>
                    <p className={stock.roe && stock.roe >= 15 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {stock.roe ? `${stock.roe}%` : '---'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:block bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">종목</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">현재가</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-slate-500 tracking-widest">PER (낮을수록 저평가)</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-slate-500 tracking-widest">PBR (1이하 저평가)</th>
                    <th className="text-right px-4 py-4 text-xs font-bold text-slate-500 tracking-widest">ROE (높을수록 우량)</th>
                    <th className="text-center px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">의견</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(stock => (
                    <tr
                      key={stock.code}
                      onClick={() => onDetailClick(stock)}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-white">{stock.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{stock.code} · {stock.category}</p>
                      </td>
                      <td className="text-right px-4 py-4 font-bold">₩{stock.price?.toLocaleString()}</td>
                      <td className="text-right px-4 py-4">
                        <span className={stock.per && stock.per < 15 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {stock.per ? `${stock.per}배` : '---'}
                        </span>
                      </td>
                      <td className="text-right px-4 py-4">
                        <span className={stock.pbr && stock.pbr <= 1 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {stock.pbr ? `${stock.pbr}배` : '---'}
                        </span>
                      </td>
                      <td className="text-right px-4 py-4">
                        <span className={stock.roe && stock.roe >= 15 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {stock.roe ? `${stock.roe}%` : '---'}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-xs font-bold px-4 py-3 rounded-lg ${
                          stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                          stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>
                          {stock.market_opinion || '중립적'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenerPage;
