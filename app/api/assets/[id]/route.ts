import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getObject, deleteObject } from '@/lib/storage';
import { unauthorized, checkOrigin } from '@/lib/http';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  const asset = await db.asset.findUnique({ where: { id: (await params).id } });
  if (!asset) return new NextResponse(null, { status: 404 });
  const bytes = await getObject(asset.storageKey);
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': `inline; filename="${asset.kind}.${asset.mime.split('/')[1]}"` } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = unauthorized(request) || checkOrigin(request);
  if (rejected) return rejected;
  const asset = await db.asset.findUnique({ where: { id: (await params).id }, include: { references: true } });
  if (!asset) return new NextResponse(null, { status: 404 });
  if (asset.references.length) return NextResponse.json({ error: 'Referência utilizada em uma geração.' }, { status: 409 });
  await db.asset.delete({ where: { id: asset.id } });
  await deleteObject(asset.storageKey);
  return NextResponse.json({ ok: true });
}
