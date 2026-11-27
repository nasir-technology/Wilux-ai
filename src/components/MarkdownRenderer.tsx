import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
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

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-[#121216] text-[#F4F4F5]">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#1A1A20] border-b border-white/10">
        <span className="font-mono-code text-xs text-zinc-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono-code text-zinc-100 wilux-scroll">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches `code`, **bold**, *italic*, or [label](url)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="font-mono-code text-[0.875em] px-1.5 py-0.5 rounded-md bg-black/[0.07] dark:bg-white/[0.1] text-[#6D28D9] dark:text-[#C4B5FD]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-zinc-950 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const safeHref = sanitizeUrl(linkMatch[2]);
        if (safeHref) {
          nodes.push(
            <a
              key={`a-${keyIdx++}`}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[#8B5CF6]/60 underline-offset-2 text-[#7C3AED] dark:text-[#A78BFA] hover:text-[#8B5CF6]"
            >
              {linkMatch[1]}
            </a>
          );
        } else {
          nodes.push(linkMatch[1]);
        }
      } else {
        nodes.push(token);
      }
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderTextSegment(segment: string, baseKey: string): ReactNode[] {
  const lines = segment.split('\n');
  const elements: ReactNode[] = [];
  let listItems: { ordered: boolean; items: string[] } | null = null;
  let blockIndex = 0;

  const flushList = () => {
    if (!listItems) return;
    const Tag = listItems.ordered ? 'ol' : 'ul';
    elements.push(
      <Tag
        key={`${baseKey}-list-${blockIndex++}`}
        className={`my-2 space-y-1.5 pl-5 ${
          listItems.ordered ? 'list-decimal' : 'list-disc'
        } marker:text-[#8B5CF6]`}
      >
        {listItems.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInline(item)}
          </li>
        ))}
      </Tag>
    );
    listItems = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const headingClass =
        level === 1
          ? 'text-base sm:text-lg font-bold mt-3 mb-1.5 text-zinc-950 dark:text-white'
          : 'text-[15px] font-semibold mt-2.5 mb-1 text-zinc-950 dark:text-white';
      elements.push(
        <div key={`${baseKey}-h-${blockIndex++}`} className={headingClass}>
          {renderInline(headingText)}
        </div>
      );
      continue;
    }

    // Unordered list
    const ulMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (!listItems || listItems.ordered) {
        flushList();
        listItems = { ordered: false, items: [] };
      }
      listItems.items.push(ulMatch[1]);
      continue;
    }

    // Ordered list
    const olMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (!listItems || !listItems.ordered) {
        flushList();
        listItems = { ordered: true, items: [] };
      }
      listItems.items.push(olMatch[1]);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`${baseKey}-p-${blockIndex++}`} className="leading-relaxed my-1.5 first:mt-0 last:mb-0">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Split into alternating text and fenced code blocks (supports unclosed blocks while streaming)
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const lines = content.split('\n');
  let inCode = false;
  let currentLang = '';
  let buffer: string[] = [];

  for (const line of lines) {
    const fenceMatch = /^```([a-zA-Z0-9_+-]*)\s*$/.exec(line.trim());
    if (fenceMatch && !inCode) {
      if (buffer.length > 0) {
        parts.push({ type: 'text', content: buffer.join('\n') });
        buffer = [];
      }
      inCode = true;
      currentLang = fenceMatch[1] || '';
    } else if (line.trim() === '```' && inCode) {
      parts.push({ type: 'code', content: buffer.join('\n'), lang: currentLang });
      buffer = [];
      inCode = false;
      currentLang = '';
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length > 0) {
    if (inCode) {
      parts.push({ type: 'code', content: buffer.join('\n'), lang: currentLang });
    } else {
      parts.push({ type: 'text', content: buffer.join('\n') });
    }
  }

  return (
    <div className="text-[15px] text-zinc-800 dark:text-zinc-100 break-words">
      {parts.map((part, idx) =>
        part.type === 'code' ? (
          <CodeBlock key={`code-${idx}`} language={part.lang ?? ''} code={part.content} />
        ) : (
          <div key={`txt-${idx}`}>{renderTextSegment(part.content, `seg-${idx}`)}</div>
        )
      )}
    </div>
  );
}
