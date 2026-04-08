import { Zap, ArrowRight, TrendingUp } from 'lucide-react';
import type { Recommendation, StockSummary } from '../types/stock';

interface RecommendedStockCardProps {
  stock: Recommendation;
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendedStockCard = ({ stock, onDetailClick }: RecommendedStockCardProps) => {
  const upside = stock.currentPrice && stock.fairPrice
    ? ((stock.fairPrice - stock.currentPrice) / stock.currentPrice * 100).toFixed(1)
    : null;

  return (
    <div
      onClick={() => onDetailClick(stock)}
      className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:bg-slate-900/80 hover:border-blue-500/30 transition-all group cursor-pointer flex flex-col"
    >
      {/* Header: Name + Score */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h4 className="font-bold text-base truncate group-hover:text-blue-400 transition-colors">{stock.name}</h4>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{stock.code}</p>
        </div>
        <div className="flex items-center space-x-1 bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ml-3">
          <Zap size={11} />
          <span>{stock.score}</span>
        </div>
      </div>

      {/* Reason */}
      <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2 flex-grow">
        {stock.reason}
      </p>

      {/* Price Row: 현재가 → 적정가 (상승여력) */}
      <div className="bg-slate-950/60 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-1">현재가</p>
            <p className="text-sm font-bold text-white">
              {stock.currentPrice != null ? `₩${stock.currentPrice.toLocaleString()}` : '---'}
            </p>
          </div>
          <div className="px-2">
            <ArrowRight size={14} className="text-slate-600" />
          </div>
          <div className="text-center flex-1">
            <p className="text-xs text-emerald-500/70 uppercase tracking-widest mb-1">
              {stock.targetPrice && stock.fairPrice === stock.targetPrice ? '적정가 (애널리스트)' : '적정가 (추정)'}
            </p>
            <p className="text-sm font-bold text-emerald-400">
              ₩{stock.fairPrice?.toLocaleString()}
            </p>
          </div>
        </div>
        {upside && (
          <div className="mt-2 pt-2 border-t border-slate-800/50 flex items-center justify-center space-x-1.5">
            <TrendingUp size={12} className="text-emerald-500" />
            <span className="text-xs font-bold text-emerald-400">+{upside}% 상승 여력 (앞으로 오를 수 있는 %)</span>
          </div>
        )}
      </div>

      {/* Footer: Source Badge + Opinion */}
      <div className="flex items-center justify-between flex-wrap gap-y-1">
        <div className="flex items-center space-x-1.5">
          {stock.source && (
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              stock.source === 'manual' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
            }`} title={stock.source === 'manual' ? '전문가가 직접 선정한 종목이에요. 투자 결정은 본인이 하세요.' : '10가지 지표로 자동 분석한 종목이에요. 과거 성과가 미래를 보장하지 않아요.'}>
              {stock.source === 'manual' ? '전문가 선정' : '알고리즘'}
            </span>
          )}
          {stock.market_opinion && (
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
              stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' :
              'bg-slate-500/10 text-slate-400'
            }`}>
              {stock.market_opinion}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-600 group-hover:text-blue-400 transition-colors font-semibold">
          상세 분석 →
        </span>
      </div>
    </div>
  );
};

export default RecommendedStockCard;
