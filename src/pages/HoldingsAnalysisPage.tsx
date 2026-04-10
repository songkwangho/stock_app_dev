import { useState, useEffect } from 'react';
import { TrendingUp, Plus, Pencil, Trash2, Check, X, ChevronUp, PlusCircle, Eye } from 'lucide-react';
import StockSearchInput from '../components/StockSearchInput';
import { useNavigationStore } from '../stores/useNavigationStore';
import { stockApi } from '../api/stockApi';
import type { Holding, StockSummary, WatchlistItem } from '../types/stock';

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
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [subTab, setSubTab] = useState<'holdings' | 'watchlist'>('holdings');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    if (subTab === 'watchlist') {
      stockApi.getWatchlist().then(setWatchlist).catch(() => {});
    }
  }, [subTab]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAdd = async () => {
    if (!newStock || !newForm.avgPrice) return;
    try {
      await onAdd({
        code: newStock.code,
        name: newStock.name,
        avgPrice: parseInt(newForm.avgPrice),
        quantity: parseInt(newForm.quantity || '0'),
        value: 0,
      });
      showToast('success', `${newStock.name}이(가) 포트폴리오에 추가되었습니다.`);
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
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl animate-in slide-in-from-right duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {toast.text}
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

      {subTab === 'watchlist' && (
        <div className="space-y-4">
          <StockSearchInput
            placeholder="관심종목 추가 (종목명/코드 검색)"
            onSelect={async (s) => {
              try { await stockApi.addToWatchlist(s.code); setWatchlist(await stockApi.getWatchlist()); } catch {}
            }}
            resetKey={searchResetKey}
          />
          {watchlist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {watchlist.map(item => (
                <div key={item.code} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex items-center justify-between group">
                  <div className="cursor-pointer" onClick={() => onDetailClick({ code: item.code, name: item.name, category: item.category })}>
                    <p className="font-bold group-hover:text-blue-400 transition-colors">{item.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{item.code}</p>
                    <p className="text-sm font-bold mt-1">₩{item.price?.toLocaleString() || '---'}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {item.market_opinion && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        item.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                        item.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'
                      }`}>{item.market_opinion}</span>
                    )}
                    <button onClick={async () => {
                      try { await stockApi.removeFromWatchlist(item.code); setWatchlist(w => w.filter(x => x.code !== item.code)); } catch {}
                    }} className="p-2 text-red-400/60 hover:text-red-400 min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
              <p className="text-3xl mb-4">👀</p>
              <p className="text-slate-300 font-bold text-lg mb-2">관심 종목이 없어요</p>
              <p className="text-slate-500 text-sm">마음에 드는 종목을 추가하면 한 곳에서 볼 수 있어요</p>
            </div>
          )}
        </div>
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
                    <label className="text-xs text-slate-500 mb-1 block">매수가 (1주당 산 가격)</label>
                    <input
                      type="number"
                      placeholder="매수가"
                      value={newForm.avgPrice}
                      onChange={(e) => setNewForm({ ...newForm, avgPrice: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">수량 (주)</label>
                    <input
                      type="number"
                      placeholder="수량"
                      value={newForm.quantity}
                      onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                    />
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

      {/* Holdings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {holdings.map((stock) => {
          const profit = stock.currentPrice && stock.avgPrice ? (stock.currentPrice - stock.avgPrice) : 0;
          const profitRate = stock.avgPrice ? (profit / stock.avgPrice * 100).toFixed(2) : '0';
          const isEditing = editingCode === stock.code;
          const evalAmount = (stock.currentPrice || 0) * (stock.quantity || 0);

          return (
            <div key={stock.code} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 border-l-blue-500/30 border-l-2 transition-all group">
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
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">수익률</p>
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
                    {parseFloat(profitRate) >= 20 ? '목표 수익 달성! 일부 익절도 고려해 보세요' :
                     parseFloat(profitRate) >= 10 ? '잘 하고 계세요! 추세를 유지해 보세요' :
                     parseFloat(profitRate) >= 0 ? '소폭 수익 중이에요. 지켜보세요' :
                     parseFloat(profitRate) >= -3 ? '소폭 손실이에요. 장기적으로 여유를 가져보세요' :
                     parseFloat(profitRate) >= -7 ? '손실이 커지고 있어요. 손절 기준(-7%)에 근접했어요' :
                     '손절 기준에 도달했어요. 추가 손실 전 결정이 필요해요'}
                  </p>
                  {(parseFloat(profitRate) >= 20 || parseFloat(profitRate) <= -7) && (
                    <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-blue-400 hover:underline">종목 분석 →</button>
                  )}
                </div>
              </div>

              {/* Opinion Badges */}
              {(stock.holding_opinion || stock.market_opinion) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {stock.holding_opinion && (
                    <div className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                      stock.holding_opinion === '매도' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      stock.holding_opinion === '관망' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                      stock.holding_opinion === '추가매수' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {stock.holding_opinion}
                      <span className="font-normal text-slate-500 ml-1">
                        {stock.holding_opinion === '매도' && stock.avgPrice && stock.currentPrice
                          ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) <= -7
                            ? `평단가 대비 ${((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(1)}% 손실. 손절 기준(-7%) 초과`
                            : '5일선·20일선 모두 이탈. 하락세가 강해요'
                          : stock.holding_opinion === '관망' ? '5일선 아래지만 20일선이 지지 중. 조금 기다려봐요'
                          : stock.holding_opinion === '추가매수' ? '5일선 근처에서 지지받고 있어요'
                          : '5일선 위, 이평선 정배열. 상승 흐름 유지 중'}
                      </span>
                      <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-blue-400 hover:underline ml-1">상세 보기 →</button>
                    </div>
                  )}
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
                      <label className="text-xs text-slate-500 mb-1 block">매수가 (1주당 산 가격)</label>
                      <input
                        type="number"
                        value={editState.avgPrice}
                        onChange={(e) => setEditState({ ...editState, avgPrice: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">수량 (주)</label>
                      <input
                        type="number"
                        value={editState.quantity}
                        onChange={(e) => setEditState({ ...editState, quantity: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                      />
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
                    <p className="text-xs text-slate-500 mb-1">매수가 (1주당 산 가격)</p>
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
