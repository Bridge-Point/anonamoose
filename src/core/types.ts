export interface PIIDetection {
  type: 'dictionary' | 'regex' | 'names' | 'ner';
  category: string;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface RedactionResult {
  redactedText: string;
  tokens: Map<string, string>;
  rehydrationKey: string;
  detectedPII: PIIDetection[];
}

export interface RedactionConfig {
  enableDictionary: boolean;
  enableRegex: boolean;
  enableNames: boolean;
  enableNER: boolean;
  nerModel: string;
  nerMinConfidence: number;
  locale: string | null;
  tokenizePlaceholders: boolean;
  placeholderPrefix: string;
  placeholderSuffix: string;
}

export interface DictionaryEntry {
  id: string;
  term: string;
  replacement?: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  enabled: boolean;
  createdAt: Date;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface ProxyConfig {
  port: number;
  managementPort: number;
  openaiKey?: string;
  anthropicKey?: string;
  dbPath?: string;
}
