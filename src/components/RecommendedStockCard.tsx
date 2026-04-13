import { useState } from 'react';
import { Zap, ArrowRight, TrendingUp } from 'lucide-react';
import type { Recommendation, StockSummary } from '../types/stock';

interface RecommendedStockCardProps {
  stock: Recommendation;
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendedStockCard = ({ stock, onDetailClick }: RecommendedStockCardProps) => {
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const upside = stock.currentPrice && stock.fairPrice
    ? ((stock.fairPrice - stock.currentPrice) / stock.currentPrice * 100).toFixed(1)
    : null;

  return (
    <div
      onClick={() => onDetailClick(stock)}
      className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:bg-slate-900/80 hover:border-blue-500/30 transition-all group cursor-pointer flex flex-col"
    >
      {/* Header: Name + Score
          algorithm 추천은 score 필드가 placeholder(50)라 의미가 없어 숨김.
          manual 추천만 편집자가 부여한 점수 그대로 표시. */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h4 className="font-bold text-base truncate group-hover:text-blue-400 transition-colors">{stock.name}</h4>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{stock.code}</p>
        </div>
        {stock.source === 'manual' && stock.score > 0 && (
          <div
            className="flex items-center space-x-1 bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ml-3 cursor-help"
            title="편집팀이 매긴 종목 추천 점수예요. 100점 만점으로, 높을수록 매력적이라고 판단한 종목이에요. (17차 5-4)"
          >
            <Zap size={11} />
            <span>{stock.score}</span>
            <span className="text-[10px] text-blue-300/70 ml-0.5">?</span>
          </div>
        )}
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
          <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-1">
            <div className="flex items-center justify-center space-x-1.5">
              <TrendingUp size={12} className="text-emerald-500" />
              <span className="text-xs font-bold text-emerald-400">
                {stock.targetPrice && stock.fairPrice === stock.targetPrice
                  ? `애널리스트 목표가 대비 현재가 괴리 +${upside}%`
                  : `알고리즘 추정 적정가 대비 현재가 괴리 +${upside}%`}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 text-center leading-relaxed">
              ※ 이 수치는 실제 수익률이 아니에요.
              {stock.targetPrice && stock.fairPrice === stock.targetPrice
                ? ' 애널리스트 목표가는 통상 6~12개월 기준으로, 갱신 시점에 따라 현재 시세와 차이가 있을 수 있어요.'
                : ' 적정가는 데이터 수집 시점 기준이에요.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer: Source Badge + Opinion */}
      <div className="flex items-center justify-between flex-wrap gap-y-1">
        <div className="flex items-center space-x-1.5">
          {stock.source && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowSourceInfo(!showSourceInfo); }}
              className={`text-xs font-bold px-2 py-1 rounded-lg cursor-pointer ${
                stock.source === 'manual' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
              }`}
            >
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
      {showSourceInfo && (
        <div className="text-xs mt-1 p-3 bg-slate-950/50 rounded-lg leading-relaxed space-y-1.5">
          {stock.reason && <p className="text-slate-300">{stock.reason}</p>}
          <p className="text-slate-500">
            {stock.source === 'manual'
              ? '전문가가 직접 분석하여 선정한 종목이에요. 투자 결정은 본인이 하세요.'
              : '10가지 지표를 자동 분석한 결과예요. 과거 성과가 미래를 보장하지 않아요.'}
          </p>
        </div>
      )}
      <p className="text-xs text-slate-600 mt-2 leading-relaxed">투자 참고용이며 투자 권유가 아니에요. 실제 매수는 증권사 앱에서 직접 진행해 주세요.</p>
    </div>
  );
};

export default RecommendedStockCard;
