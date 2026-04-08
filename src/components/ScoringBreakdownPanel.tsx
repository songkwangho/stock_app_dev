import type { ScoringBreakdown } from '../types/stock';

interface ScoringBreakdownPanelProps {
  breakdown: ScoringBreakdown;
}

const CATEGORY_LABELS: { key: string; label: string; max: number; descFn: (detail: ScoringBreakdown['detail']) => string }[] = [
  {
    key: 'valuation', label: '밸류에이션', max: 3,
    descFn: (d) => {
      if (!d?.valuation) return '데이터 부족';
      if (d.valuation.perScore >= 0.7) return '업종 평균보다 저렴해요';
      if (d.valuation.perScore >= 0.4) return '업종 평균 수준이에요';
      return '업종 대비 비싼 편이에요';
    }
  },
  {
    key: 'technical', label: '기술지표', max: 3,
    descFn: (d) => {
      if (!d?.technical) return '데이터 부족';
      if (d.technical.rsiScore >= 0.6) return 'RSI가 매수 구간이에요';
      if (d.technical.macdScore >= 0.6) return 'MACD가 상승 신호예요';
      return '뚜렷한 기술적 신호가 없어요';
    }
  },
  {
    key: 'supplyDemand', label: '수급', max: 2,
    descFn: (d) => {
      if (!d?.supplyDemand) return '데이터 부족';
      const fc = d.supplyDemand.foreignConsecutive || 0;
      const ic = d.supplyDemand.instConsecutive || 0;
      if (fc >= 3 && ic >= 3) return `외국인 ${fc}일, 기관 ${ic}일 연속 매수`;
      if (fc >= 3) return `외국인이 ${fc}일 연속 샀어요`;
      if (ic >= 3) return `기관이 ${ic}일 연속 샀어요`;
      if (fc >= 1 || ic >= 1) return '소규모 매수세가 있어요';
      return '뚜렷한 수급 신호가 없어요';
    }
  },
  {
    key: 'trend', label: '추세', max: 2,
    descFn: (d) => d?.trend?.reason || '추세 데이터 부족'
  },
];

const ScoringBreakdownPanel = ({ breakdown }: ScoringBreakdownPanelProps) => {
  const { total, per_negative, low_confidence } = breakdown;

  const scoreColor = total >= 7 ? 'text-emerald-400' : total >= 4 ? 'text-blue-400' : 'text-red-400';
  const scoreLabel = total >= 7 ? '긍정적' : total >= 4 ? '중립적' : '부정적';

  return (
    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">종합점수</p>
        <div className="flex items-center space-x-2">
          <span className={`text-2xl font-black ${scoreColor}`}>{total}</span>
          <span className="text-sm text-slate-500">/10</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            total >= 7 ? 'bg-emerald-500/10 text-emerald-400' :
            total >= 4 ? 'bg-blue-500/10 text-blue-400' :
            'bg-red-500/10 text-red-400'
          }`}>{scoreLabel}</span>
        </div>
      </div>

      {/* Score Bars */}
      <div className="space-y-3">
        {CATEGORY_LABELS.map(({ key, label, max, descFn }) => {
          const value = breakdown[key as keyof ScoringBreakdown] as number;
          const pct = Math.min(100, (value / max) * 100);
          const barColor = pct >= 66 ? 'bg-emerald-500' : pct >= 33 ? 'bg-blue-500' : 'bg-red-500';

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-300">{label}</span>
                <span className="text-xs font-bold text-slate-400">{value}/{max}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-1">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-500">{descFn(breakdown.detail)}</p>
            </div>
          );
        })}
      </div>

      {/* Flags */}
      {(per_negative || low_confidence) && (
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
          {per_negative && (
            <p className="text-xs text-yellow-400">이 기업은 현재 적자 상태예요 (PER 음수). 밸류에이션 점수가 낮게 나올 수 있어요.</p>
          )}
          {low_confidence && (
            <p className="text-xs text-yellow-400">같은 업종 종목이 적어서 비교 정확도가 낮을 수 있어요.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ScoringBreakdownPanel;
