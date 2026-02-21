import Redis from 'ioredis';

export interface TokenEntry {
  original: string;
  tokenized: string;
  type: 'dictionary' | 'regex' | 'ner';
  category: string;
  meta?: Record<string, string>;
}

export interface SessionData {
  sessionId: string;
  tokens: TokenEntry[];
  createdAt: string;
  expiresAt: string;
  lastAccessedAt: string;
}

export class RehydrationStore {
  private redis?: Redis;
  private localSessions: Map<string, SessionData> = new Map();
  private defaultTTL = 3600;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          connectTimeout: 5000,
        });
        this.redis.connect().catch(() => {
          console.warn('Redis connection failed, using in-memory store');
        });
      } catch (e) {
        console.warn('Redis connection failed, using in-memory store:', e);
      }
    }
  }

  async store(
    sessionId: string, 
    tokens: Map<string, string>, 
    ttlSeconds: number = this.defaultTTL,
    type: 'dictionary' | 'regex' | 'ner' = 'regex',
    category: string = 'PII',
    meta?: Record<string, string>
  ): Promise<void> {
    const now = new Date().toISOString();
    
    // Deduplicate tokens - if same original value exists, don't add again
    const existingData = await this.retrieve(sessionId);
    const existingTokens = existingData?.tokens || [];
    const existingOriginals = new Set(existingTokens.map(t => t.original.toLowerCase()));

    const newTokens: TokenEntry[] = [];
    
    for (const [tokenized, original] of tokens) {
      if (!existingOriginals.has(original.toLowerCase())) {
        newTokens.push({
          original,
          tokenized,
          type,
          category,
          meta
        });
        existingOriginals.add(original.toLowerCase());
      }
    }

    const allTokens = [...existingTokens, ...newTokens];

    const session: SessionData = {
      sessionId,
      tokens: allTokens,
      createdAt: existingData?.createdAt || now,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      lastAccessedAt: now
    };

    if (this.redis) {
      const key = `anonamoose:session:${sessionId}`;
      const data = JSON.stringify(session);
      await this.redis.setex(key, ttlSeconds, data);
    } else {
      this.localSessions.set(sessionId, session);
    }
  }

  async retrieve(sessionId: string): Promise<SessionData | null> {
    if (this.redis) {
      const key = `anonamoose:session:${sessionId}`;
      const data = await this.redis.get(key);
      
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    } else {
      const session = this.localSessions.get(sessionId);
      if (!session) return null;
      
      if (new Date() > new Date(session.expiresAt)) {
        this.localSessions.delete(sessionId);
        return null;
      }
      
      return session;
    }
  }

  async hydrate(text: string, sessionId: string): Promise<string> {
    const session = await this.retrieve(sessionId);
    if (!session) return text;
    
    let result = text;
    for (const token of session.tokens) {
      result = result.replaceAll(token.tokenized, token.original);
    }
    
    return result;
  }

  async delete(sessionId: string): Promise<boolean> {
    if (this.redis) {
      const result = await this.redis.del(`anonamoose:session:${sessionId}`);
      return result > 0;
    } else {
      return this.localSessions.delete(sessionId);
    }
  }

  async deleteAll(): Promise<number> {
    if (this.redis) {
      const keys = await this.redis.keys('anonamoose:session:*');
      if (keys.length > 0) {
        return await this.redis.del(...keys);
      }
      return 0;
    } else {
      const count = this.localSessions.size;
      this.localSessions.clear();
      return count;
    }
  }

  async extend(sessionId: string, ttlSeconds: number): Promise<boolean> {
    if (this.redis) {
      const key = `anonamoose:session:${sessionId}`;
      const result = await this.redis.expire(key, ttlSeconds);
      return result === 1;
    } else {
      const session = this.localSessions.get(sessionId);
      if (!session) return false;
      
      session.expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      return true;
    }
  }

  async size(): Promise<number> {
    if (this.redis) {
      const keys = await this.redis.keys('anonamoose:session:*');
      return keys.length;
    } else {
      return this.localSessions.size;
    }
  }

  async getAllSessions(): Promise<SessionData[]> {
    if (this.redis) {
      const keys = await this.redis.keys('anonamoose:session:*');
      const sessions: SessionData[] = [];
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          try {
            sessions.push(JSON.parse(data));
          } catch {
            // Skip invalid data
          }
        }
      }
      
      return sessions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      return Array.from(this.localSessions.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  async search(query: string): Promise<SessionData[]> {
    const sessions = await this.getAllSessions();
    const lowerQuery = query.toLowerCase();
    
    return sessions.filter(session => 
      session.tokens.some(t => 
        t.original.toLowerCase().includes(lowerQuery) ||
        t.category.toLowerCase().includes(lowerQuery) ||
        (t.meta && Object.values(t.meta).some(v => v.toLowerCase().includes(lowerQuery)))
      )
    );
  }

  async getStorageStats(): Promise<{
    sessionCount: number;
    totalTokens: number;
    redisConnected: boolean;
    memoryUsage?: string;
  }> {
    const sessions = await this.getAllSessions();
    const totalTokens = sessions.reduce((sum, s) => sum + s.tokens.length, 0);
    
    let memoryUsage: string | undefined;
    
    if (this.redis && this.redis.status === 'ready') {
      try {
        const info = await this.redis.info('memory');
        const usedMatch = info.match(/used_memory_human:(\S+)/);
        if (usedMatch) {
          memoryUsage = usedMatch[1];
        }
      } catch {
        // Ignore memory info errors
      }
    }
    
    return {
      sessionCount: sessions.length,
      totalTokens,
      redisConnected: this.redis ? this.redis.status === 'ready' : false,
      memoryUsage
    };
  }

  async cleanup(): Promise<number> {
    // Redis handles TTL automatically
    return 0;
  }

  async getStats(): Promise<{ activeSessions: number; redisConnected: boolean }> {
    const redisConnected = this.redis ? this.redis.status === 'ready' || this.redis.status === 'connect' : false;
    return {
      activeSessions: await this.size(),
      redisConnected
    };
  }
}
