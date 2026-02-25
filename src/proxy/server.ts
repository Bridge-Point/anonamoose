import { timingSafeEqual } from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import type { ProxyConfig, ChatMessage, RedactionConfig } from '../core/types.js';
import { RedactionPipeline } from '../core/redaction/pipeline.js';
import { DictionaryService } from '../core/redaction/dictionary.js';
import { DEFAULT_REDACTION_CONFIG } from '../core/types.js';
import { RehydrationStore } from '../core/rehydration/store.js';

// Max age for in-memory sessionTokens entries (1 hour)
const SESSION_TOKEN_TTL_MS = 60 * 60 * 1000;

interface SessionTokenEntry {
  tokens: Map<string, string>;
  createdAt: number;
}

export class ProxyServer {
  private app: express.Application;
  private redactionPipeline: RedactionPipeline;
  private rehydrationStore: RehydrationStore;
  private sessionTokens: Map<string, SessionTokenEntry> = new Map();
  private sessionCleanupTimer: ReturnType<typeof setInterval>;
  private stats = {
    requestsRedacted: 0,
    requestsHydrated: 0,
    piiDetected: 0,
    dictionaryHits: 0,
    regexHits: 0,
    nerHits: 0
  };

  constructor(
    private config: ProxyConfig,
    redactionConfig: RedactionConfig = DEFAULT_REDACTION_CONFIG
  ) {
    this.app = express();
    this.rehydrationStore = new RehydrationStore(config.redisUrl);

    const dictionary = new DictionaryService();
    this.redactionPipeline = new RedactionPipeline(dictionary, redactionConfig);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();

    // Periodically clean up expired sessionTokens entries
    this.sessionCleanupTimer = setInterval(() => this.cleanupSessionTokens(), 5 * 60 * 1000);
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || false,
    }));
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }));
  }

  private setupErrorHandler(): void {
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      console.error('Error:', err.message);
      res.status(500).json({
        error: {
          message: 'Internal server error',
          type: 'internal_error'
        }
      });
    });
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still do a comparison to avoid leaking length info via timing
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  private isAuthenticated(req: Request): boolean {
    const apiToken = process.env.API_TOKEN;
    if (!apiToken) {
      return false;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    return this.safeCompare(token, apiToken);
  }

  private isStatsAuthenticated(req: Request): boolean {
    const statsToken = process.env.STATS_TOKEN;
    if (!statsToken) return false;

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    return this.safeCompare(token, statsToken);
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.post('/v1/chat/completions', (req: Request, res: Response) => {
      this.handleOpenAI(req, res).catch((err) => {
        console.error('OpenAI handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    this.app.post('/v1/messages', (req: Request, res: Response) => {
      this.handleAnthropic(req, res).catch((err) => {
        console.error('Anthropic handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    // Redaction endpoint — requires auth
    this.app.post('/api/v1/redact', (req: Request, res: Response) => {
      if (!this.isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      this.handleRedact(req, res).catch((err) => {
        console.error('Redact handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    this.setupManagementAPI();
  }

  private setupManagementAPI(): void {
    const api = express.Router();

    // Protected routes — require API_TOKEN (stats endpoints use their own auth)
    api.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/stats' || req.path === '/stats/public') {
        next();
        return;
      }
      if (!this.isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });

    api.get('/dictionary', (req: Request, res: Response) => {
      const dictionary = (this.redactionPipeline as any).getDictionary();
      res.json({ entries: dictionary.list() });
    });

    api.post('/dictionary', (req: Request, res: Response) => {
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        res.status(400).json({ error: 'entries must be an array' });
        return;
      }

      for (const e of entries) {
        if (!e || typeof e !== 'object') {
          res.status(400).json({ error: 'each entry must be an object' });
          return;
        }
        if (typeof e.term !== 'string' || e.term.trim().length === 0) {
          res.status(400).json({ error: 'each entry must have a non-empty "term" string' });
          return;
        }
        if (e.term.length > 1000) {
          res.status(400).json({ error: 'term must be 1000 characters or fewer' });
          return;
        }
      }

      const formatted = entries.map((e: any) => ({
        id: e.id || uuidv4(),
        term: e.term,
        replacement: e.replacement,
        caseSensitive: e.caseSensitive ?? false,
        wholeWord: e.wholeWord ?? false,
        enabled: true,
        createdAt: new Date()
      }));

      (this.redactionPipeline as any).getDictionary().add(formatted);
      res.json({ success: true, count: formatted.length });
    });

    api.delete('/dictionary', (req: Request, res: Response) => {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        res.status(400).json({ error: 'ids must be an array' });
        return;
      }

      (this.redactionPipeline as any).getDictionary().remove(ids);
      res.json({ success: true });
    });

    api.post('/sessions/:id/hydrate', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { text } = req.body;

        if (!text || typeof text !== 'string') {
          res.status(400).json({ error: 'text must be a non-empty string' });
          return;
        }

        const hydrated = await this.rehydrationStore.hydrate(text, id);
        this.stats.requestsHydrated++;
        res.json({ text: hydrated });
      } catch (err: any) {
        console.error('Hydrate error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Stats endpoint — requires STATS_TOKEN or API_TOKEN
    api.get('/stats', async (req: Request, res: Response) => {
      try {
        if (!this.isStatsAuthenticated(req) && !this.isAuthenticated(req)) {
          res.status(401).json({ error: 'Unauthorized — STATS_TOKEN or API_TOKEN required' });
          return;
        }

        const activeSessions = await this.rehydrationStore.size();
        const storeStats = await this.rehydrationStore.getStats();
        const storageStats = await this.rehydrationStore.getStorageStats();

        res.json({
          ...this.stats,
          activeSessions,
          redisConnected: storeStats.redisConnected,
          dictionarySize: ((this.redactionPipeline as any).getDictionary() as DictionaryService).size(),
          storage: storageStats
        });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Storage stats endpoint
    api.get('/storage', async (req: Request, res: Response) => {
      try {
        const stats = await this.rehydrationStore.getStorageStats();
        res.json(stats);
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // List all sessions — redact original PII values
    api.get('/sessions', async (req: Request, res: Response) => {
      try {
        const sessions = await this.rehydrationStore.getAllSessions();
        const redacted = sessions.map(s => ({
          ...s,
          tokens: s.tokens.map(t => ({
            ...t,
            original: '[REDACTED]',
          })),
        }));
        res.json({ sessions: redacted });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Search sessions (must be before /sessions/:id)
    api.get('/sessions/search', async (req: Request, res: Response) => {
      try {
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
          res.status(400).json({ error: 'Query parameter "q" is required' });
          return;
        }

        const sessions = await this.rehydrationStore.search(q);
        const redacted = sessions.map(s => ({
          ...s,
          tokens: s.tokens.map(t => ({ ...t, original: '[REDACTED]' })),
        }));
        res.json({ sessions: redacted, count: redacted.length });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get single session
    api.get('/sessions/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const session = await this.rehydrationStore.retrieve(id);

        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        const redacted = {
          ...session,
          tokens: session.tokens.map(t => ({ ...t, original: '[REDACTED]' })),
        };
        res.json(redacted);
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Delete single session
    api.delete('/sessions/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const deleted = await this.rehydrationStore.delete(id);

        if (!deleted) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        res.json({ success: true, deletedSessionId: id });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Delete all sessions
    api.delete('/sessions', async (req: Request, res: Response) => {
      try {
        const deleted = await this.rehydrationStore.deleteAll();
        res.json({ success: true, deletedCount: deleted });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update session expiry
    api.post('/sessions/:id/extend', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { ttl } = req.body;

        const ttlSeconds = typeof ttl === 'number' ? ttl : 3600;
        if (ttlSeconds < 1 || ttlSeconds > 86400) {
          res.status(400).json({ error: 'ttl must be between 1 and 86400 seconds' });
          return;
        }
        const extended = await this.rehydrationStore.extend(id, ttlSeconds);

        if (!extended) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        res.json({ success: true, sessionId: id, ttl: ttlSeconds });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Add tokens to session manually
    api.post('/sessions/:id/tokens', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { tokens, type, category, meta, ttl } = req.body;

        if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
          res.status(400).json({ error: 'tokens must be a non-null object' });
          return;
        }

        if (type && !['dictionary', 'regex', 'ner'].includes(type)) {
          res.status(400).json({ error: 'type must be "dictionary", "regex", or "ner"' });
          return;
        }

        if (ttl !== undefined && (typeof ttl !== 'number' || ttl < 1 || ttl > 86400)) {
          res.status(400).json({ error: 'ttl must be a number between 1 and 86400' });
          return;
        }

        for (const [key, value] of Object.entries(tokens)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            res.status(400).json({ error: 'All token keys and values must be strings' });
            return;
          }
          if (key.length > 500 || (value as string).length > 5000) {
            res.status(400).json({ error: 'Token key/value exceeds size limit' });
            return;
          }
        }

        const tokenMap = new Map<string, string>(Object.entries(tokens));
        const ttlSeconds = typeof ttl === 'number' ? ttl : 3600;

        await this.rehydrationStore.store(id, tokenMap, ttlSeconds, type || 'dictionary', category || 'CUSTOM', meta);

        res.json({ success: true, sessionId: id });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public stats endpoint (limited info)
    api.get('/stats/public', async (req: Request, res: Response) => {
      try {
        const storeStats = await this.rehydrationStore.getStats();
        res.json({
          activeSessions: storeStats.activeSessions,
          redisConnected: storeStats.redisConnected,
          dictionarySize: ((this.redactionPipeline as any).getDictionary() as DictionaryService).size()
        });
      } catch (err: any) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.use('/api/v1', api);
  }

  private static readonly SESSION_ID_REGEX = /^[a-f0-9\-]{36}$/i;
  private static readonly MAX_TOKENS_PER_SESSION = 10000;

  private getSessionId(req: Request): string {
    const header = req.headers['x-anonamoose-session'] as string;
    if (header && ProxyServer.SESSION_ID_REGEX.test(header)) {
      return header;
    }
    return uuidv4();
  }

  private shouldRedact(req: Request): boolean {
    const header = req.headers['x-anonamoose-redact'];
    return typeof header !== 'string' || header.toLowerCase() !== 'false';
  }

  private shouldHydrate(req: Request): boolean {
    const header = req.headers['x-anonamoose-hydrate'];
    return typeof header !== 'string' || header.toLowerCase() !== 'false';
  }

  private async handleRedact(req: Request, res: Response): Promise<void> {
    const sessionId = this.getSessionId(req);
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text must be a non-empty string' });
      return;
    }

    if (text.length > 100_000) {
      res.status(400).json({ error: 'text exceeds maximum length of 100,000 characters' });
      return;
    }

    const result = await this.redactionPipeline.redact(text, sessionId);
    this.storeTokens(sessionId, result.tokens);

    // Group tokens by type for deduplication
    const tokensByType = new Map<string, Map<string, string>>();
    for (const [token, original] of result.tokens) {
      const pii = result.detectedPII.find(p => p.value === original);
      const type = pii?.type || 'regex';

      if (!tokensByType.has(type)) {
        tokensByType.set(type, new Map());
      }
      tokensByType.get(type)!.set(token, original);
    }

    // Store each type separately for proper deduplication
    for (const [type, tokens] of tokensByType) {
      await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'ner', 'PII');
    }

    this.stats.requestsRedacted++;
    this.stats.piiDetected += result.detectedPII.length;

    for (const pii of result.detectedPII) {
      if (pii.type === 'dictionary') this.stats.dictionaryHits++;
      else if (pii.type === 'regex') this.stats.regexHits++;
      else if (pii.type === 'ner') this.stats.nerHits++;
    }

    res.json({
      redactedText: result.redactedText,
      sessionId,
      detections: result.detectedPII.map(d => ({
        type: d.type,
        category: d.category,
        startIndex: d.startIndex,
        endIndex: d.endIndex,
        confidence: d.confidence,
      }))
    });
  }

  private getClientApiKey(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  }

  private async handleOpenAI(req: Request, res: Response): Promise<void> {
    const sessionId = this.getSessionId(req);
    const redact = this.shouldRedact(req);
    const hydrate = this.shouldHydrate(req);
    const apiKey = this.getClientApiKey(req);

    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key. Provide Bearer token in Authorization header.' });
      return;
    }

    let requestBody = { ...req.body };

    if (redact && requestBody.messages) {
      requestBody.messages = await this.redactMessages(requestBody.messages, sessionId);
      this.stats.requestsRedacted++;
    }

    const upstreamRes = await this.forwardToUpstream(
      'https://api.openai.com',
      '/v1/chat/completions',
      requestBody,
      apiKey
    );

    if (requestBody.stream) {
      await this.handleStreaming(upstreamRes, res, sessionId, hydrate);
    } else {
      let responseBody = await this.parseBody(upstreamRes);

      if (hydrate) {
        responseBody = await this.hydrateResponse(responseBody, sessionId);
        this.stats.requestsHydrated++;
      }

      res.status(upstreamRes.status).json(responseBody);
    }
  }

  private async handleAnthropic(req: Request, res: Response): Promise<void> {
    const sessionId = this.getSessionId(req);
    const redact = this.shouldRedact(req);
    const hydrate = this.shouldHydrate(req);
    const apiKey = this.getClientApiKey(req);

    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key. Provide Bearer token in Authorization header.' });
      return;
    }

    let requestBody = { ...req.body };

    if (redact) {
      if (typeof requestBody.system === 'string') {
        const systemResult = await this.redactionPipeline.redact(requestBody.system, sessionId);
        this.storeTokens(sessionId, systemResult.tokens);
        const tokensByType = new Map<string, Map<string, string>>();
        for (const [token, original] of systemResult.tokens) {
          const pii = systemResult.detectedPII.find(p => p.value === original);
          const type = pii?.type || 'regex';
          if (!tokensByType.has(type)) tokensByType.set(type, new Map());
          tokensByType.get(type)!.set(token, original);
        }
        for (const [type, tokens] of tokensByType) {
          await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'ner', 'SYSTEM');
        }
        requestBody.system = systemResult.redactedText;
        this.stats.requestsRedacted++;
      }

      if (requestBody.messages) {
        requestBody.messages = await this.redactMessages(requestBody.messages, sessionId);
      }
    }

    const upstreamRes = await this.forwardToUpstream(
      'https://api.anthropic.com',
      '/v1/messages',
      requestBody,
      apiKey,
      {
        'anthropic-version': '2023-06-01'
      }
    );

    if (requestBody.stream) {
      await this.handleStreaming(upstreamRes, res, sessionId, hydrate);
    } else {
      let responseBody = await this.parseBody(upstreamRes);

      if (hydrate) {
        responseBody = await this.hydrateResponse(responseBody, sessionId);
        this.stats.requestsHydrated++;
      }

      res.status(upstreamRes.status).json(responseBody);
    }
  }

  private async redactMessages(messages: ChatMessage[], sessionId: string): Promise<ChatMessage[]> {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        const redactionResult = await this.redactionPipeline.redact(msg.content, sessionId);
        this.storeTokens(sessionId, redactionResult.tokens);

        // Store with deduplication by type
        const tokensByType = new Map<string, Map<string, string>>();
        for (const [token, original] of redactionResult.tokens) {
          const pii = redactionResult.detectedPII.find(p => p.value === original);
          const type = pii?.type || 'regex';
          if (!tokensByType.has(type)) tokensByType.set(type, new Map());
          tokensByType.get(type)!.set(token, original);
        }
        for (const [type, tokens] of tokensByType) {
          await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'ner', 'MESSAGE');
        }

        this.stats.piiDetected += redactionResult.detectedPII.length;
        for (const pii of redactionResult.detectedPII) {
          if (pii.type === 'dictionary') this.stats.dictionaryHits++;
          else if (pii.type === 'regex') this.stats.regexHits++;
          else if (pii.type === 'ner') this.stats.nerHits++;
        }

        result.push({ ...msg, content: redactionResult.redactedText });
      } else if (Array.isArray(msg.content)) {
        const redactedBlocks = [];
        for (const block of msg.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            const blockResult = await this.redactionPipeline.redact(block.text, sessionId);
            this.storeTokens(sessionId, blockResult.tokens);

            const tokensByType = new Map<string, Map<string, string>>();
            for (const [token, original] of blockResult.tokens) {
              const pii = blockResult.detectedPII.find(p => p.value === original);
              const type = pii?.type || 'regex';
              if (!tokensByType.has(type)) tokensByType.set(type, new Map());
              tokensByType.get(type)!.set(token, original);
            }
            for (const [type, tokens] of tokensByType) {
              await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'ner', 'MESSAGE');
            }

            this.stats.piiDetected += blockResult.detectedPII.length;
            for (const pii of blockResult.detectedPII) {
              if (pii.type === 'dictionary') this.stats.dictionaryHits++;
              else if (pii.type === 'regex') this.stats.regexHits++;
              else if (pii.type === 'ner') this.stats.nerHits++;
            }

            redactedBlocks.push({ ...block, text: blockResult.redactedText });
          } else {
            redactedBlocks.push(block);
          }
        }
        result.push({ ...msg, content: redactedBlocks });
      } else {
        result.push(msg);
      }
    }

    return result;
  }

  private storeTokens(sessionId: string, tokens: Map<string, string>): void {
    const existing = this.sessionTokens.get(sessionId);
    const map = existing?.tokens || new Map();
    for (const [k, v] of tokens) {
      if (map.size >= ProxyServer.MAX_TOKENS_PER_SESSION) break;
      map.set(k, v);
    }
    this.sessionTokens.set(sessionId, { tokens: map, createdAt: existing?.createdAt || Date.now() });
  }

  private cleanupSessionTokens(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessionTokens) {
      if (now - entry.createdAt > SESSION_TOKEN_TTL_MS) {
        this.sessionTokens.delete(id);
      }
    }
  }

  private async hydrateResponse(response: any, sessionId: string): Promise<any> {
    const entry = this.sessionTokens.get(sessionId);
    if (!entry) return response;

    const hydrate = async (obj: any): Promise<any> => {
      if (typeof obj === 'string') {
        let result = obj;
        for (const [tokenized, original] of entry.tokens) {
          result = result.replaceAll(tokenized, original);
        }
        return result;
      }

      if (Array.isArray(obj)) {
        return Promise.all(obj.map(hydrate));
      }

      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
          result[k] = await hydrate(v);
        }
        return result;
      }

      return obj;
    };

    return hydrate(response);
  }

  private async forwardToUpstream(
    baseUrl: string,
    path: string,
    body: any,
    apiKey: string,
    additionalHeaders: Record<string, string> = {}
  ): Promise<globalThis.Response> {
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...additionalHeaders
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    return response;
  }

  private async parseBody(response: globalThis.Response): Promise<any> {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: { message: text } };
    }
  }

  private async handleStreaming(
    upstreamRes: globalThis.Response,
    res: Response,
    sessionId: string,
    hydrate: boolean
  ): Promise<void> {
    res.writeHead(upstreamRes.status, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    const entry = this.sessionTokens.get(sessionId);
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush remaining buffer
          if (buffer && hydrate && entry) {
            for (const [tokenized, original] of entry.tokens) {
              buffer = buffer.replaceAll(tokenized, original);
            }
          }
          if (buffer) res.write(buffer);
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (ending with \n\n)
        let boundaryIndex: number;
        while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
          let event = buffer.slice(0, boundaryIndex + 2);
          buffer = buffer.slice(boundaryIndex + 2);

          if (hydrate && entry) {
            for (const [tokenized, original] of entry.tokens) {
              event = event.replaceAll(tokenized, original);
            }
          }

          res.write(event);
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
    } finally {
      reader.releaseLock();
      res.end();
    }
  }

  private sendError(res: Response, err: any): void {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? 'Internal server error' : (err.message || 'Unknown error');

    res.status(status).json({
      error: {
        message,
        type: err.type || 'api_error'
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`Anonamoose proxy running on port ${this.config.port}`);
        if (!process.env.API_TOKEN) {
          console.warn('WARNING: API_TOKEN not set — management API will reject all requests');
        }
        resolve();
      });
    });
  }

  destroy(): void {
    clearInterval(this.sessionCleanupTimer);
  }
}
