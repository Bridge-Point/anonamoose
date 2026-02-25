import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
  const token = process.env.STATS_TOKEN || '';

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  const endpoint = q
    ? `${apiUrl}/api/v1/sessions/search?q=${encodeURIComponent(q)}`
    : `${apiUrl}/api/v1/sessions`;

  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API' }, { status: 502 });
  }
}

export async function DELETE() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
  const token = process.env.STATS_TOKEN || '';

  try {
    const response = await fetch(`${apiUrl}/api/v1/sessions/flush`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API' }, { status: 502 });
  }
}
