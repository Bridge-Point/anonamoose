import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type { ProxyConfig, ChatMessage, RedactionConfig } from '../core/types.js';
import { RedactionPipeline } from '../core/redaction/pipeline.js';
import { DictionaryService } from '../core/redaction/dictionary.js';
import { DEFAULT_REDACTION_CONFIG } from '../core/types.js';
import { RehydrationStore } from '../core/rehydration/store.js';

export class ProxyServer {
  private app: express.Application;
  private redactionPipeline: RedactionPipeline;
  private rehydrationStore: RehydrationStore;
  private sessionTokens: Map<string, Map<string, string>> = new Map();
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
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    
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

  private isAuthenticated(req: Request): boolean {
    const apiToken = process.env.API_TOKEN;
    if (!apiToken) return true; // No auth configured
    
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    
    const token = authHeader.replace('Bearer ', '');
    return token === apiToken;
  }

  private isStatsAuthenticated(req: Request): boolean {
    const statsToken = process.env.STATS_TOKEN;
    if (!statsToken) return false; // Must be explicitly configured
    
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    
    const token = authHeader.replace('Bearer ', '');
    return token === statsToken;
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.post('/v1/chat/completions', (req: Request, res: Response) => {
      this.handleOpenAI(req, res);
    });

    this.app.post('/v1/messages', (req: Request, res: Response) => {
      this.handleAnthropic(req, res);
    });

    // Redaction endpoint
    this.app.post('/api/v1/redact', (req: Request, res: Response) => {
      this.handleRedact(req, res);
    });

    this.setupManagementAPI();
  }

  private setupManagementAPI(): void {
    const api = express.Router();
    api.use(express.json());

    // Protected routes
    api.use((req: Request, res: Response, next: NextFunction) => {
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
      const { id } = req.params;
      const { text } = req.body;
      
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      
      const hydrated = await this.rehydrationStore.hydrate(text, id);
      this.stats.requestsHydrated++;
      res.json({ text: hydrated });
    });

    // Stats endpoint - no auth for now
    api.get('/stats', async (req: Request, res: Response) => {
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
    });

    // Storage stats endpoint
    api.get('/storage', async (req: Request, res: Response) => {
      const stats = await this.rehydrationStore.getStorageStats();
      res.json(stats);
    });

    // List all sessions
    api.get('/sessions', async (req: Request, res: Response) => {
      const sessions = await this.rehydrationStore.getAllSessions();
      res.json({ sessions });
    });

    // Search sessions (must be before /sessions/:id)
    api.get('/sessions/search', async (req: Request, res: Response) => {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }
      
      const sessions = await this.rehydrationStore.search(q);
      res.json({ sessions, count: sessions.length });
    });

    // Get single session
    api.get('/sessions/:id', async (req: Request, res: Response) => {
      const { id } = req.params;
      const session = await this.rehydrationStore.retrieve(id);
      
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      res.json(session);
    });

    // Delete single session
    api.delete('/sessions/:id', async (req: Request, res: Response) => {
      const { id } = req.params;
      const deleted = await this.rehydrationStore.delete(id);
      
      if (!deleted) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      res.json({ success: true, deletedSessionId: id });
    });

    // Delete all sessions
    api.delete('/sessions', async (req: Request, res: Response) => {
      const deleted = await this.rehydrationStore.deleteAll();
      res.json({ success: true, deletedCount: deleted });
    });

    // Update session expiry
    api.post('/sessions/:id/extend', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { ttl } = req.body;
      
      const ttlSeconds = typeof ttl === 'number' ? ttl : 3600;
      const extended = await this.rehydrationStore.extend(id, ttlSeconds);
      
      if (!extended) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      res.json({ success: true, sessionId: id, ttl: ttlSeconds });
    });

    // Add tokens to session manually
    api.post('/sessions/:id/tokens', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { tokens, type, category, meta, ttl } = req.body;
      
      if (!tokens || typeof tokens !== 'object') {
        res.status(400).json({ error: 'tokens object is required' });
        return;
      }
      
      const tokenMap = new Map<string, string>(Object.entries(tokens));
      const ttlSeconds = typeof ttl === 'number' ? ttl : 3600;
      
      await this.rehydrationStore.store(id, tokenMap, ttlSeconds, type || 'dictionary', category || 'CUSTOM', meta);
      
      res.json({ success: true, sessionId: id });
    });

    // Public stats endpoint (limited info)
    api.get('/stats/public', async (req: Request, res: Response) => {
      const storeStats = await this.rehydrationStore.getStats();
      res.json({
        activeSessions: storeStats.activeSessions,
        redisConnected: storeStats.redisConnected,
        dictionarySize: ((this.redactionPipeline as any).getDictionary() as DictionaryService).size()
      });
    });

    this.app.use('/api/v1', api);
  }

  private getSessionId(req: Request): string {
    return (req.headers['x-anonamoose-session'] as string) || uuidv4();
  }

  private shouldRedact(req: Request): boolean {
    const header = req.headers['x-anonamoose-redact'];
    return header !== 'false';
  }

  private shouldHydrate(req: Request): boolean {
    const header = req.headers['x-anonamoose-hydrate'];
    return header !== 'false';
  }

  private async handleRedact(req: Request, res: Response): Promise<void> {
    const sessionId = this.getSessionId(req);
    const { text } = req.body;
    
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    try {
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
        detections: result.detectedPII
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  private getClientApiKey(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace('Bearer ', '').replace('Bearer ', '');
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

    try {
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
    } catch (err: any) {
      console.error('OpenAI proxy error:', err.message);
      this.sendError(res, err);
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

    try {
      let requestBody = { ...req.body };

      if (redact) {
        if (requestBody.system) {
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
    } catch (err: any) {
      console.error('Anthropic proxy error:', err.message);
      this.sendError(res, err);
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
      } else {
        result.push(msg);
      }
    }
    
    return result;
  }

  private storeTokens(sessionId: string, tokens: Map<string, string>): void {
    const existing = this.sessionTokens.get(sessionId) || new Map();
    for (const [k, v] of tokens) {
      existing.set(k, v);
    }
    this.sessionTokens.set(sessionId, existing);
  }

  private async hydrateResponse(response: any, sessionId: string): Promise<any> {
    const tokens = this.sessionTokens.get(sessionId);
    if (!tokens) return response;

    const hydrate = async (obj: any): Promise<any> => {
      if (typeof obj === 'string') {
        let result = obj;
        for (const [tokenized, original] of tokens) {
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
    res.writeHead(200, {
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
    const tokens = this.sessionTokens.get(sessionId);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        let chunk = decoder.decode(value, { stream: true });
        
        if (hydrate && tokens) {
          for (const [tokenized, original] of tokens) {
            chunk = chunk.replaceAll(tokenized, original);
          }
        }
        
        res.write(chunk);
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
    const message = err.message || 'Unknown error';
    
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
        console.log(`Management API on port ${this.config.managementPort || this.config.port + 1}`);
        resolve();
      });
    });
  }
}
