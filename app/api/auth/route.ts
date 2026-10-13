import { NextRequest, NextResponse } from 'next/server';
import { issueSession, sessionCookie, validPassword } from '@/lib/auth';
import { checkOrigin } from '@/lib/http';

const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: NextRequest) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.until > now && entry.count >= 8) return NextResponse.json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const valid = typeof body.password === 'string' && validPassword(body.password);
  if (!valid) {
    attempts.set(ip, { count: (entry?.until && entry.until > now ? entry.count : 0) + 1, until: now + 15 * 60000 });
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
  }
  attempts.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, issueSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 7 * 86400 });
  return response;
}

export async function DELETE(request: NextRequest) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(sessionCookie);
  return response;
}
