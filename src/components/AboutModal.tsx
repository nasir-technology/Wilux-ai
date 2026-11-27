import { Code2, MessageCircleHeart, Sparkles, X } from 'lucide-react';
import { WiluxLogo } from './WiluxLogo';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#141418] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 id="about-title" className="font-display text-lg font-bold text-zinc-950 dark:text-white">
            About WILUX LAB
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close about modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3.5">
            <WiluxLogo size={48} />
            <div>
              <div className="font-display text-lg font-bold text-zinc-950 dark:text-white">
                WILUX BOT
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Built by WILUX LAB · Port Harcourt, Nigeria
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            WILUX LAB creates fast, human-friendly AI tools designed for everyday builders,
            students, and hustlers. WILUX BOT brings smart answers with real Port Harcourt
            warmth—explaining tough topics step-by-step without stress.
          </p>

          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                <MessageCircleHeart className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Pidgin + English Mix
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Talks like a smart friend from PH—never stiff, always encouraging.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                <Code2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Code Ready
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Clean syntax-formatted code blocks with one-tap Copy buttons.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Visual Imagination
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Ask for any image and get rich, detailed visual descriptions.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Oya, back to chat
          </button>
        </div>
      </div>
    </div>
  );
}
