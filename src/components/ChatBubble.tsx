import { useState } from 'react';
import { Check, Copy, FileText, Share2, ThumbsUp } from 'lucide-react';
import type { ChatMessage } from '../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { WiluxLogo } from './WiluxLogo';

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onToggleLike: (messageId: string) => void;
  onShareFeedback: (msg: string) => void;
}

export function ChatBubble({
  message,
  isStreaming = false,
  onToggleLike,
  onShareFeedback,
}: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'WILUX BOT Reply',
          text: message.text,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await handleCopy();
    onShareFeedback('Reply copied so you can share am sharp sharp!');
  };

  if (isUser) {
    const attachment = message.attachment;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-[#8B5CF6] text-white px-4 py-3 shadow-sm space-y-2">
          {attachment?.kind === 'image' && attachment.previewUrl && (
            <div className="overflow-hidden rounded-xl border border-white/20 bg-black/15">
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                referrerPolicy="no-referrer"
                className="max-h-64 w-auto max-w-full object-contain rounded-xl"
              />
            </div>
          )}

          {attachment?.kind === 'document' && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/15 border border-white/20 text-xs font-medium">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[200px] sm:max-w-[260px]">{attachment.name}</span>
            </div>
          )}

          {message.text.trim().length > 0 && (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {message.text}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 sm:gap-3 group">
      <div className="shrink-0 mt-0.5">
        <WiluxLogo size={30} />
      </div>

      <div className="min-w-0 max-w-[88%] sm:max-w-[80%] flex flex-col gap-1.5">
        <div
          className={`rounded-2xl rounded-tl-sm px-4 py-3 border ${
            message.isError
              ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
              : 'bg-[#EFEFF2] dark:bg-[#1C1C21] border-black/[0.06] dark:border-white/[0.08]'
          }`}
        >
          {message.isError ? (
            <p className="text-[15px] leading-relaxed">{message.text}</p>
          ) : (
            <MarkdownRenderer content={message.text} />
          )}
        </div>

        {!isStreaming && message.text.trim().length > 0 && !message.isError && (
          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Copy reply"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Share reply"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleLike(message.id)}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                message.liked
                  ? 'text-[#8B5CF6] bg-[#8B5CF6]/12'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07]'
              }`}
              aria-label={message.liked ? 'Unlike reply' : 'Like reply'}
              aria-pressed={Boolean(message.liked)}
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${message.liked ? 'fill-[#8B5CF6]' : ''}`} />
              <span>{message.liked ? 'Liked' : 'Like'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
