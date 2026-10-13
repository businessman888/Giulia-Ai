import { describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ subscribe: vi.fn(), config: vi.fn() }));
vi.mock('@higgsfield/client/v2', () => ({ higgsfield: { subscribe: sdk.subscribe }, config: sdk.config }));
import { generateWithWan } from '../lib/provider';

describe('integração Higgsfield com SDK simulado', () => {
  it('faz uma única chamada ao Wan com vídeo, imagem e prompt juntos', async () => {
    sdk.subscribe.mockResolvedValueOnce({ status: 'completed', video: { url: 'https://example.com/video.mp4' } });
    const url = await generateWithWan({
      finalPrompt: 'Imagem 1 usa o movimento do Vídeo 1', imageUrls: ['https://assets.example/image.jpg'],
      videoUrls: ['https://assets.example/video.mp4'], duration: 5, resolution: '720p',
      aspectRatio: '16:9', generateAudio: true, enableThinking: false, seed: null,
    }, 'id:secret');
    expect(url).toBe('https://example.com/video.mp4');
    expect(sdk.config).toHaveBeenCalledWith({ credentials: 'id:secret' });
    expect(sdk.subscribe).toHaveBeenCalledTimes(1);
    expect(sdk.subscribe).toHaveBeenCalledWith('alibaba/wan-3.0/reference-to-video', {
      input: { prompt: 'Imagem 1 usa o movimento do Vídeo 1', image_urls: ['https://assets.example/image.jpg'], video_urls: ['https://assets.example/video.mp4'], duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: true, enable_thinking: false }, withPolling: true,
    });
  });
  it('não chama o serviço com credencial incompleta', async () => {
    await expect(generateWithWan({ finalPrompt: 'Cena', imageUrls: [], videoUrls: [], duration: 5, resolution: '720p', aspectRatio: 'adaptive', generateAudio: true, enableThinking: false, seed: 1 }, 'somente-id')).rejects.toThrow('HF_CREDENTIALS');
  });
});
