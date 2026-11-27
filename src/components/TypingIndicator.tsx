import { WiluxLogo } from './WiluxLogo';

export function TypingIndicator() {
  return (
    <div
      className="flex items-start gap-2.5 sm:gap-3"
      role="status"
      aria-label="WILUX AI is thinking..."
    >
      <div className="shrink-0 mt-0.5">
        <WiluxLogo size={30} />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-[#EFEFF2] dark:bg-[#1C1C21] px-4 py-3 border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2.5">
        <span className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300">
          WILUX AI is thinking...
        </span>
        <div className="flex items-center gap-1 h-4" aria-hidden="true">
          <span className="wilux-dot-1 w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
          <span className="wilux-dot-2 w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
          <span className="wilux-dot-3 w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
        </div>
      </div>
    </div>
  );
}
