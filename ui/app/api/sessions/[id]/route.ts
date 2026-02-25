import { NextResponse } from 'next/server';

function verifyAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const apiToken = process.env.API_TOKEN || '';
  return !!apiToken && token === apiToken;
}

function authHeader(): Record<string, string> {
  const apiToken = process.env.API_TOKEN || '';
  const statsToken = process.env.STATS_TOKEN || '';
  return { 'Authorization': `Bearer ${apiToken || statsToken}` };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
  const { id } = await params;

  try {
    const response = await fetch(`${apiUrl}/api/v1/sessions/${id}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to API' }, { status: 502 });
  }
}
