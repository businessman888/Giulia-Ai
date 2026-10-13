import type { Generation } from '@prisma/client';

type WithReferences = Generation & { references: { asset: { id: string; kind: string; name: string; duration: number | null }; position: number }[] };

export function publicGeneration(g: WithReferences) {
  return {
    id: g.id, status: g.status, prompt: g.prompt, finalPrompt: g.finalPrompt, mode: g.mode, consistency: g.consistency,
    duration: g.duration, resolution: g.resolution, aspectRatio: g.aspectRatio, generateAudio: g.generateAudio,
    enableThinking: g.enableThinking, seed: g.seed, estimatedUsd: g.estimatedUsd, errorMessage: g.errorMessage,
    createdAt: g.createdAt, completedAt: g.completedAt,
    resultUrl: g.resultKey ? `/api/generations/${g.id}/video` : null,
    references: g.references.map(r => ({ id: r.asset.id, kind: r.asset.kind, name: r.asset.name, duration: r.asset.duration, url: `/api/assets/${r.asset.id}` })),
  };
}
