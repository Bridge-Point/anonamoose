'use client';

import { useEffect, useState, useCallback } from 'react';
import { Shield, Trash2, Search, RefreshCw, ArrowLeft, AlertTriangle, Lock } from 'lucide-react';
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

type Tab = 'logs' | 'sessions';

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/verify', {
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
                placeholder="Enter STATS_TOKEN"
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

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_token');
    if (stored) setAdminToken(stored);
  }, []);

  const authHeaders = useCallback(() => ({
    'X-Admin-Token': adminToken || '',
  }), [adminToken]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchLogs = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/logs?limit=200', { headers: authHeaders() });
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
    const res = await fetch('/api/logs', { method: 'DELETE', headers: authHeaders() });
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
      const url = query ? `/api/sessions?q=${encodeURIComponent(query)}` : '/api/sessions';
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
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      setSessions(prev => prev.filter(s => s.sessionId !== id));
      showMessage('Session deleted', 'success');
    } else {
      showMessage('Failed to delete session', 'error');
    }
  };

  const flushAll = async () => {
    const res = await fetch('/api/sessions', { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setSessions([]);
      setConfirmFlush(false);
      showMessage(`Flushed ${data.deletedCount} sessions`, 'success');
    } else {
      showMessage('Failed to flush sessions', 'error');
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
  }, [tab, adminToken, fetchLogs, fetchSessions]);

  useEffect(() => {
    if (!adminToken || tab !== 'logs') return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [tab, adminToken, fetchLogs]);

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
      </div>
    </div>
  );
}
