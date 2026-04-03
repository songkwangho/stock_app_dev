import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  positive?: boolean;
  icon: ReactNode;
}

const StatCard = ({ title, value, change, positive, icon }: StatCardProps) => (
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
  </div>
);

export default StatCard;
