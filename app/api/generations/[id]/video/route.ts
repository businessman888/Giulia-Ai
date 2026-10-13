import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getObject } from '@/lib/storage';
import { unauthorized } from '@/lib/http';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  const generation = await db.generation.findUnique({ where: { id: (await params).id } });
  if (!generation?.resultKey) return new NextResponse(null, { status: 404 });
  const bytes = await getObject(generation.resultKey);
  const range = request.headers.get('range');
  const disposition = request.nextUrl.searchParams.has('download') ? 'attachment' : 'inline';
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': `${disposition}; filename="wan-${generation.id}.mp4"` };
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      if (start <= end && end < bytes.length) return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) } });
    }
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
  }
  return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, 'Content-Length': String(bytes.length) } });
}
