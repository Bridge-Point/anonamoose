import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
  const statsToken = process.env.STATS_TOKEN || '';

  if (!statsToken) {
    return NextResponse.json({ error: 'STATS_TOKEN not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl}/api/v1/stats`, {
      headers: {
        'Authorization': `Bearer ${statsToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API' }, { status: 502 });
  }
}
