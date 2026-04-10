import { create } from 'zustand';
import { stockApi } from '../api/stockApi';
import { useToastStore } from './useToastStore';
import type { WatchlistItem } from '../types/stock';

interface WatchlistState {
  items: WatchlistItem[];
  isLoading: boolean;
  lastFetched: number; // 캐시 타임스탬프 (TTL 검사용)
}

interface WatchlistActions {
  fetchWatchlist: (force?: boolean) => Promise<void>;
  addToWatchlist: (code: string) => Promise<void>;
  removeFromWatchlist: (code: string) => Promise<void>;
}

const TTL_MS = 30 * 1000; // 30초 TTL

export const useWatchlistStore = create<WatchlistState & WatchlistActions>((set, get) => ({
  items: [],
  isLoading: false,
  lastFetched: 0,

  fetchWatchlist: async (force = false) => {
    // TTL 이내 재호출 스킵 (WatchlistPage + HoldingsAnalysisPage 동시 마운트 대응)
    if (!force && Date.now() - get().lastFetched < TTL_MS) return;
    set({ isLoading: true });
    try {
      const data = await stockApi.getWatchlist();
      set({ items: data, isLoading: false, lastFetched: Date.now() });
    } catch {
      set({ isLoading: false });
    }
  },

  addToWatchlist: async (code) => {
    try {
      await stockApi.addToWatchlist(code);
      await get().fetchWatchlist(true); // 강제 갱신
    } catch {
      throw new Error('관심종목 추가에 실패했습니다.');
    }
  },

  removeFromWatchlist: async (code) => {
    const previous = get().items;
    set({ items: previous.filter(i => i.code !== code) }); // optimistic
    try {
      await stockApi.removeFromWatchlist(code);
    } catch {
      // 실패 시 즉시 롤백 + 토스트로 사용자에게 알림 (단순 재출현은 혼란을 줌)
      set({ items: previous });
      useToastStore.getState().addToast('관심종목 삭제에 실패했어요. 다시 시도해 주세요.', 'error');
    }
  },
}));
