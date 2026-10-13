import { z } from 'zod';

export const MODEL_ID = 'alibaba/wan-3.0/reference-to-video';
export const COST_PER_SECOND = { '480p': 0.05, '720p': 0.10, '1080p': 0.20 } as const;
export const generationInput = z.object({
  idempotencyKey: z.uuid(),
  prompt: z.string().trim().min(1).max(12000),
  duration: z.number().int().min(2).max(30),
  resolution: z.enum(['480p', '720p', '1080p']),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive']),
  generateAudio: z.boolean(),
  enableThinking: z.boolean(),
  seed: z.number().int().min(0).max(2147483647).nullable(),
  videoIds: z.array(z.string()).max(5),
  imageIds: z.array(z.string()).max(10),
  confirmedEstimatedUsd: z.number().nonnegative(),
});
export type GenerationInput = z.infer<typeof generationInput>;

export function estimatedCost(duration: number, resolution: keyof typeof COST_PER_SECOND) {
  return Math.round(duration * COST_PER_SECOND[resolution] * 100) / 100;
}

export function validateReferenceLimits(videos: { duration: number | null }[], images: unknown[]) {
  if (videos.length > 5 || images.length > 10) throw new Error('Limite de 5 vídeos e 10 imagens por geração.');
  if (!videos.length && !images.length) throw new Error('Envie ao menos uma referência.');
  if (videos.some(v => v.duration === null || v.duration < 1 || v.duration > 30)) throw new Error('Cada vídeo deve durar de 1 a 30 segundos.');
  if (videos.reduce((sum, v) => sum + (v.duration ?? 0), 0) > 30.001) throw new Error('A soma dos vídeos deve ter no máximo 30 segundos.');
}
