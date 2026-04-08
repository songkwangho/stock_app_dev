import { useState } from 'react';
import { TrendingUp, Plus, Pencil, Trash2, Check, X, ChevronUp, PlusCircle } from 'lucide-react';
import StockSearchInput from '../components/StockSearchInput';
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
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
          <h2 className="text-2xl font-bold mb-2">내 포트폴리오</h2>
          <p className="text-slate-500 text-sm">보유 종목을 추가/수정/삭제하고 수익률을 한눈에 확인하세요.</p>
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
                </div>
              </div>

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
          <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto mb-4 border border-slate-800">
            <PlusCircle size={28} className="text-slate-600" />
          </div>
          <p className="text-slate-400 font-semibold mb-2">아직 보유 종목이 없어요</p>
          <p className="text-slate-600 text-sm mb-6">첫 번째 종목을 추가해서 포트폴리오를 시작해보세요!</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition-colors inline-flex items-center space-x-2"
          >
            <Plus size={16} />
            <span>종목 추가하기</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default HoldingsAnalysisPage;
