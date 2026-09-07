import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { DesignFormat } from './formatConstants';

interface FormatCardProps {
  format: DesignFormat;
  onClick: () => void;
}

const FormatCard: React.FC<FormatCardProps> = ({ format, onClick }) => {
  const Icon = format.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-[#13131d] px-3 py-2.5 text-left transition-all hover:border-[rgba(139,92,246,0.45)] hover:bg-[#181826] hover:shadow-md hover:shadow-black/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400/40"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: `${format.accent}18`,
          border: `1px solid ${format.accent}35`,
        }}
      >
        <Icon className="h-4 w-4" style={{ color: format.accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-[#F0F0F5]">{format.name}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-[#71717F]">
          {format.width} × {format.height}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-[#5A5A6A]">{format.description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#4A4A5A] transition-colors group-hover:text-[#C4B5FD]" />
    </button>
  );
};

export default FormatCard;
