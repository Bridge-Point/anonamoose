'use client';

import { useEffect, useState, useCallback } from 'react';
import { Shield, Trash2, Search, RefreshCw, ArrowLeft, AlertTriangle, Lock, FlaskConical, Sliders, BookOpen, Plus, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  duration: number;
  sessionId?: string;
}

interface Session {
  sessionId: string;
  tokens: { placeholder: string; original: string; type: string; category: string }[];
  createdAt: string;
  expiresAt: string;
}

interface Detection {
  type: 'dictionary' | 'regex' | 'names' | 'ner';
  category: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

interface RedactResult {
  redactedText: string;
  sessionId: string;
  detections: Detection[];
}

interface RedactionLogEntry {
  timestamp: string;
  source: 'api' | 'openai' | 'anthropic';
  sessionId: string;
  inputPreview: string;
  redactedPreview: string;
  detections: { type: string; category: string; confidence: number }[];
}

interface SettingsData {
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
  [key: string]: any;
}

interface DictionaryEntry {
  id: string;
  term: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  enabled: boolean;
  createdAt: string;
}

type Tab = 'logs' | 'sessions' | 'inspect' | 'dictionary' | 'settings';

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        sessionStorage.setItem('admin_token', token);
        onLogin(token);
      } else {
        setError('Invalid token');
      }
    } catch {
      setError('Failed to verify token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-600" />
            Admin Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter API_TOKEN"
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPanel() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmFlush, setConfirmFlush] = useState(false);
  const [inspectInput, setInspectInput] = useState('');
  const [inspectResult, setInspectResult] = useState<RedactResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [recentRedactions, setRecentRedactions] = useState<RedactionLogEntry[]>([]);
  const [expandedRedaction, setExpandedRedaction] = useState<number | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [dictEntries, setDictEntries] = useState<DictionaryEntry[]>([]);
  const [dictTotal, setDictTotal] = useState(0);
  const [dictFiltered, setDictFiltered] = useState(0);
  const [dictPage, setDictPage] = useState(1);
  const [dictPages, setDictPages] = useState(1);
  const [dictSearch, setDictSearch] = useState('');
  const [dictLoading, setDictLoading] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [dictSaving, setDictSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmFlushDict, setConfirmFlushDict] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_token');
    if (stored) setAdminToken(stored);
  }, []);

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${adminToken || ''}`,
  }), [adminToken]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchLogs = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/logs?limit=200', { headers: authHeaders() });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setLogs(data.logs || []);
      setLogTotal(data.total || 0);
    } catch {
      showMessage('Failed to fetch logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [adminToken, authHeaders]);

  const clearLogs = async () => {
    const res = await fetch('/api/v1/logs', { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      setLogs([]);
      setLogTotal(0);
      showMessage('Logs cleared', 'success');
    }
  };

  const fetchSessions = useCallback(async (query?: string) => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const url = query ? `/api/v1/sessions/search?q=${encodeURIComponent(query)}` : '/api/v1/sessions';
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      showMessage('Failed to fetch sessions', 'error');
    } finally {
      setLoading(false);
    }
  }, [adminToken, authHeaders]);

  const deleteSession = async (id: string) => {
    const res = await fetch(`/api/v1/sessions/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      setSessions(prev => prev.filter(s => s.sessionId !== id));
      showMessage('Session deleted', 'success');
    } else {
      showMessage('Failed to delete session', 'error');
    }
  };

  const flushAll = async () => {
    const res = await fetch('/api/v1/sessions', { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setSessions([]);
      setConfirmFlush(false);
      showMessage(`Flushed ${data.deletedCount} sessions`, 'success');
    } else {
      showMessage('Failed to flush sessions', 'error');
    }
  };

  const runInspect = async () => {
    if (!inspectInput.trim()) return;
    setInspectLoading(true);
    setInspectResult(null);
    try {
      const res = await fetch('/api/v1/redact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text: inspectInput }),
      });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setInspectResult(data);
      fetchRedactions();
    } catch {
      showMessage('Failed to run redaction', 'error');
    } finally {
      setInspectLoading(false);
    }
  };

  const fetchRedactions = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/v1/redactions', { headers: authHeaders() });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setRecentRedactions(data.redactions || []);
    } catch {
      // silent
    }
  }, [adminToken, authHeaders]);

  const clearRedactions = async () => {
    const res = await fetch('/api/v1/redactions', { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      setRecentRedactions([]);
      showMessage('Redaction log cleared', 'success');
    }
  };

  const fetchSettings = useCallback(async () => {
    if (!adminToken) return;
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/v1/settings', { headers: authHeaders() });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setSettings(data.settings || null);
      setSettingsDirty(false);
    } catch {
      showMessage('Failed to fetch settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  }, [adminToken, authHeaders]);

  const saveSettings = async () => {
    if (!settings) return;
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ settings }),
      });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setSettingsDirty(false);
        showMessage('Settings saved', 'success');
      } else {
        showMessage('Failed to save settings', 'error');
      }
    } catch {
      showMessage('Failed to save settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSettingsDirty(true);
  };

  const fetchDictionary = useCallback(async (page?: number, search?: string) => {
    if (!adminToken) return;
    setDictLoading(true);
    try {
      const p = page ?? dictPage;
      const q = search ?? dictSearch;
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q) params.set('q', q);
      const res = await fetch(`/api/v1/dictionary?${params}`, { headers: authHeaders() });
      if (res.status === 401) { setAdminToken(null); sessionStorage.removeItem('admin_token'); return; }
      const data = await res.json();
      setDictEntries(data.entries || []);
      setDictTotal(data.total || 0);
      setDictFiltered(data.filtered || 0);
      setDictPage(data.page || 1);
      setDictPages(data.pages || 1);
    } catch {
      showMessage('Failed to fetch dictionary', 'error');
    } finally {
      setDictLoading(false);
    }
  }, [adminToken, authHeaders, dictPage, dictSearch]);

  const addDictEntry = async () => {
    if (!newTerm.trim() || dictSaving === 'saving') return;
    setDictSaving('saving');
    try {
      const res = await fetch('/api/v1/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ entries: [{ term: newTerm.trim(), caseSensitive: false, wholeWord: true }] }),
      });
      if (res.ok) {
        setNewTerm('');
        setDictSaving('saved');
        setTimeout(() => setDictSaving('idle'), 1500);
        fetchDictionary(1, '');
        setDictSearch('');
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage(data.error || 'Failed to add term', 'error');
        setDictSaving('idle');
      }
    } catch {
      showMessage('Failed to add term', 'error');
      setDictSaving('idle');
    }
  };

  const deleteDictEntry = async (id: string) => {
    try {
      const res = await fetch('/api/v1/dictionary', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ids: [id] }),
      });
      if (res.ok) {
        showMessage('Term removed', 'success');
        fetchDictionary();
      } else {
        showMessage('Failed to remove term', 'error');
      }
    } catch {
      showMessage('Failed to remove term', 'error');
    }
  };

  const flushDictionary = async () => {
    try {
      const res = await fetch('/api/v1/dictionary/flush', {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDictEntries([]);
        setDictTotal(0);
        setDictFiltered(0);
        setDictPage(1);
        setDictPages(1);
        setConfirmFlushDict(false);
        showMessage(`Cleared ${data.cleared} terms`, 'success');
      } else {
        showMessage('Failed to clear dictionary', 'error');
      }
    } catch {
      showMessage('Failed to clear dictionary', 'error');
    }
  };

  const logout = () => {
    setAdminToken(null);
    sessionStorage.removeItem('admin_token');
  };

  useEffect(() => {
    if (!adminToken) return;
    if (tab === 'logs') fetchLogs();
    if (tab === 'sessions') fetchSessions();
    if (tab === 'inspect') fetchRedactions();
    if (tab === 'dictionary') fetchDictionary();
    if (tab === 'settings') fetchSettings();
  }, [tab, adminToken, fetchLogs, fetchSessions, fetchRedactions, fetchDictionary, fetchSettings]);

  useEffect(() => {
    if (!adminToken || tab !== 'logs') return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [tab, adminToken, fetchLogs]);

  useEffect(() => {
    if (!adminToken || tab !== 'inspect') return;
    const interval = setInterval(fetchRedactions, 10000);
    return () => clearInterval(interval);
  }, [tab, adminToken, fetchRedactions]);

  if (!adminToken) {
    return <LoginScreen onLogin={setAdminToken} />;
  }

  const statusColor = (status: number) => {
    if (status < 300) return 'text-green-600';
    if (status < 400) return 'text-yellow-600';
    return 'text-red-600';
  };

  const methodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-100 text-blue-700';
      case 'POST': return 'bg-green-100 text-green-700';
      case 'DELETE': return 'bg-red-100 text-red-700';
      case 'PUT': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const sourceColor = (source: string) => {
    switch (source) {
      case 'openai': return 'bg-emerald-100 text-emerald-700';
      case 'anthropic': return 'bg-amber-100 text-amber-700';
      case 'api': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Shield className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold">Admin Panel</h1>
            </div>
            <div className="flex items-center gap-3">
              {message && (
                <span className={`text-sm px-3 py-1 rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {message.text}
                </span>
              )}
              <a href="https://docs.anonamoose.net" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 hover:bg-gray-100 rounded">
                Docs
              </a>
              <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 hover:bg-gray-100 rounded">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 rounded font-medium ${tab === 'logs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Request Logs
          </button>
          <button
            onClick={() => setTab('sessions')}
            className={`px-4 py-2 rounded font-medium ${tab === 'sessions' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Sessions & Cache
          </button>
          <button
            onClick={() => setTab('inspect')}
            className={`px-4 py-2 rounded font-medium ${tab === 'inspect' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Redaction Inspector
          </button>
          <button
            onClick={() => setTab('dictionary')}
            className={`px-4 py-2 rounded font-medium ${tab === 'dictionary' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Dictionary
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-4 py-2 rounded font-medium ${tab === 'settings' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            Settings
          </button>
        </div>

        {tab === 'logs' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Request Logs
                  <span className="text-sm font-normal text-gray-500 ml-2">({logTotal} total)</span>
                </CardTitle>
                <div className="flex gap-2">
                  <button onClick={fetchLogs} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button onClick={clearLogs} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="Clear logs">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Method</th>
                      <th className="pb-2 pr-4">Path</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Duration</th>
                      <th className="pb-2">IP</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {logs.map((log, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${methodColor(log.method)}`}>
                            {log.method}
                          </span>
                        </td>
                        <td className="py-2 pr-4 max-w-xs truncate">{log.path}</td>
                        <td className={`py-2 pr-4 font-medium ${statusColor(log.status)}`}>{log.status}</td>
                        <td className="py-2 pr-4 text-gray-500">{log.duration}ms</td>
                        <td className="py-2 text-gray-400">{log.ip}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400">No log entries</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'sessions' && (
          <>
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search sessions by ID or token placeholder..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchSessions(searchQuery)}
                      className="w-full pl-9 pr-4 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => fetchSessions(searchQuery)}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Search
                  </button>
                  <button
                    onClick={() => { setSearchQuery(''); fetchSessions(); }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    Clear
                  </button>
                  {!confirmFlush ? (
                    <button
                      onClick={() => setConfirmFlush(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="h-4 w-4" /> Flush All
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 text-sm flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Delete all sessions?
                      </span>
                      <button onClick={flushAll} className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmFlush(false)} className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {sessions.map((session) => (
                <Card key={session.sessionId}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{session.sessionId}</code>
                          <span className="text-xs text-gray-500">
                            {session.tokens.length} token{session.tokens.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mb-3">
                          Created: {new Date(session.createdAt).toLocaleString()}
                          {session.expiresAt && <> &middot; Expires: {new Date(session.expiresAt).toLocaleString()}</>}
                        </div>
                        {session.tokens.length > 0 && (
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="text-left text-gray-500 border-b">
                                <th className="pb-1 pr-4">Placeholder</th>
                                <th className="pb-1 pr-4">Type</th>
                                <th className="pb-1">Category</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.tokens.slice(0, 10).map((t, i) => (
                                <tr key={i} className="border-b border-gray-50">
                                  <td className="py-1 pr-4 text-blue-600">{t.placeholder}</td>
                                  <td className="py-1 pr-4">{t.type}</td>
                                  <td className="py-1">{t.category}</td>
                                </tr>
                              ))}
                              {session.tokens.length > 10 && (
                                <tr>
                                  <td colSpan={3} className="py-1 text-gray-400">
                                    ...and {session.tokens.length - 10} more
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                      <button
                        onClick={() => deleteSession(session.sessionId)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded ml-4"
                        title="Delete session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {sessions.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400">
                  {searchQuery ? 'No sessions matching search' : 'No active sessions'}
                </div>
              )}
              {loading && (
                <div className="text-center py-12 text-gray-400">Loading...</div>
              )}
            </div>
          </>
        )}

        {tab === 'inspect' && (
          <>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-purple-600" />
                  Redaction Inspector
                </CardTitle>
                <p className="text-sm text-gray-500">Enter text to see what PII gets detected and how it&apos;s redacted.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <textarea
                    value={inspectInput}
                    onChange={(e) => setInspectInput(e.target.value)}
                    placeholder="e.g. My name is John Smith, I live at 123 Main St, my email is john@example.com and my SSN is 123-45-6789"
                    className="w-full h-32 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y font-mono"
                  />
                  <button
                    onClick={runInspect}
                    disabled={inspectLoading || !inspectInput.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {inspectLoading ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Running...</>
                    ) : (
                      'Run Redaction'
                    )}
                  </button>
                </div>
              </CardContent>
            </Card>

            {inspectResult && (
              <>
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Redacted Output</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm whitespace-pre-wrap break-all">
                      {inspectResult.redactedText}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                      <span>Session: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{inspectResult.sessionId}</code></span>
                      <span>{inspectResult.detections.length} detection{inspectResult.detections.length !== 1 ? 's' : ''} found</span>
                    </div>
                  </CardContent>
                </Card>

                {inspectResult.detections.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Detections</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="pb-2 pr-4">Original Text</th>
                              <th className="pb-2 pr-4">Category</th>
                              <th className="pb-2 pr-4">Layer</th>
                              <th className="pb-2 pr-4">Confidence</th>
                              <th className="pb-2">Position</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-xs">
                            {inspectResult.detections.map((d, i) => (
                              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-2 pr-4">
                                  <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                    {inspectInput.substring(d.startIndex, d.endIndex)}
                                  </span>
                                </td>
                                <td className="py-2 pr-4">
                                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-medium">
                                    {d.category}
                                  </span>
                                </td>
                                <td className="py-2 pr-4">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    d.type === 'ner' ? 'bg-purple-100 text-purple-700' :
                                    d.type === 'regex' ? 'bg-orange-100 text-orange-700' :
                                    'bg-green-100 text-green-700'
                                  }`}>
                                    {d.type}
                                  </span>
                                </td>
                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full ${
                                          d.confidence >= 0.8 ? 'bg-green-500' :
                                          d.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.round(d.confidence * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-gray-500">{Math.round(d.confidence * 100)}%</span>
                                  </div>
                                </td>
                                <td className="py-2 text-gray-400">{d.startIndex}-{d.endIndex}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-gray-400">
                      No PII detected in the input text.
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card className="mt-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Recent Redactions
                    <span className="text-sm font-normal text-gray-500 ml-2">(last 15 min)</span>
                  </CardTitle>
                  <div className="flex gap-2">
                    <button onClick={fetchRedactions} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Refresh">
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button onClick={clearRedactions} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="Clear">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {recentRedactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No redactions in the last 15 minutes. Send requests through the proxy to see them here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentRedactions.map((r, i) => (
                      <div key={i} className="border rounded hover:bg-gray-50">
                        <button
                          onClick={() => setExpandedRedaction(expandedRedaction === i ? null : i)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${sourceColor(r.source)}`}>
                            {r.source}
                          </span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {new Date(r.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-sm text-gray-700 truncate flex-1">
                            {r.detections.length} detection{r.detections.length !== 1 ? 's' : ''}
                            {' — '}
                            {r.detections.map(d => d.category).filter((v, j, a) => a.indexOf(v) === j).join(', ')}
                          </span>
                          <code className="text-xs text-gray-400 hidden sm:block">{r.sessionId.slice(0, 8)}</code>
                          <span className="text-gray-400 text-xs">{expandedRedaction === i ? '▲' : '▼'}</span>
                        </button>
                        {expandedRedaction === i && (
                          <div className="px-4 pb-4 space-y-3 border-t">
                            <div className="mt-3">
                              <p className="text-xs font-medium text-gray-500 mb-1">Input</p>
                              <div className="bg-gray-100 p-3 rounded font-mono text-xs whitespace-pre-wrap break-all">
                                {r.inputPreview}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Redacted</p>
                              <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs whitespace-pre-wrap break-all">
                                {r.redactedPreview}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Detections</p>
                              <div className="flex flex-wrap gap-1.5">
                                {r.detections.map((d, j) => (
                                  <span key={j} className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1">
                                    <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                                      d.type === 'ner' ? 'bg-purple-100 text-purple-700' :
                                      d.type === 'regex' ? 'bg-orange-100 text-orange-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {d.type}
                                    </span>
                                    <span className="font-medium">{d.category}</span>
                                    <span className="text-gray-400">{Math.round(d.confidence * 100)}%</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {tab === 'dictionary' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-green-600" />
                  Dictionary
                  <span className="text-sm font-normal text-gray-500">({dictTotal} term{dictTotal !== 1 ? 's' : ''})</span>
                </CardTitle>
                <div className="flex gap-2">
                  <button onClick={() => fetchDictionary()} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${dictLoading ? 'animate-spin' : ''}`} />
                  </button>
                  {dictTotal > 0 && (
                    !confirmFlushDict ? (
                      <button
                        onClick={() => setConfirmFlushDict(true)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Clear All
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 text-sm flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Delete all {dictTotal} terms?
                        </span>
                        <button onClick={flushDictionary} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmFlushDict(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm">
                          Cancel
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDictEntry()}
                  placeholder="Add a term (e.g. John Smith, Acme Corp)"
                  className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={addDictEntry}
                  disabled={!newTerm.trim() || dictSaving === 'saving'}
                  className={`px-4 py-2 text-white rounded text-sm flex items-center gap-1 min-w-[90px] justify-center transition-colors ${
                    dictSaving === 'saved'
                      ? 'bg-green-500'
                      : 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
                  }`}
                >
                  {dictSaving === 'saving' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving</>
                  ) : dictSaving === 'saved' ? (
                    <><Check className="h-4 w-4" /> Saved</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Add</>
                  )}
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={dictSearch}
                    onChange={(e) => setDictSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setDictPage(1); fetchDictionary(1, dictSearch); } }}
                    placeholder="Search dictionary..."
                    className="w-full pl-9 pr-4 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => { setDictPage(1); fetchDictionary(1, dictSearch); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Search
                </button>
                {dictSearch && (
                  <button
                    onClick={() => { setDictSearch(''); setDictPage(1); fetchDictionary(1, ''); }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    Clear
                  </button>
                )}
              </div>

              {dictSearch && dictFiltered !== dictTotal && (
                <p className="text-xs text-gray-500 mb-3">Showing {dictFiltered} of {dictTotal} terms matching &ldquo;{dictSearch}&rdquo;</p>
              )}

              {dictEntries.length === 0 && !dictLoading ? (
                <div className="text-center py-8 text-gray-400">
                  {dictSearch ? 'No terms matching search' : 'No dictionary terms. Add terms above for guaranteed redaction.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {dictEntries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100">
                      <div className="flex-1">
                        <span className="text-sm font-medium">{entry.term}</span>
                        <div className="flex gap-2 mt-0.5">
                          {entry.caseSensitive && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">case-sensitive</span>
                          )}
                          {entry.wholeWord && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">whole word</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteDictEntry(entry.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded ml-2"
                        title="Remove term"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {dictLoading && (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              )}

              {dictPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <button
                    onClick={() => { const p = dictPage - 1; setDictPage(p); fetchDictionary(p); }}
                    disabled={dictPage <= 1}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-500">
                    Page {dictPage} of {dictPages}
                  </span>
                  <button
                    onClick={() => { const p = dictPage + 1; setDictPage(p); fetchDictionary(p); }}
                    disabled={dictPage >= dictPages}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'settings' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-blue-600" />
                  Runtime Settings
                </CardTitle>
                <div className="flex gap-2">
                  <button onClick={fetchSettings} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${settingsLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={saveSettings}
                    disabled={!settingsDirty || settingsLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!settings ? (
                <div className="text-center py-8 text-gray-400">Loading settings...</div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Redaction Layers</h3>
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center pt-5 pb-3">
                        <div className="w-0.5 flex-1 bg-blue-400" />
                        <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-blue-400" />
                      </div>
                      <div className="flex-1 space-y-2">
                        {(['enableDictionary', 'enableNER', 'enableRegex', 'enableNames'] as const).map(key => (
                          <div key={key} className="p-3 bg-gray-50 rounded">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{
                                key === 'enableDictionary' ? 'Dictionary Layer' :
                                key === 'enableNER' ? 'Local AI' :
                                key === 'enableRegex' ? 'Regex Patterns' :
                                'Name Detection'
                              }</span>
                              <button
                                onClick={() => updateSetting(key, !settings[key])}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  settings[key] ? 'bg-blue-600' : 'bg-gray-300'
                                }`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  settings[key] ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                              </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{
                              key === 'enableDictionary' ? 'User-defined terms, always matched' :
                              key === 'enableNER' ? 'AI-based entity recognition for names, orgs, locations' :
                              key === 'enableRegex' ? 'Emails, phones, government IDs, credit cards' :
                              'Common first names from known name lists'
                            }</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Locale</h3>
                    <div className="p-3 bg-gray-50 rounded">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Regex Pattern Region</label>
                      <select
                        value={settings.locale || ''}
                        onChange={(e) => updateSetting('locale', e.target.value || null)}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All regions (no filtering)</option>
                        <option value="AU">Australia</option>
                        <option value="NZ">New Zealand</option>
                        <option value="UK">United Kingdom</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        {settings.locale
                          ? `Only universal patterns and ${settings.locale}-specific patterns will run. Reduces false positives from other regions.`
                          : 'All regex patterns run regardless of region (AU, NZ, UK, US). May produce false positives from other regions.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Local AI Configuration</h3>
                    <div className="space-y-3">
                      <div className="p-3 bg-gray-50 rounded">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                        <input
                          type="text"
                          value={settings.nerModel || ''}
                          onChange={(e) => updateSetting('nerModel', e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          placeholder="Xenova/bert-base-NER"
                        />
                        <p className="text-xs text-gray-400 mt-1">HuggingFace model ID for token classification</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Confidence: {settings.nerMinConfidence}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.nerMinConfidence}
                          onChange={(e) => updateSetting('nerMinConfidence', parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>0 (all entities)</span>
                          <span>1 (highest confidence only)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Tokenization</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm font-medium">Tokenize Placeholders</span>
                        <button
                          onClick={() => updateSetting('tokenizePlaceholders', !settings.tokenizePlaceholders)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.tokenizePlaceholders ? 'bg-blue-600' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.tokenizePlaceholders ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                          <input
                            type="text"
                            value={settings.placeholderPrefix || ''}
                            onChange={(e) => updateSetting('placeholderPrefix', e.target.value)}
                            className="w-full px-3 py-2 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="p-3 bg-gray-50 rounded">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
                          <input
                            type="text"
                            value={settings.placeholderSuffix || ''}
                            onChange={(e) => updateSetting('placeholderSuffix', e.target.value)}
                            className="w-full px-3 py-2 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
