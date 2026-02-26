'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Activity, Database, Settings, BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

interface Stats {
  requestsRedacted: number;
  requestsHydrated: number;
  piiDetected: number;
  dictionaryHits: number;
  regexHits: number;
  namesHits: number;
  nerHits: number;
  activeSessions: number;
  dictionarySize: number;
  storageConnected: boolean;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/v1/stats/public');

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError('Failed to connect to Anonamoose API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-gray-600">Loading stats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-6 w-6" />
              Error
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <button onClick={fetchStats} className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold">Anonamoose</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${stats?.storageConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {stats?.storageConnected ? 'Database Connected' : 'Database Disconnected'}
                </span>
              </div>
              <a href="https://docs.anonamoose.net" target="_blank" rel="noopener noreferrer" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Documentation">
                <BookOpen className="h-5 w-5" />
              </a>
              <Link href="/admin" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Admin Panel">
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Requests Redacted</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.requestsRedacted.toLocaleString()}</div>
              <p className="text-xs text-gray-500">Total redactions performed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">PII Detected</CardTitle>
              <ShieldAlert className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.piiDetected.toLocaleString()}</div>
              <p className="text-xs text-gray-500">Total PII findings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.activeSessions}</div>
              <p className="text-xs text-gray-500">Current rehydration sessions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Dictionary Size</CardTitle>
              <Database className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.dictionarySize}</div>
              <p className="text-xs text-gray-500">Guaranteed redaction terms</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detection by Layer</CardTitle>
              <CardDescription>PII detected by redaction layer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-3 pb-1">
                  <div className="w-0.5 flex-1 bg-blue-400" />
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-blue-400" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Dictionary (Guaranteed)</span>
                      <span className="text-lg font-bold text-green-600">{stats?.dictionaryHits}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">User-defined terms, always matched</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${stats?.piiDetected ? ((stats?.dictionaryHits || 0) / (stats?.piiDetected || 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Local AI</span>
                      <span className="text-lg font-bold text-purple-600">{stats?.nerHits}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">AI-based entity recognition for names, orgs, locations</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${stats?.piiDetected ? ((stats?.nerHits || 0) / (stats?.piiDetected || 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Regex Patterns</span>
                      <span className="text-lg font-bold text-blue-600">{stats?.regexHits}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Emails, phones, government IDs, credit cards</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${stats?.piiDetected ? ((stats?.regexHits || 0) / (stats?.piiDetected || 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Name Detection</span>
                      <span className="text-lg font-bold text-orange-600">{stats?.namesHits}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Common first names from known name lists</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-orange-600 h-2 rounded-full"
                        style={{ width: `${stats?.piiDetected ? ((stats?.namesHits || 0) / (stats?.piiDetected || 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rehydration</CardTitle>
              <CardDescription>Restoring redacted data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <div className="text-4xl font-bold text-blue-600">{stats?.requestsHydrated.toLocaleString()}</div>
                <p className="text-sm text-gray-500 mt-2">Requests hydrated</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
              <CardDescription>Current system health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm">API Status</span>
                  <span className="text-green-600 font-medium">Online</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm">Database</span>
                  <span className={stats?.storageConnected ? 'text-green-600' : 'text-red-600'}>
                    {stats?.storageConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm">NER Layer</span>
                  <span className="text-gray-600">Available</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
