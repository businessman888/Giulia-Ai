import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const sdk = vi.hoisted(() => ({ subscribe: vi.fn(), config: vi.fn() }));
vi.mock('@higgsfield/client/v2', () => ({ higgsfield: { subscribe: sdk.subscribe }, config: sdk.config }));
import { getWanStatus, submitWan } from '../lib/provider';

const requestId = 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff';
const statusUrl = `https://api.higgsfield.ai/requests/${requestId}/status`;
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('integração Higgsfield com SDK simulado', () => {
  it('faz uma única chamada ao Wan com vídeo, imagem e prompt juntos', async () => {
    sdk.subscribe.mockResolvedValueOnce({ status: 'queued', request_id: requestId, status_url: statusUrl });
    const receipt = await submitWan({
      finalPrompt: 'Imagem 1 usa o movimento do Vídeo 1', imageUrls: ['https://assets.example/image.jpg'],
      videoUrls: ['https://assets.example/video.mp4'], duration: 5, resolution: '720p',
      aspectRatio: '16:9', generateAudio: true, enableThinking: false, seed: null,
    }, 'id:secret', 'local-job-id');
    expect(receipt).toEqual({ requestId, statusUrl });
    expect(sdk.config).toHaveBeenCalledWith({ credentials: 'id:secret', headers: { 'Idempotency-Key': 'local-job-id' } });
    expect(sdk.subscribe).toHaveBeenCalledTimes(1);
    expect(sdk.subscribe).toHaveBeenCalledWith('alibaba/wan-3.0/reference-to-video', {
      input: { prompt: 'Imagem 1 usa o movimento do Vídeo 1', image_urls: ['https://assets.example/image.jpg'], video_urls: ['https://assets.example/video.mp4'], duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: true, enable_thinking: false }, withPolling: false,
    });
  });
  it('consulta o resultado pelo identificador sem submeter outra geração', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'completed', video: { url: 'https://example.com/video.mp4' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getWanStatus(statusUrl, requestId, 'id:secret');
    expect(result.video?.url).toBe('https://example.com/video.mp4');
    expect(fetchMock).toHaveBeenCalledWith(statusUrl, expect.objectContaining({ headers: { Authorization: 'Key id:secret' }, redirect: 'error' }));
    expect(sdk.subscribe).not.toHaveBeenCalled();
  });
  it('recusa endereço de acompanhamento fora da Higgsfield', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getWanStatus(`https://example.com/requests/${requestId}/status`, requestId, 'id:secret')).rejects.toThrow('endereço de acompanhamento');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('não chama o serviço com credencial incompleta', async () => {
    await expect(submitWan({ finalPrompt: 'Cena', imageUrls: [], videoUrls: [], duration: 5, resolution: '720p', aspectRatio: 'adaptive', generateAudio: true, enableThinking: false, seed: 1 }, 'somente-id', 'local-job-id')).rejects.toThrow('HF_CREDENTIALS');
  });
});
