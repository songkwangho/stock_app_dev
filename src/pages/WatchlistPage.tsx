import WatchlistContent from '../components/WatchlistContent';
import type { StockSummary } from '../types/stock';

interface WatchlistPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

const WatchlistPage = ({ onDetailClick }: WatchlistPageProps) => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">관심종목</h2>
        <p className="text-slate-500 text-sm">매수하지 않았지만 눈여겨보고 싶은 종목들을 모아 관리하세요.</p>
      </div>
      <WatchlistContent onDetailClick={onDetailClick} />
    </div>
  );
};

export default WatchlistPage;
