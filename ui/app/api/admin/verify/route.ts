import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { token } = await request.json();
  const statsToken = process.env.STATS_TOKEN || '';

  if (!statsToken || token !== statsToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
