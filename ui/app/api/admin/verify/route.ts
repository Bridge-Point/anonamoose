import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { token } = await request.json();
  const apiToken = process.env.API_TOKEN || '';

  if (!apiToken || token !== apiToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
