import { X } from 'lucide-react';

export type HelpTermKey = 'per' | 'pbr' | 'roe' | 'rsi' | 'macd' | 'bollinger' | 'supplyDemand' | 'sma';

interface HelpContent {
  title: string;
  short: string;
  body: string[];
}

const HELP_CONTENTS: Record<HelpTermKey, HelpContent> = {
  per: {
    title: 'PER (주가수익비율)이란?',
    short: '낮을수록 저평가',
    body: [
      '지금 주가가 1년 이익의 몇 배인지를 나타내요.',
      'PER 10배 = 10년치 이익으로 주가를 회수할 수 있는 수준',
      '낮을수록 상대적으로 저렴하다고 볼 수 있어요.',
      '같은 업종끼리 비교해야 의미가 있어요.',
    ],
  },
  pbr: {
    title: 'PBR (주가순자산비율)이란?',
    short: '1 이하면 자산 대비 저평가',
    body: [
      '주가가 회사가 가진 순자산의 몇 배인지를 나타내요.',
      'PBR 1배 = 회사가 가진 자산만큼만 평가받는 상태',
      '1 미만이면 자산보다 싸게 거래되고 있다는 뜻이에요.',
    ],
  },
  roe: {
    title: 'ROE (자기자본이익률)이란?',
    short: '높을수록 수익성 좋음',
    body: [
      '회사가 자기 돈으로 1년간 얼마를 벌었는지를 %로 나타내요.',
      'ROE 15% = 자기자본 100원으로 15원을 번 셈',
      '10% 이상이면 양호, 15% 이상이면 우량 기업이에요.',
    ],
  },
  rsi: {
    title: 'RSI (상대강도지수)란?',
    short: '70↑ 과매수, 30↓ 과매도',
    body: [
      '최근 14일 동안 주가가 얼마나 올랐는지/떨어졌는지를 0~100으로 나타내요.',
      '70 이상: 단기간에 많이 올라 쉬어갈 수 있어요',
      '30 이하: 많이 떨어져서 반등할 수 있어요',
      '50 부근: 보통 상태',
    ],
  },
  macd: {
    title: 'MACD (이동평균 수렴·확산)란?',
    short: '추세 전환 신호',
    body: [
      '단기 이평선과 장기 이평선의 차이로 추세 변화를 포착해요.',
      '히스토그램 양수: 매수세가 강함',
      '히스토그램 음수: 매도세가 강함',
      '0선 돌파 시 추세 전환 신호로 활용해요.',
    ],
  },
  bollinger: {
    title: '볼린저밴드란?',
    short: '하단 근접 매수, 상단 근접 매도',
    body: [
      '주가가 평균에서 얼마나 벗어났는지 보여주는 띠예요.',
      '하단 근접: 평소보다 많이 내려간 상태 (반등 가능)',
      '상단 근접: 평소보다 많이 올라간 상태 (조정 가능)',
      '%B 50% = 평균 부근',
    ],
  },
  supplyDemand: {
    title: '수급(외국인·기관)이란?',
    short: '연속 순매수는 긍정적',
    body: [
      '외국인과 기관 투자자가 주식을 사고 파는 흐름이에요.',
      '연속 순매수: 큰손들이 미래 가치를 긍정적으로 본다는 신호',
      '특히 외국인은 정보력이 높아 주가에 큰 영향을 줘요.',
      '단, 단기간 연속 매수만으로 매수 결정을 내리진 마세요.',
    ],
  },
  sma: {
    title: '이동평균선 (SMA)이란?',
    short: '추세 판단 기준선',
    body: [
      '최근 N일 종가의 평균을 이은 선이에요.',
      '5일선: 단기 추세, 20일선: 중기 추세',
      '주가가 5일선 위 = 단기 상승세',
      '5일선 > 20일선 = 정배열 (강세)',
      '5일선 < 20일선 = 역배열 (약세)',
    ],
  },
};

interface HelpBottomSheetProps {
  termKey: HelpTermKey | null;
  onClose: () => void;
}

const HelpBottomSheet = ({ termKey, onClose }: HelpBottomSheetProps) => {
  if (!termKey) return null;
  const content = HELP_CONTENTS[termKey];

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-t-3xl md:rounded-3xl p-6 max-w-md w-full space-y-4 animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{content.title}</h3>
            <p className="text-xs text-blue-400 mt-1">{content.short}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-2">
          {content.body.map((line, i) => (
            <p key={i} className="text-sm text-slate-400 leading-relaxed">{line}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
};

export default HelpBottomSheet;
