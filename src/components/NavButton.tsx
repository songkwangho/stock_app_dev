import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

const NavButton = ({ active, onClick, icon, label }: NavButtonProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3.5 px-5 py-3.5 rounded-2xl transition-all duration-300 ${active
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
      }`}
  >
    <span className={active ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'}>{icon}</span>
    <span className="font-bold text-sm tracking-tight">{label}</span>
    {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
  </button>
);

export default NavButton;
