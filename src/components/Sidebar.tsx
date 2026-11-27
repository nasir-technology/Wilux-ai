import {
  Info,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { ChatSession } from '../types/chat';
import { WiluxLogo } from './WiluxLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  userName: string;
}

function formatRelativeDay(timestamp: number): string {
  const now = new Date();
  const target = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfYesterday) return 'Yesterday';
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Sidebar({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSettings,
  onOpenAbout,
  userName,
}: SidebarProps) {
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#F4F4F6] dark:bg-[#111114] border-r border-black/[0.08] dark:border-white/[0.08] w-[280px] select-none">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <WiluxLogo size={28} />
          <span className="font-display font-bold text-[15px] tracking-tight text-zinc-950 dark:text-white truncate">
            WILUX BOT
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* New Chat CTA */}
      <div className="p-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onClose();
          }}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] active:scale-[0.99] text-white text-sm font-semibold transition-all cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 wilux-scroll">
        <div className="px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          History
        </div>

        {sortedSessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-500">
            No conversations yet. Start chatting!
          </p>
        ) : (
          <div className="space-y-1">
            {sortedSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-[#8B5CF6]/15 text-[#6D28D9] dark:text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(session.id);
                      onClose();
                    }}
                    className="flex-1 min-w-0 min-h-[44px] flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer"
                  >
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[#8B5CF6]' : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {session.title || 'New chat'}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                        {formatRelativeDay(session.updatedAt)} · {session.messages.length} msg
                        {session.messages.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>

                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="min-w-[36px] min-h-[36px] mr-1 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      aria-label={`Delete chat ${session.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Navigation: Settings & About WILUX LAB */}
      <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] space-y-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
          className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <span>Settings</span>
          </span>
          {userName.trim() && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">
              {userName.trim()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenAbout();
            onClose();
          }}
          className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span>About WILUX LAB</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block h-full shrink-0">{sidebarContent}</aside>

      {/* Mobile slide-over drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full shadow-2xl">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
