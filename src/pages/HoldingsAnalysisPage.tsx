import { useState, useEffect } from 'react';
import { TrendingUp, Plus, Pencil, Trash2, Check, X, ChevronUp, PlusCircle, Eye, HelpCircle } from 'lucide-react';
import StockSearchInput from '../components/StockSearchInput';
import WatchlistContent from '../components/WatchlistContent';
import ErrorBanner from '../components/ErrorBanner';
import { useNavigationStore } from '../stores/useNavigationStore';
import { usePortfolioStore } from '../stores/usePortfolioStore';
import type { Holding, StockSummary } from '../types/stock';

interface HoldingsAnalysisPageProps {
  holdings: Holding[];
  onAdd: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  onUpdate: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
  onDetailClick: (stock: StockSummary) => void;
}

interface EditState {
  avgPrice: string;
  quantity: string;
}

const HoldingsAnalysisPage = ({ holdings, onAdd, onUpdate, onDelete, onDetailClick }: HoldingsAnalysisPageProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ avgPrice: '', quantity: '' });
  const [newStock, setNewStock] = useState<{ code: string; name: string } | null>(null);
  const [newForm, setNewForm] = useState({ avgPrice: '', quantity: '' });
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [subTab, setSubTab] = useState<'holdings' | 'watchlist'>('holdings');
  // 첫 종목 추가 직후 1회 인라인 가이드 카드 ('onboarding_first_stock_guided')
  const [firstStockGuide, setFirstStockGuide] = useState<{ code: string; name: string } | null>(null);
  // 수익률 계산식 [?] 툴팁 (종목별 1개)
  const [profitHelpCode, setProfitHelpCode] = useState<string | null>(null);

  // 포트폴리오 도메인 에러 (usePortfolioStore.error)는 ErrorBanner로 통일 표시
  const portfolioError = usePortfolioStore(state => state.error);
  const refetchHoldings = usePortfolioStore(state => state.fetchHoldings);

  // 페이지 진입 시 pendingFocus 처리:
  //  - 'add-holding-search': 온보딩 → 검색 폼 자동 노출
  //  - 'first-stock-guide':  StockDetailView에서 첫 종목 추가 직후 진입 → 가이드 카드 노출
  useEffect(() => {
    const focus = useNavigationStore.getState().consumePendingFocus();
    if (focus === 'add-holding-search') setShowAddForm(true);
    if (focus === 'first-stock-guide' && holdings.length > 0 && !localStorage.getItem('onboarding_first_stock_guided')) {
      const just = holdings[0];
      setFirstStockGuide({ code: just.code, name: just.name });
      localStorage.setItem('onboarding_first_stock_guided', '1');
    }
  }, [holdings]);

  const showToast = (type: 'success' | 'error', text: string, action?: { label: string; onClick: () => void }) => {
    setToast({ type, text, action });
    setTimeout(() => setToast(null), 5000);
  };

  const handleAdd = async () => {
    if (!newStock || !newForm.avgPrice) return;
    const justAdded = newStock;
    const wasFirstStock = holdings.length === 0 && !localStorage.getItem('onboarding_first_stock_guided');
    try {
      await onAdd({
        code: justAdded.code,
        name: justAdded.name,
        avgPrice: parseInt(newForm.avgPrice),
        quantity: parseInt(newForm.quantity || '0'),
        value: 0,
      });
      if (wasFirstStock) {
        // 첫 종목: 토스트 대신 인라인 가이드 카드(1회) 표시
        setFirstStockGuide({ code: justAdded.code, name: justAdded.name });
        localStorage.setItem('onboarding_first_stock_guided', '1');
      } else {
        showToast(
          'success',
          `${justAdded.name}을(를) 추가했어요! 🎉 종목 상세에서 분석 결과를 확인해보세요.`,
          { label: '보러가기', onClick: () => onDetailClick({ ...justAdded, category: '보유 종목' }) },
        );
      }
      setNewStock(null);
      setNewForm({ avgPrice: '', quantity: '' });
      setSearchResetKey(k => k + 1);
    } catch {
      showToast('error', '종목 추가에 실패했습니다.');
    }
  };

  const startEdit = (stock: Holding) => {
    setEditingCode(stock.code);
    setEditState({
      avgPrice: String(stock.avgPrice || ''),
      quantity: String(stock.quantity || '0'),
    });
  };

  const handleUpdate = async (stock: Holding) => {
    try {
      await onUpdate({
        code: stock.code,
        name: stock.name,
        avgPrice: parseInt(editState.avgPrice),
        quantity: parseInt(editState.quantity || '0'),
        value: 0,
      });
      setEditingCode(null);
      showToast('success', `${stock.name} 보유 정보가 수정되었습니다.`);
    } catch {
      showToast('error', '수정에 실패했습니다.');
    }
  };

  const handleDelete = async (stock: Holding) => {
    if (!window.confirm(`${stock.name}을(를) 포트폴리오에서 삭제하시겠습니까?`)) return;
    try {
      await onDelete(stock.code);
      showToast('success', `${stock.name}이(가) 삭제되었습니다.`);
    } catch {
      showToast('error', '삭제에 실패했습니다.');
    }
  };

  // Summary stats
  const totalInvested = holdings.reduce((sum, h) => sum + (h.avgPrice || 0) * (h.quantity || 0), 0);
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.currentPrice || 0) * (h.quantity || 0), 0);
  const totalProfit = totalCurrent - totalInvested;
  const totalProfitRate = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl animate-in slide-in-from-right duration-300 max-w-sm ${
          toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          <p className="leading-relaxed">{toast.text}</p>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); setToast(null); }}
              className="mt-2 px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
            >
              {toast.action.label} →
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">내 종목 관리</h2>
          <div className="flex items-center space-x-1 bg-slate-900/50 rounded-xl p-1 border border-slate-800">
            <button onClick={() => setSubTab('holdings')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${subTab === 'holdings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>보유종목</button>
            <button onClick={() => setSubTab('watchlist')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 ${subTab === 'watchlist' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Eye size={14} />
              <span>관심종목</span>
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`px-4 py-3 min-h-[44px] rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
            showAddForm
              ? 'bg-slate-800 text-slate-400 border border-slate-700'
              : 'bg-blue-600 text-white active:bg-blue-500'
          }`}
        >
          {showAddForm ? <ChevronUp size={14} /> : <Plus size={14} />}
          <span>{showAddForm ? '접기' : '종목 추가'}</span>
        </button>
      </div>

      {/* 포트폴리오 도메인 에러 (DB 연결 실패 등) — 통일된 ErrorBanner */}
      <ErrorBanner error={portfolioError} kind="server" onRetry={refetchHoldings} />

      {subTab === 'watchlist' && (
        <WatchlistContent onDetailClick={onDetailClick} />
      )}

      {subTab === 'holdings' && <>
      {/* Summary Stats */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-blue-400">{holdings.length}</p>
            <p className="text-xs text-slate-500 mt-1">보유 종목 수</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-lg font-black text-white">₩{totalInvested.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">총 투자금액</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-lg font-black text-white">₩{totalCurrent.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">총 평가금액 (현재 가치)</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className={`text-lg font-black ${totalProfitRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalProfitRate >= 0 ? '+' : ''}{totalProfitRate.toFixed(2)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">총 수익률</p>
          </div>
        </div>
      )}

      {/* Add Form (collapsible) */}
      {showAddForm && (
        <div className="bg-slate-900/50 border border-blue-500/20 rounded-3xl p-6 animate-in slide-in-from-top duration-300">
          <h3 className="text-sm font-bold mb-4 flex items-center space-x-2">
            <PlusCircle size={16} className="text-blue-400" />
            <span>새 종목 추가</span>
          </h3>
          <div className="space-y-3">
            <StockSearchInput
              placeholder="추가할 종목명을 검색하세요 (예: 삼성전자)"
              onSelect={(stock) => setNewStock({ code: stock.code, name: stock.name })}
              resetKey={searchResetKey}
              className="w-full"
            />
            {newStock && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg font-bold">
                    {newStock.name} ({newStock.code})
                  </span>
                  <button onClick={() => { setNewStock(null); setSearchResetKey(k => k + 1); }} className="text-red-400 active:text-red-300 px-2 py-1 min-h-[44px] flex items-center space-x-1">
                    <X size={14} />
                    <span className="text-xs">취소</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block font-bold">내가 산 평균 가격 (원)</label>
                    <input
                      type="number"
                      placeholder="예: 70000"
                      value={newForm.avgPrice}
                      onChange={(e) => setNewForm({ ...newForm, avgPrice: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      여러 번 나눠 샀다면 평균을 입력해요. 예: 10만원에 5주, 11만원에 5주 → 105,000원
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block font-bold">보유 주식 수 (주)</label>
                    <input
                      type="number"
                      placeholder="예: 10"
                      value={newForm.quantity}
                      onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      증권사 앱 → 보유 종목에서 확인할 수 있어요.
                    </p>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleAdd}
                    disabled={!newForm.avgPrice}
                    className="bg-blue-600 active:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 py-3 min-h-[44px] rounded-xl text-xs font-bold transition-colors w-full sm:w-auto"
                  >
                    추가
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 첫 종목 추가 직후 인라인 가이드 카드 (1회 표시) */}
      {firstStockGuide && (
        <div className="bg-gradient-to-br from-emerald-600/10 to-blue-600/10 border border-emerald-500/20 rounded-3xl p-6 animate-in fade-in slide-in-from-top-4 duration-300 relative">
          <button
            onClick={() => setFirstStockGuide(null)}
            className="absolute top-4 right-4 text-slate-500 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="가이드 닫기"
          >
            <X size={18} />
          </button>
          <p className="text-2xl mb-2">🎉</p>
          <h3 className="text-lg font-bold text-white mb-3">첫 종목을 추가했어요!</h3>
          <div className="text-sm text-slate-300 leading-relaxed mb-4 space-y-2">
            <p className="font-bold text-blue-300">지금 할 수 있는 것:</p>
            <ul className="space-y-1.5 pl-1">
              <li>• <span className="font-bold text-white">[종목 분석 보기 →]</span> {firstStockGuide.name}의 10점 종합점수, 기술지표, 업종 비교 확인하기</li>
              <li>• 지표가 어렵게 느껴진다면 각 항목의 <span className="text-blue-400 font-bold">[?]</span> 버튼으로 용어 설명 보기</li>
              <li>• <span className="text-blue-400">추천 탭</span>에서 다른 종목도 살펴보기</li>
            </ul>
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-800/50">
              이 안내는 한 번만 표시돼요. 다음 종목 추가 시에는 일반 토스트로 안내해요.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                onDetailClick({ code: firstStockGuide.code, name: firstStockGuide.name, category: '보유 종목' });
                setFirstStockGuide(null);
              }}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              종목 분석 보기 →
            </button>
            <button
              onClick={() => setFirstStockGuide(null)}
              className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-xl transition-colors"
            >
              나중에 볼게요
            </button>
          </div>
        </div>
      )}

      {/* Holdings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {holdings.map((stock) => {
          const profit = stock.currentPrice && stock.avgPrice ? (stock.currentPrice - stock.avgPrice) : 0;
          const profitRate = stock.avgPrice ? (profit / stock.avgPrice * 100).toFixed(2) : '0';
          const isEditing = editingCode === stock.code;
          const evalAmount = (stock.currentPrice || 0) * (stock.quantity || 0);

          const weight = stock.value || 0;
          const concentrated = weight > 50;
          return (
            <div key={stock.code} className={`bg-slate-900/50 border ${concentrated ? 'border-yellow-500/40' : 'border-slate-800'} rounded-3xl p-6 border-l-blue-500/30 border-l-2 transition-all group`}>
              {/* 집중도 경고 (>50%) — 한 종목에 비중이 과도하게 쏠린 경우 */}
              {concentrated && (
                <div className="mb-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-xs text-yellow-300/90 leading-relaxed">
                  ⚠️ <span className="font-bold">{stock.name} 비중이 {weight}%예요.</span> 한 종목에 집중되면 이 종목 하락 시 손실이 커져요. 분산 투자를 검토해보세요.
                </div>
              )}
              {/* Header */}
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center space-x-4 cursor-pointer" onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}>
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 flex items-center justify-center font-bold text-lg text-blue-400 border border-slate-800">
                    {stock.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-blue-400 transition-colors">{stock.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{stock.code}</p>
                  </div>
                </div>
                <div className="text-right relative">
                  <div className="flex items-center justify-end space-x-1.5 mb-1">
                    <p className="text-xs text-slate-500 uppercase tracking-widest">수익률</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setProfitHelpCode(profitHelpCode === stock.code ? null : stock.code); }}
                      className="text-slate-600 hover:text-blue-400 min-w-[24px] min-h-[24px] flex items-center justify-center"
                      aria-label="수익률 계산식"
                    >
                      <HelpCircle size={12} />
                    </button>
                  </div>
                  {profitHelpCode === stock.code && (
                    <div className="absolute right-0 top-7 z-10 w-64 bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-xl text-left">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        수익률 = (현재가 - 평단가) ÷ 평단가 × 100
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed mt-2">
                        예: 평단가 70,000원, 현재가 73,500원<br />
                        → (73,500 - 70,000) ÷ 70,000 × 100 = <span className="text-emerald-400 font-bold">+5.0%</span>
                      </p>
                      <button
                        onClick={() => setProfitHelpCode(null)}
                        className="text-xs text-blue-400 font-bold mt-2"
                      >
                        알겠어요
                      </button>
                    </div>
                  )}
                  <p className={`text-xl font-black ${parseFloat(profitRate) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {parseFloat(profitRate) >= 0 ? '+' : ''}{profitRate}%
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    parseFloat(profitRate) >= 10 ? 'text-emerald-400' :
                    parseFloat(profitRate) >= 0 ? 'text-blue-400' :
                    parseFloat(profitRate) >= -3 ? 'text-slate-400' :
                    parseFloat(profitRate) >= -7 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {parseFloat(profitRate) >= 20 ? '목표 수익 달성! 🎉' :
                     parseFloat(profitRate) >= 10 ? '잘 하고 계세요! 추세를 유지해 보세요' :
                     parseFloat(profitRate) >= 0 ? '소폭 수익 중이에요. 지켜보세요' :
                     parseFloat(profitRate) >= -3 ? '소폭 손실이에요. 주식은 단기 등락이 있어요. 조금 더 지켜볼까요?' :
                     parseFloat(profitRate) >= -7 ? '손실이 커지고 있어요. 손절 기준(-7%)에 근접했어요' :
                     '손실이 커지고 있어요 🔴'}
                  </p>
                  {parseFloat(profitRate) >= 20 && (
                    <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-blue-400 hover:underline">일부 팔아볼까요? [종목 보기 →]</button>
                  )}
                  {parseFloat(profitRate) <= -7 && (
                    <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-blue-400 hover:underline">지금 확인해보세요 [종목 보기 →]</button>
                  )}
                </div>
              </div>

              {/* Opinion Badges */}
              {(stock.holding_opinion || stock.market_opinion) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {stock.holding_opinion && stock.sma_available === false ? (
                    <div className="text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-slate-500/10 text-slate-400 border-slate-500/20">
                      분석 중
                      <span className="font-normal text-slate-500 ml-1">이평선 데이터를 수집 중이에요. 잠시 후 다시 확인해보세요.</span>
                    </div>
                  ) : stock.holding_opinion && (() => {
                    // 표시 라벨은 명령어("매도")가 아닌 상태 설명("주의 필요")으로 변환.
                    // 내부 holding_opinion 값은 알고리즘과 호환성을 위해 그대로 둔다.
                    const displayLabel =
                      stock.holding_opinion === '매도' ? '주의 필요' :
                      stock.holding_opinion === '추가매수' ? '추가 검토' :
                      stock.holding_opinion;
                    const cautionLike = stock.holding_opinion === '매도' || stock.holding_opinion === '추가매수';
                    return (
                    <div className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                      stock.holding_opinion === '매도' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      stock.holding_opinion === '관망' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                      stock.holding_opinion === '추가매수' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {displayLabel}
                      <span className="font-normal text-slate-500 ml-1">
                        {stock.holding_opinion === '매도' && stock.avgPrice && stock.currentPrice
                          ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) <= -7
                            ? `평단가 대비 ${((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(1)}% 손실이에요. 손절 기준(-7%)을 넘었어요.`
                            : '5일·20일 평균 모두 아래로 내려갔어요. 하락 추세예요.'
                          : stock.holding_opinion === '관망' ? '5일 평균 아래지만 20일 평균이 지지 중이에요. 조금 기다려봐요.'
                          : stock.holding_opinion === '추가매수' ? '5일 평균 부근에서 지지받고 있어요.'
                          : '5일 평균 위, 이평선 정배열이에요. 상승 흐름이 이어지고 있어요.'}
                      </span>
                      <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-blue-400 hover:underline ml-1">상세 보기 →</button>
                      {cautionLike && (
                        <span className="block mt-1 font-normal text-[11px] text-slate-500 italic">
                          이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요.
                        </span>
                      )}
                    </div>
                    );
                  })()}
                  {stock.market_opinion && (
                    <span className={`text-xs font-bold px-2 py-1.5 rounded-lg ${
                      stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                      stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' :
                      'bg-slate-500/10 text-slate-400'
                    }`}>
                      시장: {stock.market_opinion}
                    </span>
                  )}
                </div>
              )}

              {/* Info Grid */}
              {isEditing ? (
                <div className="space-y-3 mb-5 p-4 bg-slate-950/50 rounded-2xl border border-blue-500/20">
                  <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">보유 정보 수정</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-300 mb-1 block font-bold">내가 산 평균 가격 (원)</label>
                      <input
                        type="number"
                        value={editState.avgPrice}
                        onChange={(e) => setEditState({ ...editState, avgPrice: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">여러 번 나눠 샀다면 평균을 입력해요.</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 mb-1 block font-bold">보유 주식 수 (주)</label>
                      <input
                        type="number"
                        value={editState.quantity}
                        onChange={(e) => setEditState({ ...editState, quantity: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">증권사 앱에서 확인할 수 있어요.</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button onClick={() => setEditingCode(null)} className="px-4 py-3 min-h-[44px] text-xs text-slate-400 rounded-lg transition-colors flex items-center space-x-1">
                      <X size={14} />
                      <span>취소</span>
                    </button>
                    <button
                      onClick={() => handleUpdate(stock)}
                      className="px-4 py-3 min-h-[44px] bg-blue-600 active:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1"
                    >
                      <Check size={12} />
                      <span>저장</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">평균 매수가 (1주당)</p>
                    <p className="text-sm font-bold">₩{stock.avgPrice?.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">현재가</p>
                    <p className="text-sm font-bold">₩{stock.currentPrice != null ? stock.currentPrice.toLocaleString() : '---'}</p>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">수량</p>
                    <p className="text-sm font-bold">{stock.quantity || 0}주</p>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <p className="text-xs text-slate-500 mb-1">평가금액 (현재 가치)</p>
                    <p className="text-sm font-bold">₩{evalAmount.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                  className="flex-1 py-3 min-h-[44px] bg-slate-950 active:bg-blue-600 text-slate-300 active:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2"
                >
                  <TrendingUp size={14} />
                  <span>상세 분석</span>
                </button>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(stock)}
                    className="py-3 px-4 min-h-[44px] bg-slate-950 active:bg-amber-600 text-amber-400 active:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5"
                  >
                    <Pencil size={12} />
                    <span>수정</span>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(stock)}
                  className="py-3 px-4 min-h-[44px] bg-slate-950 active:bg-red-600 text-red-400 active:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5"
                >
                  <Trash2 size={14} />
                  <span>삭제</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {holdings.length === 0 && (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-3xl mb-4">📊</p>
          <p className="text-slate-300 font-bold text-lg mb-2">아직 보유 종목이 없어요</p>
          <p className="text-slate-500 text-sm mb-6">가진 주식을 추가하면 수익률을 한눈에 볼 수 있어요</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition-colors inline-flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>종목 추가하기</span>
            </button>
            <button
              onClick={() => useNavigationStore.getState().navigateTo('recommendations')}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-sm font-bold transition-colors"
            >
              추천 종목 보기
            </button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
};

export default HoldingsAnalysisPage;
