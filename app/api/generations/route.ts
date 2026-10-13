import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generationInput, estimatedCost, validateReferenceLimits } from '@/lib/generation';
import { unauthorized, checkOrigin, safeError } from '@/lib/http';
import { publicGeneration } from '@/lib/public-generation';

const include = { references: { include: { asset: true }, orderBy: { position: 'asc' as const } } };

export async function GET(request: NextRequest) {
  const rejected = unauthorized(request);
  if (rejected) return rejected;
  const generations = await db.generation.findMany({ include, orderBy: { createdAt: 'desc' }, take: 100 });
  return NextResponse.json({ generations: generations.map(publicGeneration) });
}

export async function POST(request: NextRequest) {
  const rejected = unauthorized(request) || checkOrigin(request);
  if (rejected) return rejected;
  try {
    const input = generationInput.parse(await request.json());
    const previous = await db.generation.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
    if (previous) return NextResponse.json({ generation: publicGeneration(previous) });
    const cost = estimatedCost(input.duration, input.resolution);
    if (input.confirmedEstimatedUsd !== cost) throw new Error('Custo estimado mudou. Confirme novamente.');
    const hourly = await db.generation.count({ where: { createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (hourly >= 20) return NextResponse.json({ error: 'Limite de 20 gerações por hora atingido.' }, { status: 429 });
    const ids = [...input.videoIds, ...input.imageIds];
    if (new Set(ids).size !== ids.length) throw new Error('Referência duplicada.');
    const assets = await db.asset.findMany({ where: { id: { in: ids } } });
    if (assets.length !== ids.length || input.videoIds.some(id => assets.find(a => a.id === id)?.kind !== 'video') || input.imageIds.some(id => assets.find(a => a.id === id)?.kind !== 'image')) throw new Error('Referência inválida. Envie os arquivos novamente.');
    validateReferenceLimits(input.videoIds.map(id => ({ duration: assets.find(a => a.id === id)!.duration })), input.imageIds);
    if (process.env.GENERATION_PROVIDER !== 'mock' && process.env.STORAGE_DRIVER !== 's3') throw new Error('Configure S3 privado antes de gerar vídeos reais.');
    if (process.env.GENERATION_PROVIDER !== 'mock' && !/^[^:]+:[^:]+$/.test(process.env.HF_CREDENTIALS || '')) return NextResponse.json({ error: 'Configure HF_CREDENTIALS no servidor antes de gerar vídeos reais.' }, { status: 503 });
    const generation = await db.generation.create({
      data: {
        idempotencyKey: input.idempotencyKey, prompt: input.prompt, finalPrompt: input.prompt,
        mode: 'custom', consistency: false, duration: input.duration, resolution: input.resolution,
        aspectRatio: input.aspectRatio, generateAudio: input.generateAudio, enableThinking: input.enableThinking,
        seed: input.seed, estimatedUsd: cost,
        references: { create: ids.map((assetId, position) => ({ assetId, position })) },
      }, include,
    });
    return NextResponse.json({ generation: publicGeneration(generation) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 400 });
  }
}
