import { NextRequest, NextResponse } from 'next/server';
import { hasApiSession } from './auth';

export function unauthorized(request: NextRequest) {
  if (!hasApiSession(request)) return NextResponse.json({ error: 'A sessão expirou. Entre novamente.' }, { status: 401 });
  return null;
}

export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN;
  if (origin && expected && origin !== expected) return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  return null;
}

export function safeError(error: unknown) {
  if (error instanceof Error && /^(Limite|Envie|Cada vídeo|A soma|Arquivo|Tipo|Duração|Formato|Referência|Custo)/.test(error.message)) return error.message;
  return 'Não foi possível concluir a operação. Tente novamente.';
}
