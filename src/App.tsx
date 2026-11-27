import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Code2,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Menu,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  ThemeMode,
} from './types/chat';
import { WiluxLogo } from './components/WiluxLogo';
import { Sidebar } from './components/Sidebar';
import { ChatBubble } from './components/ChatBubble';
import { TypingIndicator } from './components/TypingIndicator';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';

const STORAGE_SESSIONS_KEY = 'wilux_sessions_v1';
const STORAGE_ACTIVE_KEY = 'wilux_active_session_v1';
const STORAGE_SETTINGS_KEY = 'wilux_settings_v1';
const STORAGE_THEME_KEY = 'wilux_theme';

interface PendingAttachment {
  kind: 'image' | 'document';
  name: string;
  mimeType: string;
  previewUrl?: string;
  dataUrl?: string;
  text?: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultItem>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const SUGGESTION_CHIPS = [
  {
    label: 'Teach me coding',
    prompt: 'Teach me coding from scratch step-by-step like a beginner!',
    icon: Code2,
  },
  {
    label: 'Give me business idea',
    prompt: 'Give me a sharp small business idea I can start right now with low capital.',
    icon: Briefcase,
  },
  {
    label: 'Help me with school',
    prompt: 'Help me study smarter for my exams and understand difficult topics easily.',
    icon: GraduationCap,
  },
  {
    label: 'Motivate me',
    prompt: 'Guy, motivate me today! Give me ginger to keep pushing.',
    icon: Sparkles,
  },
] as const;

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptySession(): ChatSession {
  const now = Date.now();
  return {
    id: makeId(),
    title: 'New chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function loadInitialSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return [createEmptySession()];
}

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        userName: typeof parsed.userName === 'string' ? parsed.userName : '',
        theme: parsed.theme === 'light' ? 'light' : 'dark',
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { userName: '', theme: 'dark' };
}

function deriveTitle(text: string, fallbackName?: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned) {
    return cleaned.length <= 36 ? cleaned : `${cleaned.slice(0, 36).trim()}…`;
  }
  if (fallbackName) {
    return fallbackName.length <= 36 ? fallbackName : `${fallbackName.slice(0, 36).trim()}…`;
  }
  return 'New chat';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  if (file.size <= 350 * 1024) {
    return originalDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1024;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(originalDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        resolve(originalDataUrl);
      }
    };
    img.onerror = () => resolve(originalDataUrl);
    img.src = originalDataUrl;
  });
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadInitialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (savedId) return savedId;
    } catch {
      // Ignore
    }
    return '';
  });
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);

  const [input, setInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingFirstToken, setIsWaitingFirstToken] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeModel, setActiveModel] = useState('openai/gpt-oss-20b');
  const [isListening, setIsListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const uploadMenuRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedActiveId = useMemo(() => {
    if (sessions.some((s) => s.id === activeSessionId)) {
      return activeSessionId;
    }
    return sessions[0]?.id ?? '';
  }, [sessions, activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === resolvedActiveId) ?? sessions[0],
    [sessions, resolvedActiveId]
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2600);
  }, []);

  // Apply theme to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, settings.theme);
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  // Persist sessions & active session safely (handles image quota limits gracefully)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
      if (resolvedActiveId) {
        localStorage.setItem(STORAGE_ACTIVE_KEY, resolvedActiveId);
      }
    } catch {
      try {
        const compact = sessions.map((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.attachment?.previewUrl
              ? { ...m, attachment: { ...m.attachment, previewUrl: undefined } }
              : m
          ),
        }));
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(compact));
      } catch {
        // Ignore if storage is completely full
      }
    }
  }, [sessions, resolvedActiveId]);

  // Live server health & active Groq model check
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!active) return;
        setIsOnline(res.ok);
        if (res.ok) {
          const data = (await res.json()) as { model?: string };
          if (active && typeof data.model === 'string' && data.model.trim()) {
            setActiveModel(data.model.trim());
          }
        }
      } catch {
        if (active) setIsOnline(false);
      }
    };
    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Close upload menu when tapping outside
  useEffect(() => {
    if (!isUploadMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setIsUploadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isUploadMenuOpen]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: isGenerating ? 'auto' : 'smooth',
    });
  }, [activeSession?.messages, isWaitingFirstToken, streamingMessageId, isGenerating]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const handleNewChat = () => {
    if (isGenerating) {
      abortControllerRef.current?.abort();
    }
    if (activeSession && activeSession.messages.length === 0) {
      textareaRef.current?.focus();
      return;
    }
    const fresh = createEmptySession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setInput('');
    setPendingAttachment(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSelectSession = (id: string) => {
    if (isGenerating) {
      abortControllerRef.current?.abort();
    }
    setActiveSessionId(id);
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const fresh = createEmptySession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (id === resolvedActiveId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleClearCurrentChat = () => {
    if (!activeSession) return;
    if (isGenerating) {
      abortControllerRef.current?.abort();
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: 'New chat', messages: [], updatedAt: Date.now() }
          : s
      )
    );
    setPendingAttachment(null);
    showToast('Chat cleared! Oya, fresh start.');
  };

  const handleClearAllChats = () => {
    if (isGenerating) {
      abortControllerRef.current?.abort();
    }
    const fresh = createEmptySession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setPendingAttachment(null);
    showToast('All chat history cleared!');
  };

  const handleToggleLike = (messageId: string) => {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? { ...m, liked: !m.liked } : m
              ),
            }
          : s
      )
    );
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setIsUploadMenuOpen(false);
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image too big! Please pick an image under 10 MB.');
      return;
    }

    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPendingAttachment({
        kind: 'image',
        name: file.name || 'image.jpg',
        mimeType: file.type || 'image/jpeg',
        previewUrl: dataUrl,
        dataUrl,
      });
      textareaRef.current?.focus();
    } catch {
      showToast('Could not load that image. Try another one!');
    }
  };

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setIsUploadMenuOpen(false);
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Document too big! Please pick a file under 10 MB.');
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isTxt = file.type === 'text/plain' || lowerName.endsWith('.txt');
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

    if (!isTxt && !isPdf) {
      showToast('Please choose a PDF or TXT document.');
      return;
    }

    try {
      if (isTxt) {
        const text = await file.text();
        setPendingAttachment({
          kind: 'document',
          name: file.name,
          mimeType: 'text/plain',
          text: text.slice(0, 20000),
        });
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        setPendingAttachment({
          kind: 'document',
          name: file.name,
          mimeType: 'application/pdf',
          dataUrl,
        });
      }
      textareaRef.current?.focus();
    } catch {
      showToast('Could not read that document. Try another file!');
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
    const currentAttachment = textOverride ? null : pendingAttachment;
    if ((!trimmed && !currentAttachment) || isGenerating || !activeSession) return;

    const targetSessionId = activeSession.id;
    const bubbleAttachment: ChatAttachment | undefined = currentAttachment
      ? {
          kind: currentAttachment.kind,
          name: currentAttachment.name,
          mimeType: currentAttachment.mimeType,
          previewUrl: currentAttachment.previewUrl,
        }
      : undefined;

    const displayUserText =
      trimmed ||
      (currentAttachment?.kind === 'image'
        ? `Check this image: ${currentAttachment.name}`
        : `Read this document: ${currentAttachment?.name ?? 'document'}`);

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      text: trimmed,
      attachment: bubbleAttachment,
      createdAt: Date.now(),
    };

    const previousMessages = activeSession.messages
      .filter((m) => !m.isError)
      .map((m) => ({
        role: m.role,
        text:
          m.text ||
          (m.attachment
            ? `[Uploaded ${m.attachment.kind}: ${m.attachment.name}]`
            : ''),
      }))
      .filter((m) => m.text.trim().length > 0);

    const conversationPayload = [
      ...previousMessages,
      { role: 'user' as const, text: displayUserText },
    ];

    const isFirstMessage = activeSession.messages.length === 0;
    const botMessageId = makeId();

    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              title: isFirstMessage
                ? deriveTitle(trimmed, currentAttachment?.name)
                : s.title,
              messages: [...s.messages, userMessage],
              updatedAt: Date.now(),
            }
          : s
      )
    );

    if (!textOverride) {
      setInput('');
      setPendingAttachment(null);
    }
    setIsUploadMenuOpen(false);
    setIsGenerating(true);
    setIsWaitingFirstToken(true);
    setStreamingMessageId(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let botText = '';
    let hasInsertedBotMessage = false;

    const ensureBotMessageInserted = (initialText: string, isError = false) => {
      if (hasInsertedBotMessage) return;
      hasInsertedBotMessage = true;
      setIsWaitingFirstToken(false);
      setStreamingMessageId(botMessageId);
      const botMsg: ChatMessage = {
        id: botMessageId,
        role: 'model',
        text: initialText,
        createdAt: Date.now(),
        isError,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, botMsg], updatedAt: Date.now() }
            : s
        )
      );
    };

    const updateBotMessage = (nextText: string) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === botMessageId ? { ...m, text: nextText } : m
                ),
                updatedAt: Date.now(),
              }
            : s
        )
      );
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationPayload,
          userName: settings.userName,
          attachment: currentAttachment
            ? {
                kind: currentAttachment.kind,
                name: currentAttachment.name,
                mimeType: currentAttachment.mimeType,
                dataUrl: currentAttachment.dataUrl,
                text: currentAttachment.text,
              }
            : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = 'Something went wrong while contacting Groq. Please try again.';
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) errorMsg = errJson.error;
        } catch {
          // Use fallback message
        }
        ensureBotMessageInserted(errorMsg, true);
        return;
      }

      if (!response.body) {
        ensureBotMessageInserted('No response stream received from server.', true);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() ?? '';

        for (const evt of events) {
          const lines = evt.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonRaw = line.slice(6).trim();
            if (!jsonRaw) continue;
            try {
              const payload = JSON.parse(jsonRaw) as {
                model?: string;
                text?: string;
                error?: string;
                done?: boolean;
              };

              if (payload.model) {
                setActiveModel(payload.model);
              }

              if (payload.error) {
                if (!hasInsertedBotMessage) {
                  ensureBotMessageInserted(payload.error, true);
                } else {
                  botText += `\n\n${payload.error}`;
                  updateBotMessage(botText);
                }
                return;
              }

              if (payload.text) {
                botText += payload.text;
                if (!hasInsertedBotMessage) {
                  ensureBotMessageInserted(botText, false);
                } else {
                  updateBotMessage(botText);
                }
              }
            } catch {
              // Ignore malformed partial SSE frames
            }
          }
        }
      }

      if (!hasInsertedBotMessage && !botText) {
        ensureBotMessageInserted(
          'Network blinked—please try sending that message again.',
          true
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (!hasInsertedBotMessage) {
          setIsWaitingFirstToken(false);
        }
      } else {
        const msg =
          err instanceof Error
            ? `Connection error: ${err.message}`
            : 'Network error. Check your connection and try again.';
        if (!hasInsertedBotMessage) {
          ensureBotMessageInserted(msg, true);
        } else {
          updateBotMessage(`${botText}\n\n${msg}`);
        }
      }
    } finally {
      setIsGenerating(false);
      setIsWaitingFirstToken(false);
      setStreamingMessageId(null);
      abortControllerRef.current = null;
    }
  };

  const handleToggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Voice mic is not available in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-NG';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript ?? '';
        if (transcript.trim()) {
          setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
          textareaRef.current?.focus();
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        showToast('Mic did not capture voice clearly. Try again!');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      showToast('Could not start voice input on this device.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const messages = activeSession?.messages ?? [];
  const showWelcome = messages.length === 0 && !isWaitingFirstToken;
  const canSend = Boolean(input.trim() || pendingAttachment);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#FAFAFA] dark:bg-[#0A0A0A] text-[#09090B] dark:text-[#FAFAFA]">
      {/* Hidden native file inputs for reliable mobile & desktop selection */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleImageSelected(e)}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => void handleDocumentSelected(e)}
      />

      {/* Sidebar / Menu */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={resolvedActiveId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        userName={settings.userName}
      />

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Bar */}
        <header className="h-14 px-3 sm:px-5 flex items-center justify-between gap-3 border-b border-black/[0.07] dark:border-white/[0.08] bg-[#FAFAFA]/90 dark:bg-[#0A0A0A]/90 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <WiluxLogo size={32} className="shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-bold text-base tracking-tight text-zinc-950 dark:text-white whitespace-nowrap shrink-0">
                  WILUX BOT
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{isOnline ? 'Online' : 'Reconnecting'}</span>
                </span>
                <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                  ·
                </span>
                <span
                  className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[140px] sm:max-w-[260px]"
                  title={`Brain: ${activeModel}`}
                >
                  Brain: {activeModel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            aria-label="Start new chat"
          >
            <Plus className="w-4 h-4 text-[#8B5CF6]" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </header>

        {/* Scrollable Chat Thread or Welcome Screen */}
        <main className="flex-1 overflow-y-auto wilux-scroll">
          {showWelcome ? (
            <div className="h-full flex flex-col items-center justify-center px-4 py-8">
              <div className="w-full max-w-2xl flex flex-col items-center text-center">
                <div className="mb-5 p-3 rounded-3xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/25">
                  <WiluxLogo size={52} />
                </div>

                <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-white text-balance max-w-lg">
                  Hi, I&apos;m WILUX BOT. Ask me anything!
                </h1>

                <p className="mt-2.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-md">
                  {settings.userName.trim()
                    ? `How far ${settings.userName.trim()}! Ready to gist, code, brainstorm, and solve things step-by-step.`
                    : 'Your fast, smart AI friend—ready to gist, code, brainstorm, and solve things step-by-step.'}
                </p>

                {/* 4 Suggestion Chips */}
                <div className="mt-7 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {SUGGESTION_CHIPS.map((chip) => {
                    const Icon = chip.icon;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => void sendMessage(chip.prompt)}
                        className="min-h-[52px] flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-[#141418] hover:bg-[#F4F4F8] dark:hover:bg-[#1B1B22] border border-black/[0.08] dark:border-white/[0.09] hover:border-[#8B5CF6]/50 text-left transition-all active:scale-[0.99] cursor-pointer shadow-2xs"
                      >
                        <span className="w-9 h-9 rounded-xl bg-[#8B5CF6]/12 text-[#8B5CF6] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap truncate">
                          {chip.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3.5 sm:px-6 py-5 space-y-5">
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={msg.id === streamingMessageId}
                  onToggleLike={handleToggleLike}
                  onShareFeedback={showToast}
                />
              ))}

              {isWaitingFirstToken && <TypingIndicator />}

              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </main>

        {/* Bottom Chat Input Bar */}
        <footer className="px-3 sm:px-6 pb-3 pt-2 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA] to-transparent dark:from-[#0A0A0A] dark:via-[#0A0A0A] shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Selected File Preview above input box */}
            {pendingAttachment && (
              <div className="inline-flex items-center gap-2.5 max-w-full p-2 pr-2.5 rounded-2xl bg-white dark:bg-[#141418] border border-black/[0.1] dark:border-white/[0.12] shadow-sm">
                {pendingAttachment.kind === 'image' && pendingAttachment.previewUrl ? (
                  <img
                    src={pendingAttachment.previewUrl}
                    alt={pendingAttachment.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover shrink-0 border border-black/[0.08] dark:border-white/[0.1]"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                )}

                <div className="min-w-0 max-w-[190px] sm:max-w-[280px]">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {pendingAttachment.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {pendingAttachment.kind === 'image' ? 'Image ready' : 'Document ready'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="relative flex items-end gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-3xl bg-white dark:bg-[#141418] border border-black/[0.1] dark:border-white/[0.12] focus-within:border-[#8B5CF6] shadow-sm transition-colors">
              {/* Upload Button + Popover Menu */}
              <div ref={uploadMenuRef} className="relative shrink-0">
                {isUploadMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Upload options"
                    className="absolute bottom-14 left-0 z-30 w-56 rounded-2xl bg-white dark:bg-[#18181E] border border-black/[0.08] dark:border-white/[0.12] shadow-xl p-1.5 space-y-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">Image</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                          Photo or screenshot
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => docInputRef.current?.click()}
                      className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">Document</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                          PDF or TXT file
                        </span>
                      </span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsUploadMenuOpen((prev) => !prev)}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer shrink-0 ${
                    isUploadMenuOpen || pendingAttachment
                      ? 'bg-[#8B5CF6]/15 text-[#8B5CF6]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  aria-label="Upload image or document"
                  aria-expanded={isUploadMenuOpen}
                  aria-haspopup="menu"
                  title="Upload image or document"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleMic}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-red-500/15 text-red-500 animate-pulse'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                title={isListening ? 'Listening... tap to stop' : 'Voice input'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Listening... speak now' : 'Ask WILUX BOT anything...'}
                className="flex-1 min-h-[44px] max-h-[140px] py-2.5 px-1 bg-transparent text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-none focus:outline-none wilux-scroll"
                aria-label="Message WILUX BOT"
              />

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  aria-label="Stop generating"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!canSend}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-all shrink-0 ${
                    canSend
                      ? 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white cursor-pointer active:scale-95 shadow-xs'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </footer>

        {/* Non-blocking Toast Feedback */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium shadow-lg whitespace-nowrap"
          >
            {toast}
          </div>
        )}
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveName={(userName) => {
          setSettings((prev) => ({ ...prev, userName }));
          showToast(userName ? `Sharp! I go call you ${userName}.` : 'Name cleared!');
        }}
        onChangeTheme={(theme: ThemeMode) =>
          setSettings((prev) => ({ ...prev, theme }))
        }
        onClearCurrentChat={handleClearCurrentChat}
        onClearAllChats={handleClearAllChats}
      />

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
}
