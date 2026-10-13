import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteObject } from '@/lib/storage';
import { unauthorized, checkOrigin } from '@/lib/http';
import { publicGeneration } from '@/lib/public-generation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  const generation = await db.generation.findUnique({ where: { id: (await params).id }, include: { references: { include: { asset: true }, orderBy: { position: 'asc' } } } });
  if (!generation) return NextResponse.json({ error: 'Geração não encontrada.' }, { status: 404 });
  return NextResponse.json({ generation: publicGeneration(generation) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = unauthorized(request) || checkOrigin(request);
  if (rejected) return rejected;
  const id = (await params).id;
  const generation = await db.generation.findUnique({ where: { id } });
  if (!generation) return new NextResponse(null, { status: 404 });
  if (['WAITING', 'SENDING', 'PROCESSING'].includes(generation.status)) return NextResponse.json({ error: 'Aguarde o fim do processamento para excluir.' }, { status: 409 });
  await db.generation.delete({ where: { id } });
  if (generation.resultKey) await deleteObject(generation.resultKey);
  return NextResponse.json({ ok: true });
}
