import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText } from 'unpdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Strict model chain requested: openai/gpt-oss-20b with fallback to openai/gpt-oss-120b
const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as const;

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
}

interface IncomingAttachment {
  kind: 'image' | 'document';
  name: string;
  mimeType: string;
  dataUrl?: string;
  text?: string;
}

interface ChatRequestBody {
  messages?: IncomingMessage[];
  userName?: string;
  attachment?: IncomingAttachment;
}

interface GroqDeltaChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

let activeModelCache: string = GROQ_MODELS[0];

function getGroqApiKey(): string | null {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GROQ_API_KEY') {
    return null;
  }
  return apiKey;
}

function buildSystemInstruction(userName?: string): string {
  const safeName = userName?.trim().slice(0, 40);
  if (safeName) {
    return `You are WILUX AI, a fast, smart and helpful AI assistant. The user's name is ${safeName}.`;
  }
  return 'You are WILUX AI, a fast, smart and helpful AI assistant.';
}

async function extractPdfTextFromDataUrl(dataUrl: string): Promise<string> {
  const commaIdx = dataUrl.indexOf(',');
  const base64Part = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const buffer = Buffer.from(base64Part, 'base64');
  const result = await extractText(new Uint8Array(buffer), { mergePages: true });
  return (result.text ?? '').trim();
}

function isModelUnavailableError(status: number, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    status === 404 ||
    lower.includes('model_not_found') ||
    lower.includes('model_decommissioned') ||
    lower.includes('does not exist') ||
    lower.includes('not available') ||
    lower.includes('decommissioned') ||
    lower.includes('not found') ||
    lower.includes('access')
  );
}

