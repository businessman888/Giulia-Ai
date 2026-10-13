import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { inspectMedia } from '@/lib/media';
import { putObject } from '@/lib/storage';
import { unauthorized, checkOrigin, safeError } from '@/lib/http';

export async function POST(request: NextRequest) {
  const rejected = unauthorized(request) || checkOrigin(request);
  if (rejected) return rejected;
  try {
    const count = await db.asset.count({ where: { createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (count >= 100) return NextResponse.json({ error: 'Limite de uploads por hora atingido.' }, { status: 429 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione um arquivo.' }, { status: 400 });
    if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo excede 100 MB.' }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const media = await inspectMedia(bytes, file.name, file.type);
    const key = `uploads/${randomUUID()}.${media.extension}`;
    await putObject(key, bytes, media.mime);
    const asset = await db.asset.create({ data: { kind: media.kind, name: file.name.slice(0, 200), mime: media.mime, storageKey: key, size: bytes.length, duration: media.duration } });
    return NextResponse.json({ asset: { id: asset.id, kind: asset.kind, name: asset.name, duration: asset.duration, url: `/api/assets/${asset.id}` } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 400 });
  }
}
