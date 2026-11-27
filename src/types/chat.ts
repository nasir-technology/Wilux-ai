export type MessageRole = 'user' | 'model';

export interface ChatAttachment {
  kind: 'image' | 'document';
  name: string;
  mimeType: string;
  previewUrl?: string;
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  attachment?: ChatAttachment;
  liked?: boolean;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  createdAt: number;
}

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  userName: string;
  theme: ThemeMode;
}
