import { create } from 'zustand';
import { stockApi } from '../api/stockApi';
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
    set({ items: get().items.filter(i => i.code !== code) }); // optimistic
    try {
      await stockApi.removeFromWatchlist(code);
    } catch {
      await get().fetchWatchlist(true); // rollback (강제 갱신)
    }
  },
}));
