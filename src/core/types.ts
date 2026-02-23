export interface PIIDetection {
  type: 'dictionary' | 'regex' | 'ner';
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
  enableNER: boolean;
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
  redisUrl?: string;
}

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  enableDictionary: true,
  enableRegex: true,
  enableNER: true, // Transformer model loads lazily on first NER call
  tokenizePlaceholders: true,
  placeholderPrefix: '\uE000',
  placeholderSuffix: '\uE001'
};
