import { timingSafeEqual } from 'crypto';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import type { ProxyConfig, ChatMessage, RedactionConfig } from '../core/types.js';
import { RedactionPipeline } from '../core/redaction/pipeline.js';
import { DictionaryService } from '../core/redaction/dictionary.js';
import { NERLayer } from '../core/redaction/ner-layer.js';
import { RehydrationStore } from '../core/rehydration/store.js';
import { getDatabase, getAllSettings, getSetting, setSetting, closeDatabase, type SqliteDatabase } from '../core/database.js';

// Max age for in-memory sessionTokens entries (1 hour)
const SESSION_TOKEN_TTL_MS = 60 * 60 * 1000;

interface SessionTokenEntry {
  tokens: Map<string, string>;
  createdAt: number;
}

interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  duration: number;
  piiDetected?: number;
  sessionId?: string;
}

interface RedactionLogEntry {
  timestamp: string;
  source: 'api' | 'openai' | 'anthropic';
  sessionId: string;
  inputPreview: string;
  redactedPreview: string;
  detections: { type: string; category: string; confidence: number }[];
}

const MAX_LOG_ENTRIES = 500;
const MAX_REDACTION_LOG = 100;
const REDACTION_LOG_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class ProxyServer {
  private app: express.Application;
  private db: SqliteDatabase;
  private redactionPipeline: RedactionPipeline;
  private rehydrationStore: RehydrationStore;
  private sessionTokens: Map<string, SessionTokenEntry> = new Map();
  private sessionCleanupTimer: ReturnType<typeof setInterval>;
  private requestLog: RequestLogEntry[] = [];
  private redactionLog: RedactionLogEntry[] = [];
  private stats = {
    requestsRedacted: 0,
    requestsHydrated: 0,
    piiDetected: 0,
    dictionaryHits: 0,
    regexHits: 0,
    namesHits: 0,
    nerHits: 0
  };

  constructor(private config: ProxyConfig) {
    this.app = express();
    this.app.set('trust proxy', 1);

    this.db = getDatabase(config.dbPath);
    this.rehydrationStore = new RehydrationStore(this.db);

    const dictionary = new DictionaryService(this.db);
    const db = this.db;
    this.redactionPipeline = new RedactionPipeline(dictionary, (): RedactionConfig => {
      const s = getAllSettings(db);
      return {
        enableDictionary: s.enableDictionary ?? true,
        enableRegex: s.enableRegex ?? true,
        enableNames: s.enableNames ?? true,
        enableNER: s.enableNER ?? true,
        nerModel: s.nerModel ?? 'Xenova/bert-base-NER',
        nerMinConfidence: s.nerMinConfidence ?? 0.6,
        locale: s.locale ?? null,
        tokenizePlaceholders: s.tokenizePlaceholders ?? true,
        placeholderPrefix: s.placeholderPrefix ?? '\uE000',
        placeholderSuffix: s.placeholderSuffix ?? '\uE001',
      };
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();

    // Periodically clean up expired sessionTokens entries
    this.sessionCleanupTimer = setInterval(() => this.cleanupSessionTokens(), 5 * 60 * 1000);
  }

  private addLogEntry(entry: RequestLogEntry): void {
    this.requestLog.push(entry);
    if (this.requestLog.length > MAX_LOG_ENTRIES) {
      this.requestLog.splice(0, this.requestLog.length - MAX_LOG_ENTRIES);
    }
  }

  private addRedactionLogEntry(
    source: RedactionLogEntry['source'],
    sessionId: string,
    inputText: string,
    redactedText: string,
    detectedPII: { type: string; category: string; confidence: number }[]
  ): void {
    // Expire old entries
    const cutoff = Date.now() - REDACTION_LOG_TTL_MS;
    this.redactionLog = this.redactionLog.filter(e => new Date(e.timestamp).getTime() > cutoff);

    this.redactionLog.push({
      timestamp: new Date().toISOString(),
      source,
      sessionId,
      inputPreview: inputText.length > 500 ? inputText.slice(0, 500) + '...' : inputText,
      redactedPreview: redactedText.length > 500 ? redactedText.slice(0, 500) + '...' : redactedText,
      detections: detectedPII,
    });

    if (this.redactionLog.length > MAX_REDACTION_LOG) {
      this.redactionLog.splice(0, this.redactionLog.length - MAX_REDACTION_LOG);
    }
  }

  private setupMiddleware(): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      console.log(`${req.method} ${req.path} [${req.ip}]`);
      const originalEnd = res.end.bind(res);
      res.end = ((...args: any[]) => {
        const mgmtPrefixes = ['/api/v1/logs', '/api/v1/sessions', '/api/v1/redactions', '/api/v1/stats', '/api/v1/settings', '/logs', '/sessions', '/redactions', '/stats', '/settings', '/health', '/_next/', '/favicon'];
        if (!mgmtPrefixes.some(p => req.path.startsWith(p))) {
          this.addLogEntry({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            status: res.statusCode,
            ip: req.ip || 'unknown',
            duration: Date.now() - start,
            sessionId: req.headers['x-anonamoose-session'] as string,
          });
        }
        return originalEnd(...args);
      }) as any;
      next();
    });
    this.app.use(helmet({
      contentSecurityPolicy: false,
    }));
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

    // Handle requests without /v1 prefix (some clients strip it from base URL)
    this.app.post('/chat/completions', (req: Request, res: Response) => {
      this.handleOpenAI(req, res).catch((err) => {
        console.error('OpenAI handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });
    this.app.post('/messages', (req: Request, res: Response) => {
      this.handleAnthropic(req, res).catch((err) => {
        console.error('Anthropic handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    // Redact + proxy: chat completions (OpenAI-compatible)
    this.app.post('/v1/chat/completions', (req: Request, res: Response) => {
      this.handleOpenAI(req, res).catch((err) => {
        console.error('OpenAI handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    // Redact + proxy: Anthropic messages
    this.app.post('/v1/messages', (req: Request, res: Response) => {
      this.handleAnthropic(req, res).catch((err) => {
        console.error('Anthropic handler error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    });

    // Pass through all other OpenAI requests (models, embeddings, images, audio, etc.)
    const openaiPassthrough = (req: Request, res: Response) => {
      this.proxyToOpenAI(req, res).catch((err) => {
        console.error('OpenAI passthrough error:', err.message);
        if (!res.headersSent) this.sendError(res, err);
      });
    };
    this.app.all('/v1/*', openaiPassthrough);
    this.app.all('/models', openaiPassthrough);
    this.app.all('/embeddings', openaiPassthrough);

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
    this.setupStaticUI();
  }

  private setupStaticUI(): void {
    const uiPath = path.resolve(process.cwd(), 'ui', 'out');
    if (!fs.existsSync(uiPath)) return;

    this.app.use(express.static(uiPath));

    // Serve HTML pages for UI routes
    this.app.get('*', (req: Request, res: Response) => {
      // Don't serve HTML for API/proxy routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/v1/') ||
          req.path === '/health' || req.path === '/chat/completions' ||
          req.path === '/messages' || req.path === '/models' ||
          req.path === '/embeddings') {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const htmlPath = path.join(uiPath, req.path + '.html');
      const indexPath = path.join(uiPath, req.path, 'index.html');

      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.sendFile(path.join(uiPath, 'index.html'));
      }
    });
  }

  private setupManagementAPI(): void {
    const api = express.Router();

    // Public routes — no auth required
    api.post('/admin/verify', (req: Request, res: Response) => {
      const { token } = req.body;
      const apiToken = process.env.API_TOKEN;
      if (!apiToken || !token || !this.safeCompare(token, apiToken)) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      res.json({ ok: true });
    });

    // Protected routes — require API_TOKEN or STATS_TOKEN
    api.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/stats/public') {
        next();
        return;
      }
      if (!this.isAuthenticated(req) && !this.isStatsAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });

    // Settings endpoints
    api.get('/settings', (req: Request, res: Response) => {
      try {
        const settings = getAllSettings(this.db);
        res.json({ settings });
      } catch (err: any) {
        console.error('Settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    api.get('/settings/:key', (req: Request, res: Response) => {
      try {
        const { key } = req.params;
        const value = getSetting(this.db, key);
        if (value === undefined) {
          res.status(404).json({ error: `Setting "${key}" not found` });
          return;
        }
        res.json({ key, value });
      } catch (err: any) {
        console.error('Settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    api.put('/settings', (req: Request, res: Response) => {
      try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
          res.status(400).json({ error: 'settings must be a non-null object' });
          return;
        }

        const oldModel = getSetting<string>(this.db, 'nerModel');

        for (const [key, value] of Object.entries(settings)) {
          setSetting(this.db, key, value);
        }

        // Reset NER pipeline if model changed
        if ('nerModel' in settings && settings.nerModel !== oldModel) {
          NERLayer.resetPipeline();
        }

        const updated = getAllSettings(this.db);
        res.json({ success: true, settings: updated });
      } catch (err: any) {
        console.error('Settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    api.get('/dictionary', (req: Request, res: Response) => {
      const dictionary = (this.redactionPipeline as any).getDictionary() as DictionaryService;
      let entries = dictionary.list();
      const total = entries.length;

      // Search filter
      const q = req.query.q as string;
      if (q) {
        const lower = q.toLowerCase();
        entries = entries.filter(e => e.term.toLowerCase().includes(lower));
      }

      const filtered = entries.length;

      // Pagination
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const start = (page - 1) * limit;
      const paged = entries.slice(start, start + limit);

      res.json({
        entries: paged,
        total,
        filtered,
        page,
        limit,
        pages: Math.ceil(filtered / limit),
      });
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

      const dictionary = (this.redactionPipeline as any).getDictionary() as DictionaryService;

      // Deduplicate: reject terms that already exist
      const dupes = entries.filter((e: any) => dictionary.hasTerm(e.term.trim()));
      if (dupes.length > 0) {
        const dupeTerms = dupes.map((e: any) => e.term.trim());
        res.status(409).json({ error: `Term${dupes.length > 1 ? 's' : ''} already exist${dupes.length === 1 ? 's' : ''}: ${dupeTerms.join(', ')}` });
        return;
      }

      const formatted = entries.map((e: any) => ({
        id: e.id || uuidv4(),
        term: e.term.trim(),
        replacement: e.replacement,
        caseSensitive: e.caseSensitive ?? false,
        wholeWord: e.wholeWord ?? false,
        enabled: true,
        createdAt: new Date()
      }));

      dictionary.add(formatted);
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

    api.post('/dictionary/flush', async (_req: Request, res: Response) => {
      const dictionary = (this.redactionPipeline as any).getDictionary() as DictionaryService;
      const count = dictionary.size();
      await dictionary.clear();
      res.json({ success: true, cleared: count });
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
          storageConnected: storeStats.storageConnected,
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

        if (type && !['dictionary', 'regex', 'names', 'ner'].includes(type)) {
          res.status(400).json({ error: 'type must be "dictionary", "regex", "names", or "ner"' });
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

    // Request logs
    api.get('/logs', (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, MAX_LOG_ENTRIES);
      const method = req.query.method as string;
      const path = req.query.path as string;
      const status = req.query.status ? parseInt(req.query.status as string) : undefined;

      let logs = [...this.requestLog].reverse();

      if (method) logs = logs.filter(l => l.method === method.toUpperCase());
      if (path) logs = logs.filter(l => l.path.includes(path));
      if (status) logs = logs.filter(l => l.status === status);

      res.json({ logs: logs.slice(0, limit), total: this.requestLog.length });
    });

    // Clear logs
    api.delete('/logs', (_req: Request, res: Response) => {
      this.requestLog = [];
      res.json({ success: true });
    });

    // Recent redactions log
    api.get('/redactions', (_req: Request, res: Response) => {
      // Expire entries older than 15 minutes
      const cutoff = Date.now() - REDACTION_LOG_TTL_MS;
      this.redactionLog = this.redactionLog.filter(e => new Date(e.timestamp).getTime() > cutoff);
      res.json({ redactions: [...this.redactionLog].reverse(), total: this.redactionLog.length });
    });

    api.delete('/redactions', (_req: Request, res: Response) => {
      this.redactionLog = [];
      res.json({ success: true });
    });

    // Flush all sessions (cache)
    api.post('/sessions/flush', async (_req: Request, res: Response) => {
      try {
        const deleted = await this.rehydrationStore.deleteAll();
        res.json({ success: true, deletedCount: deleted });
      } catch (err: any) {
        console.error('Flush error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public stats endpoint (used by dashboard)
    api.get('/stats/public', async (req: Request, res: Response) => {
      try {
        const activeSessions = await this.rehydrationStore.size();
        const storeStats = await this.rehydrationStore.getStats();
        res.json({
          ...this.stats,
          activeSessions,
          storageConnected: storeStats.storageConnected,
          dictionarySize: ((this.redactionPipeline as any).getDictionary() as DictionaryService).size(),
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
      await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'names' | 'ner', 'PII');
    }

    this.stats.requestsRedacted++;
    this.stats.piiDetected += result.detectedPII.length;

    for (const pii of result.detectedPII) {
      if (pii.type === 'dictionary') this.stats.dictionaryHits++;
      else if (pii.type === 'regex') this.stats.regexHits++;
      else if (pii.type === 'names') this.stats.namesHits++;
      else if (pii.type === 'ner') this.stats.nerHits++;
    }

    this.addRedactionLogEntry('api', sessionId, text, result.redactedText,
      result.detectedPII.map(d => ({ type: d.type, category: d.category, confidence: d.confidence }))
    );

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
          await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'names' | 'ner', 'SYSTEM');
        }
        requestBody.system = systemResult.redactedText;
        this.stats.requestsRedacted++;

        if (systemResult.detectedPII.length > 0) {
          this.addRedactionLogEntry('anthropic', sessionId, req.body.system, systemResult.redactedText,
            systemResult.detectedPII.map(d => ({ type: d.type, category: d.category, confidence: d.confidence }))
          );
        }
      }

      if (requestBody.messages) {
        requestBody.messages = await this.redactMessages(requestBody.messages, sessionId, 'anthropic');
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

  private async redactMessages(messages: ChatMessage[], sessionId: string, source: RedactionLogEntry['source'] = 'openai'): Promise<ChatMessage[]> {
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
          await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'names' | 'ner', 'MESSAGE');
        }

        this.stats.piiDetected += redactionResult.detectedPII.length;
        for (const pii of redactionResult.detectedPII) {
          if (pii.type === 'dictionary') this.stats.dictionaryHits++;
          else if (pii.type === 'regex') this.stats.regexHits++;
          else if (pii.type === 'names') this.stats.namesHits++;
          else if (pii.type === 'ner') this.stats.nerHits++;
        }

        if (redactionResult.detectedPII.length > 0) {
          this.addRedactionLogEntry(source, sessionId, msg.content, redactionResult.redactedText,
            redactionResult.detectedPII.map(d => ({ type: d.type, category: d.category, confidence: d.confidence }))
          );
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
              await this.rehydrationStore.store(sessionId, tokens, 3600, type as 'dictionary' | 'regex' | 'names' | 'ner', 'MESSAGE');
            }

            this.stats.piiDetected += blockResult.detectedPII.length;
            for (const pii of blockResult.detectedPII) {
              if (pii.type === 'dictionary') this.stats.dictionaryHits++;
              else if (pii.type === 'regex') this.stats.regexHits++;
              else if (pii.type === 'names') this.stats.namesHits++;
              else if (pii.type === 'ner') this.stats.nerHits++;
            }

            if (blockResult.detectedPII.length > 0) {
              this.addRedactionLogEntry(source, sessionId, block.text, blockResult.redactedText,
                blockResult.detectedPII.map(d => ({ type: d.type, category: d.category, confidence: d.confidence }))
              );
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

  private async proxyToOpenAI(req: Request, res: Response): Promise<void> {
    const apiKey = req.headers.authorization?.replace('Bearer ', '') || this.config.openaiKey;
    if (!apiKey) {
      res.status(401).json({ error: { message: 'Missing API key. Provide Bearer token in Authorization header.', type: 'invalid_request_error' } });
      return;
    }

    const apiPath = req.path.startsWith('/v1/') ? req.path : `/v1${req.path}`;
    const url = `https://api.openai.com${apiPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
    };
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'] as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const data = await response.text();
    res.send(data);
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
    this.rehydrationStore.destroy();
    closeDatabase();
  }
}
