export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as const;

function sanitizeEnvKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

export function getGroqApiKey(): string {
  const viteKey = sanitizeEnvKey(import.meta.env.VITE_GROQ_API_KEY);
  if (viteKey && viteKey !== 'MY_GROQ_API_KEY') {
    return viteKey;
  }
  const groqKey = sanitizeEnvKey(import.meta.env.GROQ_API_KEY);
  if (groqKey && groqKey !== 'MY_GROQ_API_KEY') {
    return groqKey;
  }
  return '';
}

export async function extractPdfTextFromFile(file: File): Promise<string> {
  const { extractText } = await import('unpdf');
  const arrayBuffer = await file.arrayBuffer();
  const result = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
  return (result.text ?? '').trim();
}

export interface GroqMessageItem {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamGroqOptions {
  apiKey: string;
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userText: string;
  userName?: string;
  attachment?: {
    kind: 'image' | 'document';
    name: string;
    mimeType: string;
    dataUrl?: string;
    text?: string;
  };
  signal: AbortSignal;
  onModelChange: (model: string) => void;
  onStatusMessage: (message: string) => void;
  onToken: (fullTextSoFar: string) => void;
}

export class GroqUserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroqUserFacingError';
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      return parsed?.error?.message || raw;
    } catch {
      return raw;
    }
  } catch {
    return '';
  }
}

async function executeGroqRequest(
  apiKey: string,
  model: string,
  messages: GroqMessageItem[],
  stream: boolean,
  signal: AbortSignal
): Promise<Response> {
  return fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
    }),
    signal,
  });
}

async function consumeGroqResponse(
  response: Response,
  onToken: (fullText: string) => void
): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || !response.body) {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const fullText = data.choices?.[0]?.message?.content ?? '';
    if (fullText) {
      onToken(fullText);
    }
    return fullText;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };

        if (parsed.error?.message) {
          console.error('Groq stream error:', parsed.error.message);
          throw new GroqUserFacingError('Groq had a temporary issue. Please try again.');
        }

        const chunk = parsed.choices?.[0]?.delta?.content ?? '';
        if (chunk) {
          accumulated += chunk;
          onToken(accumulated);
        }
      } catch (err) {
        if (err instanceof GroqUserFacingError) throw err;
        // Ignore partial SSE JSON
      }
    }
  }

  return accumulated;
}

async function tryLocalServerFallback(options: StreamGroqOptions): Promise<string | null> {
  const { history, userText, userName, attachment, signal, onModelChange, onToken } = options;

  try {
    const serverMessages = [
      ...history.map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        text: m.content,
      })),
      { role: 'user' as const, text: userText },
    ];

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: serverMessages,
        userName,
        attachment,
      }),
      signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
      return null;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let accumulated = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() ?? '';

      for (const evt of events) {
        for (const line of evt.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const payload = JSON.parse(raw) as {
              model?: string;
              text?: string;
              error?: string;
            };
            if (payload.model) onModelChange(payload.model);
            if (payload.error) {
              console.error('Server proxy Groq error:', payload.error);
              return null;
            }
            if (payload.text) {
              accumulated += payload.text;
              onToken(accumulated);
            }
          } catch {
            // Ignore partial frame
          }
        }
      }
    }

    return accumulated || null;
  } catch {
    return null;
  }
}

export async function streamGroqWithFallback(options: StreamGroqOptions): Promise<string> {
  const {
    apiKey,
    systemPrompt,
    history,
    userText,
    attachment,
    signal,
    onModelChange,
    onStatusMessage,
    onToken,
  } = options;

  let finalUserContent = userText;

  if (attachment?.kind === 'document') {
    const safeName = attachment.name || 'document';
    const docText = (attachment.text ?? '').trim();
    finalUserContent = docText
      ? [
          `The user uploaded a document named "${safeName}".`,
          'Here is the text inside the document:',
          '"""',
          docText.slice(0, 14000),
          '"""',
          '',
          userText
            ? `User question: ${userText}`
            : 'Please summarize this document and explain the key points.',
        ].join('\n')
      : [
          `The user uploaded a document named "${safeName}", but no readable text was found inside.`,
          `Start your reply by saying "I can see your file" and answer helpfully based on the file name "${safeName}" and the message: "${userText || 'Please review this document.'}".`,
        ].join('\n');
  } else if (attachment?.kind === 'image') {
    const safeName = attachment.name || 'image';
    const question = userText || 'Please describe this image in detail.';
    // openai/gpt-oss-20b and openai/gpt-oss-120b accept string content only,
    // so respond seamlessly with "I can see your file" without triggering a 400 error.
    finalUserContent = [
      `The user uploaded an image file named "${safeName}".`,
      `Start your response by saying "I can see your file" and answer helpfully based on the file name "${safeName}" and the user's message: "${question}".`,
    ].join('\n');
  }

  const messages: GroqMessageItem[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role,
      content: String(m.content),
    })),
    { role: 'user', content: finalUserContent },
  ];

  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[i];
    onModelChange(model);

    let res: Response;
    try {
      res = await executeGroqRequest(apiKey, model, messages, true, signal);
    } catch (firstFetchErr) {
      if (firstFetchErr instanceof Error && firstFetchErr.name === 'AbortError') {
        throw firstFetchErr;
      }
      console.warn('Direct streaming fetch failed, retrying non-streaming:', firstFetchErr);
      try {
        res = await executeGroqRequest(apiKey, model, messages, false, signal);
      } catch (secondFetchErr) {
        if (secondFetchErr instanceof Error && secondFetchErr.name === 'AbortError') {
          throw secondFetchErr;
        }
        console.error('Direct Groq fetch failed:', secondFetchErr);
        const proxyReply = await tryLocalServerFallback(options);
        if (proxyReply) {
          return proxyReply;
        }
        throw new GroqUserFacingError(
          'Could not connect to Groq right now. Please check your internet connection and try again.'
        );
      }
    }

    if (res.ok) {
      return consumeGroqResponse(res, onToken);
    }

    const errBody = await readErrorBody(res);
    console.error(`Groq API error (${model}, status ${res.status}):`, errBody);

    if (res.status === 401) {
      throw new GroqUserFacingError('API Key is wrong');
    }

    if ((res.status === 400 || res.status === 404) && i < GROQ_MODELS.length - 1) {
      onStatusMessage('Model not available, trying another model');
      continue;
    }

    if (res.status === 400 || res.status === 404) {
      throw new GroqUserFacingError('Model not available, trying another model');
    }

    throw new GroqUserFacingError('Groq is temporarily unavailable. Please try again.');
  }

  throw new GroqUserFacingError('Model not available, trying another model');
}
