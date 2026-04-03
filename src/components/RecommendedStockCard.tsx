import { Zap, ChevronRight } from 'lucide-react';
import type { Recommendation, StockSummary } from '../types/stock';

interface RecommendedStockCardProps {
  stock: Recommendation;
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendedStockCard = ({ stock, onDetailClick }: RecommendedStockCardProps) => (
  <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:bg-slate-900 transition-all group cursor-pointer">
    <div className="flex justify-between items-start mb-4">
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded uppercase">{stock.category}</span>
          <h4 className="font-bold text-lg">{stock.name}</h4>
        </div>
        <p className="text-xs text-slate-500 font-mono tracking-wider">{stock.code}</p>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <div className="flex items-center space-x-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded-lg text-xs font-bold">
          <Zap size={12} />
          <span>{stock.score}점</span>
        </div>
        {stock.opinion && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stock.opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
            stock.opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
            }`}>
            {stock.opinion}
          </span>
        )}
      </div>
    </div>
    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
      {stock.reason}
    </p>
    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800/50">
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">현재가</p>
        <p className="text-sm font-bold text-white">₩{(stock.currentPrice !== undefined && stock.currentPrice !== null) ? stock.currentPrice.toLocaleString() : '---'}</p>
      </div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">AI 추천 적정가</p>
        <p className="text-sm font-bold text-emerald-400">₩{stock.fairPrice?.toLocaleString()}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDetailClick(stock);
        }}
        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 text-xs font-semibold"
      >
        <span>상세 분석</span>
        <ChevronRight size={14} />
      </button>
    </div>
  </div>
);

export default RecommendedStockCard;
