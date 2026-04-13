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
import { getDataFreshnessShort } from './utils/dataFreshness';
import type { StockSummary, MarketIndex } from './types/stock';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const HoldingsAnalysisPage = lazy(() => import('./pages/HoldingsAnalysisPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const MajorStocksPage = lazy(() => import('./pages/MajorStocksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StockDetailView = lazy(() => import('./components/StockDetailView'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'));

// 알림 type 코드는 그대로 두고, 사용자에게 표시되는 한국어 라벨만 중립적 표현으로 통일.
// 앱스토어 심사에서 투자 권고로 해석될 여지를 줄이기 위함 — "신호/타이밍" → "경고/알림".
const ALERT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string; priority: string }> = {
  sell_signal: { label: '가격 하락 경고', icon: '🔴', color: 'text-red-400 bg-red-500/10', priority: 'high' },
  sma5_break: { label: '단기 하락 알림', icon: '📉', color: 'text-red-400 bg-red-500/10', priority: 'medium' },
  sma5_touch: { label: '가격 지지 알림', icon: '💡', color: 'text-emerald-400 bg-emerald-500/10', priority: 'medium' },
  target_near: { label: '목표가 근접 알림', icon: '🎯', color: 'text-yellow-400 bg-yellow-500/10', priority: 'high' },
  undervalued: { label: '저평가 분석 결과', icon: '💎', color: 'text-blue-400 bg-blue-500/10', priority: 'low' },
};

const App = () => {
  const { activeTab, selectedStock, navigateTo, handleDetailClick, goBack } = useNavigationStore();
  const { holdings, fetchHoldings, addHolding, updateHolding, deleteHolding } = usePortfolioStore();
  const { alerts, unreadCount, fetchAlerts, fetchUnreadCount, markAllRead, deleteAlert } = useAlertStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem('disclaimer_accepted'));
  const [onboardingStep, setOnboardingStep] = useState(() => localStorage.getItem('onboarding_done') ? 0 : -1); // -1=대기, 1=step1, 2=step2, 0=완료

  const handleNicknameChange = (name: string) => {
    setNickname(name);
    localStorage.setItem('nickname', name);
  };

  const [showAlerts, setShowAlerts] = useState(false);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  // 알림 패널 첫 진입 1회 안내 (4번째 onboarding 키)
  const [alertsExplained, setAlertsExplained] = useState(() => !!localStorage.getItem('onboarding_alerts_explained'));
  // 서버 health check (Render 콜드 스타트 / DB 연결 실패 가시화)
  const [healthState, setHealthState] = useState<'checking' | 'ok' | 'timeout'>('checking');
  // /api/health의 lastSync 저장 — null이거나 24h 이상 오래되면 헤더 서브텍스트로 경고 (14차 5-1 P3)
  const [lastSync, setLastSync] = useState<string | null>(null);

  // 앱 진입 시 /api/health 호출. 10초 타임아웃이면 사용자에게 안내 후 [다시 시도] 버튼 제공.
  // 정상 응답 후에만 holdings/indices 로딩 시작.
  const checkHealth = async () => {
    setHealthState('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        try {
          const body = await res.json();
          setLastSync(body?.lastSync || null);
        } catch { /* ignore */ }
        setHealthState('ok');
      } else {
        setHealthState('timeout');
      }
    } catch {
      clearTimeout(timer);
      setHealthState('timeout');
    }
  };

  // lastSync 기반 안내 메시지 (null: 첫 sync 전, 24h 초과: 데이터 오래됨)
  const syncWarning = (() => {
    if (!lastSync) return '아직 데이터를 수집 중이에요. 잠시 기다려 주세요.';
    const ageMs = Date.now() - new Date(lastSync).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return '데이터가 오늘 갱신되지 않았어요. 최신 시세가 아닐 수 있어요.';
    return null;
  })();

  useEffect(() => { checkHealth(); }, []);

  useEffect(() => {
    if (healthState === 'ok') fetchHoldings();
  }, [healthState, fetchHoldings]);

  // Fetch unread count and market indices periodically (health 통과 후에만)
  useEffect(() => {
    if (healthState !== 'ok') return;
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
  }, [fetchUnreadCount, healthState]);

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

  // 서버 연결 스플래시 — 정상 응답 전까지 다른 UI를 차단하여 빈 화면 노출 방지.
  // Render Starter는 콜드 스타트가 거의 없지만 free plan / 첫 진입 / DB 다운 케이스에 대비.
  if (healthState !== 'ok') {
    return (
      <div className="flex h-screen bg-slate-950 text-slate-50 items-center justify-center font-sans p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex items-center justify-center">
            <span className="bg-blue-600 p-3 rounded-2xl"><Zap size={28} fill="white" color="white" /></span>
          </div>
          <h1 className="text-2xl font-extrabold">StockAnalyzer</h1>
          {healthState === 'checking' ? (
            <>
              <div className="flex items-center justify-center text-slate-400">
                <RefreshCw className="animate-spin mr-2" size={18} />
                <span className="text-sm">데이터를 불러오는 중이에요...</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                서버가 잠시 후 응답할 거예요.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                서버가 깨어나는 중이에요.
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                약 30초 후 <span className="font-bold text-slate-300">다시 시도</span>를 눌러주세요.<br/>
                (무료 서버 특성상 첫 접속 시 시간이 걸릴 수 있어요.)
              </p>
              <button
                onClick={checkHealth}
                className="px-6 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl transition-colors inline-flex items-center space-x-2"
              >
                <RefreshCw size={14} />
                <span>다시 시도</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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

        {/* 사이드바 하단 카드 — Premium Plan 카드는 구독 기능이 실제로 없는 시점에 사용자 혼란을 유발하므로 Phase 5 도입 시점까지 제거 (15차 5-6) */}
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
                    <div className="flex items-center space-x-1.5">
                      {stock.market_opinion && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                          stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>● {stock.market_opinion}</span>
                      )}
                      <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold">
                        {stock.category}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* 빈 검색 결과 안내 — 등록된 97개 종목 외에는 검색되지 않음을 명시 */}
            {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 p-5">
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                  '<span className="font-bold text-white">{searchQuery}</span>' 종목을 찾을 수 없어요.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  현재 97개 주요 종목만 지원해요. 전체 목록에서 찾아보거나 종목코드로 직접 추가할 수 있어요.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { navigateTo('major'); setSearchQuery(''); setSearchResults([]); }}
                    className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    전체 종목 보기 →
                  </button>
                  <button
                    onClick={() => { navigateTo('settings'); setSearchQuery(''); setSearchResults([]); }}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors"
                  >
                    종목코드로 추가 →
                  </button>
                </div>
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

              {/* Alerts Panel
                  - PC(md: 이상): 헤더 우측 드롭다운 (max-h-96 스크롤)
                  - 모바일(md: 미만): 전체 화면 모달 (헤더 드롭다운의 스크롤 충돌 방지) */}
              {showAlerts && (
                <>
                  {/* Mobile backdrop */}
                  <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setShowAlerts(false)} />
                  <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 md:absolute md:inset-auto md:top-full md:right-0 md:mt-2 md:w-[400px] md:max-h-[80vh] md:bg-slate-900 md:border md:border-slate-800 md:rounded-2xl md:shadow-2xl md:overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <h4 className="text-base md:text-sm font-bold">알림</h4>
                    <button onClick={() => setShowAlerts(false)} className="text-slate-500 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="알림 닫기">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto md:max-h-96">
                    {/* 첫 진입 1회 안내 카드 (onboarding_alerts_explained) */}
                    {!alertsExplained && (
                      <div className="m-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                        <p className="text-sm font-bold text-blue-300 mb-2">📬 알림은 어떻게 동작하나요?</p>
                        <ul className="text-xs text-slate-300 leading-relaxed space-y-1">
                          <li>• 보유·관심 종목의 가격 변화를 알려드려요.</li>
                          <li>• 데이터는 <span className="font-bold">하루 1회</span> 갱신 기준이에요 (실시간 아님).</li>
                          <li>• 동일 종목당 하루 최대 2건만 발송돼요.</li>
                          <li>• SMA(이동평균선) 관련 알림은 <span className="font-bold">보유 종목에만</span> 발송돼요.</li>
                          <li>• 투자 결정은 항상 본인이 직접 해주세요.</li>
                        </ul>
                        <button
                          onClick={() => { localStorage.setItem('onboarding_alerts_explained', '1'); setAlertsExplained(true); }}
                          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          확인했어요
                        </button>
                      </div>
                    )}
                    {alerts.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-2xl mb-2">🔔</p>
                        <p className="text-slate-400 font-bold mb-1">아직 알림이 없어요</p>
                        <p className="text-slate-600 text-xs">보유·관심 종목에 주요 변화가 생기면 알려드려요</p>
                      </div>
                    ) : (
                      alerts.map((alert) => {
                        const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, icon: '📋', color: 'text-slate-400 bg-slate-500/10', priority: 'low' };
                        return (
                          <div
                            key={alert.id}
                            className={`px-5 py-3 border-b border-slate-800/50 ${typeInfo.priority === 'high' ? 'border-l-2 border-l-red-500/50' : ''}`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <span className="text-sm">{typeInfo.icon}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeInfo.color}`}>
                                  {typeInfo.label}
                                </span>
                                <span className="text-xs text-slate-500 font-bold">{alert.name}</span>
                                {/* 출처 뱃지 (14차 5-1): 'holding' / 'watchlist'. 레거시(undefined)는 "알림"으로 폴백 (15차 5-3) */}
                                {alert.source === 'holding' ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">보유 중</span>
                                ) : alert.source === 'watchlist' ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">관심 종목</span>
                                ) : (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400">알림</span>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteAlert(alert.id); }}
                                className="text-red-400/60 active:text-red-400 transition-all p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
                                aria-label="알림 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed pl-7">{alert.message}</p>
                            <p className="text-xs text-slate-600 mt-1 pl-7">
                              {getDataFreshnessShort(alert.created_at)}
                            </p>
                            {/* 16차 5-7: 모바일 HIG 44px 터치 타겟 확보 (py-1.5 → min-h-[44px]) */}
                            <div className="flex items-center space-x-2 pl-7 mt-2">
                              <button
                                onClick={() => {
                                  handleDetailClick({ code: alert.code, name: alert.name, category: '알림' });
                                  setShowAlerts(false);
                                }}
                                className="text-xs font-bold px-4 py-2 min-h-[44px] bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
                              >
                                지금 확인하기
                              </button>
                              <button
                                onClick={() => setShowAlerts(false)}
                                className="text-xs font-bold px-4 py-2 min-h-[44px] text-slate-400 hover:text-white transition-colors"
                              >
                                나중에 볼게요
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                </>
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

        {/* 데이터 신선도 경고 배너 — health.lastSync null / 24h 초과 시 (14차 5-1 P3) */}
        {syncWarning && (
          <div className="px-4 md:px-10 py-2 bg-amber-500/5 border-b border-amber-500/20">
            <p className="text-xs text-amber-300/80 max-w-7xl mx-auto">ℹ️ {syncWarning}</p>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-10 relative">
          <div className="max-w-7xl mx-auto pb-24 md:pb-20">
            <Suspense fallback={
              <div className="flex items-center justify-center h-64 text-slate-500">
                <RefreshCw className="animate-spin mr-2" size={20} />
                <span>로딩 중...</span>
              </div>
            }>
              {activeTab === 'dashboard' && <DashboardPage holdings={holdings} onNavigate={navigateTo} onDetailClick={handleNavDetailClick} marketIndices={marketIndices} />}
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
            { tab: 'alerts-page', icon: <Bell size={20} />, label: '알림', badge: unreadCount },
            { tab: 'settings', icon: <Settings size={20} />, label: '설정' },
          ].map(({ tab, icon, label, badge }) => (
            <button
              key={tab}
              onClick={() => {
                if (tab === 'alerts-page') { handleToggleAlerts(); }
                else { navigateTo(tab); }
              }}
              className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-colors relative ${
                activeTab === tab || (tab === 'alerts-page' && showAlerts) ? 'text-blue-400' : 'text-slate-500'
              }`}
            >
              {icon}
              {badge !== undefined && badge > 0 && (
                <span className="absolute top-1 right-1/4 min-w-[16px] h-[16px] bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center px-0.5">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Investment Disclaimer Modal (1회) */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-bold text-white">투자 유의사항</h2>
            <div className="text-sm text-slate-400 leading-relaxed space-y-2">
              <p>이 앱의 분석과 추천은 <strong className="text-white">투자 참고용 정보이며, 투자 결정의 책임은 본인에게 있습니다.</strong></p>
              <p>이 앱은 <strong className="text-blue-300">정보 제공 도구로, 실제 주식 거래는 지원하지 않아요.</strong> 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요.</p>
              <p>모든 투자에는 <strong className="text-red-400">원금 손실 위험</strong>이 있으며, 과거 데이터 기반 분석이 미래 수익을 보장하지 않습니다.</p>
              <p>종목 추천 점수와 의견은 알고리즘 자동 산출 결과이며, 전문 투자 조언이 아닙니다.</p>
            </div>
            <button
              onClick={() => { localStorage.setItem('disclaimer_accepted', '1'); setShowDisclaimer(false); setOnboardingStep(1); }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}

      {/* Onboarding Flow (2단계) */}
      {onboardingStep > 0 && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            {onboardingStep === 1 && (
              <>
                <p className="text-xs text-blue-400 font-bold">1/2</p>
                <h2 className="text-lg font-bold text-white">내 주식을 추가해볼게요</h2>
                <p className="text-sm text-slate-400 leading-relaxed">보유 종목을 추가하면 수익률 추적, 매수/매도 의견, 알림을 받을 수 있어요.</p>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">예시: "삼성전자"를 검색해보세요</p>
                </div>
                <div className="flex space-x-3">
                  <button onClick={() => { localStorage.setItem('onboarding_done', '1'); setOnboardingStep(0); }} className="flex-1 py-3 bg-slate-800 text-slate-400 text-sm font-bold rounded-xl">건너뛰기</button>
                  <button onClick={() => { setOnboardingStep(0); localStorage.setItem('onboarding_done', '1'); navigateTo('analysis', { focus: 'add-holding-search' }); }} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors">직접 추가할게요</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
