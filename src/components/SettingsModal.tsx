import { useEffect, useState } from 'react';
import { Check, Moon, Sun, Trash2, User, X } from 'lucide-react';
import type { AppSettings, ThemeMode } from '../types/chat';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveName: (name: string) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onClearCurrentChat: () => void;
  onClearAllChats: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveName,
  onChangeTheme,
  onClearCurrentChat,
  onClearAllChats,
}: SettingsModalProps) {
  const [nameInput, setNameInput] = useState(settings.userName);
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNameInput(settings.userName);
      setSavedNotice(false);
      setConfirmClearAll(false);
    }
  }, [isOpen, settings.userName]);

  if (!isOpen) return null;

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveName(nameInput.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#141418] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 id="settings-title" className="font-display text-lg font-bold text-zinc-950 dark:text-white">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Change Name */}
          <form onSubmit={handleNameSubmit} className="space-y-2">
            <label
              htmlFor="wilux-user-name"
              className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              <User className="w-4 h-4 text-[#8B5CF6]" />
              <span>Your Name</span>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              WILUX BOT go use this name hail you inside chat.
            </p>
            <div className="flex gap-2">
              <input
                id="wilux-user-name"
                type="text"
                maxLength={40}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Chidi, Ada, Tunde..."
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#F4F4F6] dark:bg-[#1C1C22] border border-black/[0.08] dark:border-white/[0.1] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              >
                {savedNotice ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </form>

          {/* Theme Switch */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Appearance
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F4F4F6] dark:bg-[#1C1C22] border border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-[#8B5CF6] text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-[#8B5CF6] text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light</span>
              </button>
            </div>
          </div>

          {/* Clear Chat */}
          <div className="space-y-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Chat Data
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearCurrentChat();
                  onClose();
                }}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 rounded-xl bg-[#F4F4F6] dark:bg-[#1C1C22] hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-sm font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-zinc-500" />
                <span>Clear current chat</span>
              </button>

              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors cursor-pointer"
                >
                  <span>Clear all history</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClearAllChats();
                    onClose();
                  }}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span>Confirm clear all</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
