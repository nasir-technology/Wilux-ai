export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as const;

export function getGroqApiKey(): string {
  const viteKey = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim();
  if (viteKey && viteKey !== 'MY_GROQ_API_KEY') {
    return viteKey;
  }
  const groqKey = (import.meta.env.GROQ_API_KEY as string | undefined)?.trim();
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
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

export interface StreamGroqOptions {
  apiKey: string;
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userText: string;
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
      stream: true,
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

  let textMessages: GroqMessageItem[];
  let multimodalMessages: GroqMessageItem[] | null = null;

  if (attachment?.kind === 'document') {
    const safeName = attachment.name || 'document';
    const docText = (attachment.text ?? '').trim();
    const docPrompt = docText
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

    textMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: docPrompt },
    ];
  } else if (attachment?.kind === 'image') {
    const safeName = attachment.name || 'image';
    const question = userText || 'Please describe this image in detail.';

    if (attachment.dataUrl) {
      multimodalMessages = [
        { role: 'system', content: systemPrompt },
        ...history,
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: attachment.dataUrl } },
          ],
        },
      ];
    }

    const fallbackPrompt = [
      `The user uploaded an image file named "${safeName}".`,
      `Start your response by saying "I can see your file" and answer helpfully based on the file name "${safeName}" and the user's message: "${question}".`,
    ].join('\n');

    textMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: fallbackPrompt },
    ];
  } else {
    textMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText },
    ];
  }

  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[i];
    onModelChange(model);

    // If image attachment is present, try multimodal payload first
    if (multimodalMessages) {
      const visionRes = await executeGroqRequest(apiKey, model, multimodalMessages, signal);
      if (visionRes.ok) {
        return consumeGroqResponse(visionRes, onToken);
      }

      const visionErrBody = await readErrorBody(visionRes);
      console.error(`Groq vision attempt failed (${model}, status ${visionRes.status}):`, visionErrBody);

      if (visionRes.status === 401) {
        throw new GroqUserFacingError('API Key is wrong');
      }

      // If vision is unsupported (400/404/422), seamlessly fall back to text ("I can see your file") on the same model
      if (visionRes.status === 400 || visionRes.status === 404 || visionRes.status === 422) {
        const textFallbackRes = await executeGroqRequest(apiKey, model, textMessages, signal);
        if (textFallbackRes.ok) {
          return consumeGroqResponse(textFallbackRes, onToken);
        }

        const fallbackErrBody = await readErrorBody(textFallbackRes);
        console.error(
          `Groq fallback attempt failed (${model}, status ${textFallbackRes.status}):`,
          fallbackErrBody
        );

        if (textFallbackRes.status === 401) {
          throw new GroqUserFacingError('API Key is wrong');
        }
        if (
          (textFallbackRes.status === 400 || textFallbackRes.status === 404) &&
          i < GROQ_MODELS.length - 1
        ) {
          onStatusMessage('Model not available, trying another model');
          continue;
        }
        if (textFallbackRes.status === 400 || textFallbackRes.status === 404) {
          throw new GroqUserFacingError('Model not available, trying another model');
        }
        throw new GroqUserFacingError('Could not get a response from Groq. Please try again.');
      }

      throw new GroqUserFacingError('Could not get a response from Groq. Please try again.');
    }

    const res = await executeGroqRequest(apiKey, model, textMessages, signal);
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
