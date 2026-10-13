import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const COOKIE = 'wan_session';
const DAYS = 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET deve ter ao menos 32 caracteres');
  return value;
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueSession() {
  const payload = `${Date.now() + DAYS * 86400000}`;
  return `${payload}.${signature(payload)}`;
}

export function validSession(value?: string) {
  if (!value) return false;
  const [payload, mac] = value.split('.');
  if (!payload || !mac || !/^\d+$/.test(payload) || Number(payload) < Date.now()) return false;
  const expected = signature(payload);
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export function hasApiSession(request: NextRequest) {
  return validSession(request.cookies.get(COOKIE)?.value);
}

export async function hasPageSession() {
  return validSession((await cookies()).get(COOKIE)?.value);
}

export const sessionCookie = COOKIE;

export function validPassword(candidate: string) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres');
  const a = createHmac('sha256', secret()).update(candidate).digest();
  const b = createHmac('sha256', secret()).update(password).digest();
  return timingSafeEqual(a, b);
}
