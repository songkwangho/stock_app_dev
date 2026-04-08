import { useState, useEffect, lazy, Suspense } from 'react';
import {
  LayoutDashboard, TrendingUp, Settings, Star, Search, Bell, RefreshCw, Zap, Layers, Trash2, X, Eye, Filter
} from 'lucide-react';
import { stockApi } from './api/stockApi';
import { useNavigationStore } from './stores/useNavigationStore';
import { usePortfolioStore } from './stores/usePortfolioStore';
import { useAlertStore } from './stores/useAlertStore';
import { useToastStore } from './stores/useToastStore';
import NavButton from './components/NavButton';
import type { StockSummary, MarketIndex } from './types/stock';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const HoldingsAnalysisPage = lazy(() => import('./pages/HoldingsAnalysisPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const MajorStocksPage = lazy(() => import('./pages/MajorStocksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StockDetailView = lazy(() => import('./components/StockDetailView'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'));

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string; priority: string }> = {
  sell_signal: { label: '매도 신호', icon: '🔴', color: 'text-red-400 bg-red-500/10', priority: 'high' },
  sma5_break: { label: '단기 하락', icon: '📉', color: 'text-red-400 bg-red-500/10', priority: 'medium' },
  sma5_touch: { label: '매수 타이밍', icon: '💡', color: 'text-emerald-400 bg-emerald-500/10', priority: 'medium' },
  target_near: { label: '목표가 근접', icon: '🎯', color: 'text-yellow-400 bg-yellow-500/10', priority: 'high' },
  undervalued: { label: '저평가 신호', icon: '💎', color: 'text-blue-400 bg-blue-500/10', priority: 'low' },
};

const App = () => {
  const { activeTab, selectedStock, navigateTo, handleDetailClick, goBack } = useNavigationStore();
  const { holdings, fetchHoldings, addHolding, updateHolding, deleteHolding } = usePortfolioStore();
  const { alerts, unreadCount, fetchAlerts, fetchUnreadCount, markAllRead, deleteAlert } = useAlertStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');

  const handleNicknameChange = (name: string) => {
    setNickname(name);
    localStorage.setItem('nickname', name);
  };

  const [showAlerts, setShowAlerts] = useState(false);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // Fetch unread count and market indices periodically
  useEffect(() => {
    const fetchIndices = async () => {
      try {
        const data = await stockApi.getMarketIndices();
        setMarketIndices(data);
      } catch { /* silent */ }
    };
    fetchUnreadCount();
    fetchIndices();
    const interval = setInterval(() => { fetchUnreadCount(); fetchIndices(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

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

  const handleNavDetailClick = (stock: StockSummary) => {
    handleDetailClick(stock);
  };

  const handleBack = () => {
    goBack();
  };

  const handleToggleAlerts = async () => {
    if (!showAlerts) {
      await fetchAlerts();
      await markAllRead();
    }
    setShowAlerts(!showAlerts);
  };

  const handleDeleteAlert = async (id: number) => {
    await deleteAlert(id);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-50 overflow-hidden font-sans">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-68 border-r border-slate-800/60 flex-col bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8">
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center space-x-2">
            <span className="bg-blue-600 p-1.5 rounded-lg"><Zap size={20} fill="white" color="white" /></span>
            <span className="bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">StockAnalyzer</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-1.5">
          <NavButton active={activeTab === 'dashboard'} onClick={() => navigateTo('dashboard')} icon={<LayoutDashboard size={20} />} label="대시보드" />
          <NavButton active={activeTab === 'analysis'} onClick={() => navigateTo('analysis')} icon={<TrendingUp size={20} />} label="내 포트폴리오" />
          <NavButton active={activeTab === 'recommendations' || (activeTab === 'detail' && selectedStock?.category !== '보유 종목' && selectedStock?.category !== '주요 종목')} onClick={() => navigateTo('recommendations')} icon={<Star size={20} />} label="유망 종목 추천" />
          <NavButton active={activeTab === 'watchlist'} onClick={() => navigateTo('watchlist')} icon={<Eye size={20} />} label="관심종목" />
          <NavButton active={activeTab === 'screener'} onClick={() => navigateTo('screener')} icon={<Filter size={20} />} label="종목 스크리너" />
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

        <header className="h-16 md:h-20 border-b border-slate-800/40 px-4 md:px-10 flex items-center justify-between z-10">
          <div className="flex items-center space-x-6">
            {/* Market Indices */}
            {marketIndices.length > 0 && (
              <div className="flex items-center space-x-4">
                {marketIndices.map(idx => (
                  <div key={idx.symbol} className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-500">{idx.symbol}</span>
                    <span className="text-xs font-bold text-white">{idx.value?.toLocaleString() || '---'}</span>
                    {idx.changeRate && (
                      <span className={`text-xs font-bold ${idx.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                        {idx.positive ? '▲' : '▼'} {idx.changeRate}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          <div className="relative">
            <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-2xl px-3 md:px-5 py-2.5 w-full md:w-[420px] focus-within:border-blue-500/50 transition-all backdrop-blur-sm">
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
                      <p className="text-xs text-slate-500">{stock.code}</p>
                    </div>
                    <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold">
                      {stock.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>

          <div className="flex items-center space-x-5">
            {/* Alerts Bell */}
            <div className="relative">
              <button
                title="알림 확인"
                onClick={handleToggleAlerts}
                className="bg-slate-900/50 p-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all relative"
              >
                <Bell size={20} className="text-slate-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-xs font-bold text-white px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Alerts Panel */}
              {showAlerts && (
                <div className="absolute top-full right-0 mt-2 w-[400px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
                    <h4 className="text-sm font-bold">알림</h4>
                    <button onClick={() => setShowAlerts(false)} className="text-slate-500 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="max-h-96 overflow-auto">
                    {alerts.length === 0 ? (
                      <div className="p-8 text-center text-slate-600 text-sm">
                        알림이 없습니다.
                      </div>
                    ) : (
                      alerts.map((alert) => {
                        const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, icon: '📋', color: 'text-slate-400 bg-slate-500/10', priority: 'low' };
                        return (
                          <div key={alert.id} className={`px-5 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${typeInfo.priority === 'high' ? 'border-l-2 border-l-red-500/50' : ''}`}>
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm">{typeInfo.icon}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeInfo.color}`}>
                                  {typeInfo.label}
                                </span>
                                <span className="text-xs text-slate-500 font-bold">{alert.name}</span>
                              </div>
                              <button
                                onClick={() => handleDeleteAlert(alert.id)}
                                className="text-red-400/60 active:text-red-400 transition-all p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed pl-7">{alert.message}</p>
                            <p className="text-xs text-slate-600 mt-1 pl-7">
                              {new Date(alert.created_at).toLocaleString('ko-KR')}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigateTo('analysis')}>
              <div className="text-right">
                <p className="text-sm font-bold leading-none mb-1 group-hover:text-blue-400 transition-colors">{nickname || '투자자'}</p>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-tighter">내 포트폴리오</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5">
                <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center font-bold text-blue-400">{(nickname || '투자자')[0]}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-10 relative">
          <div className="max-w-7xl mx-auto pb-24 md:pb-20">
            <Suspense fallback={
              <div className="flex items-center justify-center h-64 text-slate-500">
                <RefreshCw className="animate-spin mr-2" size={20} />
                <span>로딩 중...</span>
              </div>
            }>
              {activeTab === 'dashboard' && <DashboardPage holdings={holdings} onNavigate={navigateTo} onDetailClick={handleNavDetailClick} />}
              {activeTab === 'analysis' && <HoldingsAnalysisPage holdings={holdings} onAdd={addHolding} onUpdate={updateHolding} onDelete={deleteHolding} onDetailClick={handleNavDetailClick} />}
              {activeTab === 'recommendations' && <RecommendationsPage onDetailClick={handleNavDetailClick} />}
              {activeTab === 'watchlist' && <WatchlistPage onDetailClick={handleNavDetailClick} />}
              {activeTab === 'screener' && <ScreenerPage onDetailClick={handleNavDetailClick} />}
              {activeTab === 'major' && <MajorStocksPage onDetailClick={handleNavDetailClick} />}
              {activeTab === 'settings' && <SettingsPage nickname={nickname} onNicknameChange={handleNicknameChange} />}
              {activeTab === 'detail' && selectedStock && (
                <StockDetailView stock={selectedStock} onAdd={addHolding} onUpdate={updateHolding} onBack={handleBack} />
              )}
            </Suspense>
          </div>
        </main>
      </div>
      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/60 z-50">
        <div className="flex items-center justify-around h-16">
          {[
            { tab: 'dashboard', icon: <LayoutDashboard size={20} />, label: '대시보드' },
            { tab: 'analysis', icon: <TrendingUp size={20} />, label: '포트폴리오' },
            { tab: 'recommendations', icon: <Star size={20} />, label: '추천' },
            { tab: 'watchlist', icon: <Eye size={20} />, label: '관심종목' },
            { tab: 'settings', icon: <Settings size={20} />, label: '설정' },
          ].map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => navigateTo(tab)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-colors ${
                activeTab === tab ? 'text-blue-400' : 'text-slate-500'
              }`}
            >
              {icon}
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Global Toast */}
      <ToastContainer />
    </div>
  );
};

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`px-5 py-3 rounded-2xl text-sm font-medium shadow-lg cursor-pointer animate-in slide-in-from-bottom-2 duration-300 ${
            t.type === 'error' ? 'bg-red-500/90 text-white' :
            t.type === 'success' ? 'bg-emerald-500/90 text-white' :
            'bg-blue-500/90 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};

export default App;
