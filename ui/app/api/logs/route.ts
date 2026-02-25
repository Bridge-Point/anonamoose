import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
  const token = process.env.STATS_TOKEN || '';

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();

  try {
    const response = await fetch(`${apiUrl}/api/v1/logs${qs ? '?' + qs : ''}`, {
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
    const response = await fetch(`${apiUrl}/api/v1/logs`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API' }, { status: 502 });
  }
}
