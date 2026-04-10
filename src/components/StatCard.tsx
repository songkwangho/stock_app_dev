import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  positive?: boolean;
  icon: ReactNode;
  subtitle?: string;
  // 추가 컨텍스트 라인 (예: KOSPI 비교) — 사용자 오해 방지용 ℹ️ 툴팁 동봉
  tooltip?: { label: string; text: string };
}

const StatCard = ({ title, value, change, positive, icon, subtitle, tooltip }: StatCardProps) => {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-slate-950 rounded-2xl text-blue-400 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        {change && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
      {tooltip && (
        <div className="mt-2 pt-2 border-t border-slate-800/50 relative">
          <button
            onClick={() => setShowTip(!showTip)}
            className="flex items-center space-x-1 text-xs text-slate-500 hover:text-blue-400 transition-colors"
          >
            <span>{tooltip.label}</span>
            <Info size={12} />
          </button>
          {showTip && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-xl text-xs text-slate-300 leading-relaxed animate-in fade-in duration-150">
              {tooltip.text}
              <button
                onClick={() => setShowTip(false)}
                className="block mt-2 text-blue-400 font-bold"
              >
                알겠어요
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