async function callGroqStream(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }>,
  signal: AbortSignal
): Promise<{
  response: globalThis.Response | null;
  modelUsed: string;
  errorStatus: number;
  errorMessage: string;
}> {
  let lastErrorStatus = 502;
  let lastErrorMessage = 'Could not reach Groq chat completions.';

  for (const model of GROQ_MODELS) {
    if (signal.aborted) {
      return { response: null, modelUsed: model, errorStatus: 499, errorMessage: 'Aborted' };
    }

    const attemptRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.6,
        max_tokens: 1024,
        reasoning_effort: 'low',
      }),
      signal,
    });

    if (attemptRes.ok && attemptRes.body) {
      activeModelCache = model;
      return {
        response: attemptRes,
        modelUsed: model,
        errorStatus: 200,
        errorMessage: '',
      };
    }

    lastErrorStatus = attemptRes.status;
    try {
      const errJson = (await attemptRes.json()) as { error?: { message?: string } };
      lastErrorMessage = errJson?.error?.message || `Groq API error (${attemptRes.status}).`;
    } catch {
      lastErrorMessage = `Groq API error (${attemptRes.status}).`;
    }

    if (!isModelUnavailableError(attemptRes.status, lastErrorMessage)) {
      return {
        response: null,
        modelUsed: model,
        errorStatus: lastErrorStatus,
        errorMessage: lastErrorMessage,
      };
    }
  }

  return {
    response: null,
    modelUsed: GROQ_MODELS[0],
    errorStatus: lastErrorStatus,
    errorMessage: lastErrorMessage,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const apiKey = getGroqApiKey();
    res.json({
      status: 'online',
      configured: Boolean(apiKey),
      provider: 'groq',
      model: activeModelCache,
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      res.status(503).json({
        error:
          'Groq API key is not configured yet. Please add GROQ_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as ChatRequestBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const attachment = body.attachment;

    const validMessages = rawMessages
      .filter(
        (m): m is IncomingMessage =>
          Boolean(m) &&
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          m.text.trim().length > 0
      )
      .slice(-16)
      .map((m) => ({
        role: m.role,
        text: m.text.slice(0, 8000),
      }));

    if (validMessages.length === 0 && !attachment) {
      res.status(400).json({ error: 'Please send a message or attach a file.' });
      return;
    }

    const userName = typeof body.userName === 'string' ? body.userName : undefined;
    const systemPrompt = buildSystemInstruction(userName);

    const priorHistory =
      validMessages.length > 0
        ? validMessages.slice(0, -1).map((m) => ({
            role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
            content: m.text,
          }))
        : [];

    const latestUserText =
      validMessages.length > 0 ? validMessages[validMessages.length - 1].text : '';

    const upstreamAbort = new AbortController();
    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        upstreamAbort.abort();
      }
    });

    try {
      let chosenModel: string = GROQ_MODELS[0];
      let workingResponse: globalThis.Response | null = null;
      let lastErrorStatus = 502;
      let lastErrorMessage = 'Could not reach Groq chat completions.';

      if (attachment?.kind === 'document') {
        const safeFileName = (attachment.name || 'document').slice(0, 120);
        let docText = (attachment.text ?? '').trim();

        if (!docText && attachment.dataUrl) {
          try {
            docText = await extractPdfTextFromDataUrl(attachment.dataUrl);
          } catch (pdfErr) {
            console.warn('PDF text extraction fallback triggered:', pdfErr);
            docText = '';
          }
        }

        const promptWithDoc = docText
          ? [
              `The user uploaded a document named "${safeFileName}".`,
              'Here is the extracted text content of the document:',
              '"""',
              docText.slice(0, 14000),
              '"""',
              '',
              latestUserText
                ? `User message: ${latestUserText}`
                : 'Please read this document, summarize the key points clearly, and ask how you can help further.',
            ].join('\n')
          : [
              `The user uploaded a document file named "${safeFileName}".`,
              `Begin your response by saying "I can see your file" and helpfully answer based on the file name "${safeFileName}" and the user's message: "${latestUserText || 'Please review this document.'}".`,
            ].join('\n');

        const docMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...priorHistory,
          { role: 'user' as const, content: promptWithDoc },
        ];

        const result = await callGroqStream(apiKey, docMessages, upstreamAbort.signal);
        workingResponse = result.response;
        chosenModel = result.modelUsed;
        lastErrorStatus = result.errorStatus;
        lastErrorMessage = result.errorMessage;
      } else if (attachment?.kind === 'image') {
        const safeImageName = (attachment.name || 'image').slice(0, 120);
        const promptText =
          latestUserText || 'Please describe this image in detail and explain what you see.';

        const fallbackTextPrompt = [
          `The user uploaded an image file named "${safeImageName}".`,
          `Start your response by saying "I can see your file" (mentioning "${safeImageName}") and respond helpfully based on the file name and the user's message: "${promptText}".`,
        ].join('\n');

        const imageTextMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...priorHistory,
          { role: 'user' as const, content: fallbackTextPrompt },
        ];

        const result = await callGroqStream(apiKey, imageTextMessages, upstreamAbort.signal);
        workingResponse = result.response;
        chosenModel = result.modelUsed;
        lastErrorStatus = result.errorStatus;
        lastErrorMessage = result.errorMessage;
      } else {
        const textMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...priorHistory,
          { role: 'user' as const, content: latestUserText },
        ];

        const result = await callGroqStream(apiKey, textMessages, upstreamAbort.signal);
        workingResponse = result.response;
        chosenModel = result.modelUsed;
        lastErrorStatus = result.errorStatus;
        lastErrorMessage = result.errorMessage;
      }

      if (!workingResponse || !workingResponse.body) {
        if (!closed) {
          res.status(lastErrorStatus).json({ error: lastErrorMessage });
        }
        return;
      }

      res.socket?.setNoDelay?.(true);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      res.write(`data: ${JSON.stringify({ model: chosenModel })}\n\n`);

      const reader = workingResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done || closed) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          if (dataStr === '[DONE]') {
            if (!closed) {
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              res.end();
            }
            return;
          }

          try {
            const parsed = JSON.parse(dataStr) as GroqDeltaChunk;
            if (parsed.error?.message) {
              if (!closed) {
                res.write(`data: ${JSON.stringify({ error: parsed.error.message })}\n\n`);
                res.end();
              }
              return;
            }
            const textChunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (textChunk && !closed) {
              res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
            }
          } catch {
            // Ignore partial JSON frames
          }
        }
      }

      if (!closed) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Something went wrong while contacting Groq.';
      console.error('Groq chat error:', err);
      if (!closed) {
        if (!res.headersSent) {
          res.status(500).json({ error: message });
        } else {
          res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
          res.end();
        }
      }
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WILUX BOT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
