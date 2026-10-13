import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { generation: { findUnique: state.findUnique, count: state.count, create: state.create }, asset: { findMany: state.findMany } } }));
vi.mock('@/lib/http', () => ({ unauthorized: () => null, checkOrigin: () => null, safeError: (e: Error) => e.message }));
import { POST } from '../app/api/generations/route';

const input = { idempotencyKey: 'dd522158-7e94-45c0-b146-196fe111c37a', prompt: 'Uma cena', finalPrompt: 'Imagem 1 no Vídeo 1', mode: 'motion', consistency: true, duration: 5, resolution: '720p', aspectRatio: 'adaptive', generateAudio: true, enableThinking: false, seed: null, videoIds: ['v1'], imageIds: ['i1'], confirmedEstimatedUsd: 0.5 };
function request(body: unknown) { return new NextRequest('http://localhost:3000/api/generations', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }); }

describe('submissão de geração', () => {
  beforeEach(() => {
    vi.clearAllMocks(); process.env.GENERATION_PROVIDER = 'mock';
    state.findUnique.mockResolvedValue(null); state.count.mockResolvedValue(0);
    state.findMany.mockResolvedValue([{ id: 'v1', kind: 'video', duration: 5 }, { id: 'i1', kind: 'image', duration: null }]);
    state.create.mockImplementation(async ({ data }) => ({ id: 'g1', status: 'WAITING', createdAt: new Date(), completedAt: null, errorMessage: null, resultKey: null, ...data, references: [{ position: 0, asset: { id: 'v1', kind: 'video', name: 'v.mp4', duration: 5 } }, { position: 1, asset: { id: 'i1', kind: 'image', name: 'i.jpg', duration: null } }] }));
  });
  it('salva as duas referências no mesmo job', async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledTimes(1);
    const created = state.create.mock.calls[0][0].data;
    expect(created.references.create).toEqual([{ assetId: 'v1', position: 0 }, { assetId: 'i1', position: 1 }]);
    expect((await response.json()).generation.references).toHaveLength(2);
  });
  it('bloqueia custo não confirmado', async () => {
    const response = await POST(request({ ...input, confirmedEstimatedUsd: 0 }));
    expect(response.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
  it('reaproveita chave idempotente sem novo job', async () => {
    state.findUnique.mockResolvedValue({ id: 'g1', ...input, estimatedUsd: 0.5, status: 'WAITING', resultKey: null, references: [] });
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(state.create).not.toHaveBeenCalled();
  });
});
