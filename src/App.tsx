import { useState, useEffect, lazy, Suspense } from 'react';
import {
  LayoutDashboard, TrendingUp, Settings, Star, Search, Bell, RefreshCw, Zap, Layers
} from 'lucide-react';
import { stockApi } from './api/stockApi';
import { useStockStore } from './stores/useStockStore';
import NavButton from './components/NavButton';
import type { StockSummary } from './types/stock';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const HoldingsAnalysisPage = lazy(() => import('./pages/HoldingsAnalysisPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const MajorStocksPage = lazy(() => import('./pages/MajorStocksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StockDetailView = lazy(() => import('./components/StockDetailView'));

const App = () => {
  const {
    activeTab, selectedStock, holdings,
    navigateTo, handleDetailClick, setActiveTab,
    fetchHoldings, addHolding, deleteHolding,
  } = useStockStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await stockApi.searchStocks(searchQuery);
          setSearchResults(results);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSelect = (stock: StockSummary) => {
    handleDetailClick(stock);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBack = () => {
    if (selectedStock?.category === '보유 종목') {
      navigateTo('analysis');
    } else {
      navigateTo('recommendations');
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-68 border-r border-slate-800/60 flex flex-col bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8">
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center space-x-2">
            <span className="bg-blue-600 p-1.5 rounded-lg"><Zap size={20} fill="white" color="white" /></span>
            <span className="bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">StockAnalyzer</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-1.5">
          <NavButton active={activeTab === 'dashboard'} onClick={() => navigateTo('dashboard')} icon={<LayoutDashboard size={20} />} label="대시보드" />
          <NavButton active={activeTab === 'analysis'} onClick={() => navigateTo('analysis')} icon={<TrendingUp size={20} />} label="보유 종목 분석" />
          <NavButton active={activeTab === 'recommendations' || (activeTab === 'detail' && selectedStock?.category !== '보유 종목' && selectedStock?.category !== '주요 종목')} onClick={() => navigateTo('recommendations')} icon={<Star size={20} />} label="유망 종목 추천" />
          <NavButton active={activeTab === 'major'} onClick={() => navigateTo('major')} icon={<Layers size={20} />} label="주요 종목 현황" />
          <NavButton active={activeTab === 'settings'} onClick={() => navigateTo('settings')} icon={<Settings size={20} />} label="설정" />
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-gradient-to-br from-blue-600/10 to-emerald-600/10 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Star size={16} className="text-yellow-400 fill-yellow-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Premium Plan</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">고급 알고리즘을 통한 모든 추천 종목을 확인하세요.</p>
            <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors">구독 관리</button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none"></div>

        <header className="h-20 border-b border-slate-800/40 px-10 flex items-center justify-between z-10">
          <div className="relative">
            <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-2xl px-5 py-2.5 w-[420px] focus-within:border-blue-500/50 transition-all backdrop-blur-sm">
              <Search size={18} className="text-slate-500 mr-3" />
              <input
                type="text"
                placeholder="종목명 또는 코드 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-slate-600"
              />
              {isSearching && <RefreshCw size={14} className="animate-spin text-slate-500 ml-2" />}
            </div>

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                {searchResults.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => handleSearchSelect(stock)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                  >
                    <div className="text-left">
                      <p className="text-sm font-bold">{stock.name}</p>
                      <p className="text-[10px] text-slate-500">{stock.code}</p>
                    </div>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold">
                      {stock.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-5">
            <button
              title="알림 확인"
              className="bg-slate-900/50 p-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all relative"
            >
              <Bell size={20} className="text-slate-400" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-950"></span>
            </button>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center space-x-3 cursor-pointer group">
              <div className="text-right">
                <p className="text-sm font-bold leading-none mb-1 group-hover:text-blue-400 transition-colors">홍길동</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">My Account</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5">
                <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center font-bold text-blue-400">H</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-10 relative">
          <div className="max-w-7xl mx-auto pb-20">
            <Suspense fallback={
              <div className="flex items-center justify-center h-64 text-slate-500">
                <RefreshCw className="animate-spin mr-2" size={20} />
                <span>로딩 중...</span>
              </div>
            }>
              {activeTab === 'dashboard' && <DashboardPage holdings={holdings} onAdd={addHolding} onDelete={deleteHolding} onDetailClick={handleDetailClick} />}
              {activeTab === 'analysis' && <HoldingsAnalysisPage holdings={holdings} onDetailClick={handleDetailClick} />}
              {activeTab === 'recommendations' && <RecommendationsPage onDetailClick={handleDetailClick} />}
              {activeTab === 'major' && <MajorStocksPage onDetailClick={handleDetailClick} />}
              {activeTab === 'settings' && <SettingsPage />}
              {activeTab === 'detail' && selectedStock && (
                <StockDetailView stock={selectedStock} onAdd={addHolding} onBack={handleBack} />
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
