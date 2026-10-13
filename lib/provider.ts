import { config, higgsfield } from '@higgsfield/client/v2';
import { MODEL_ID } from './generation';

export type WanPayload = {
  prompt: string;
  image_urls: string[];
  video_urls: string[];
  duration: number;
  resolution: string;
  aspect_ratio: string;
  generate_audio: boolean;
  enable_thinking: boolean;
  seed?: number;
};

export function buildWanPayload(input: {
  finalPrompt: string; imageUrls: string[]; videoUrls: string[]; duration: number; resolution: string;
  aspectRatio: string; generateAudio: boolean; enableThinking: boolean; seed: number | null;
}): WanPayload {
  return {
    prompt: input.finalPrompt, image_urls: input.imageUrls, video_urls: input.videoUrls,
    duration: input.duration, resolution: input.resolution, aspect_ratio: input.aspectRatio,
    generate_audio: input.generateAudio, enable_thinking: input.enableThinking,
    ...(input.seed === null ? {} : { seed: input.seed }),
  };
}

export async function generateWithWan(input: Parameters<typeof buildWanPayload>[0], credentials: string) {
  if (!/^[^:]+:[^:]+$/.test(credentials)) throw new Error('HF_CREDENTIALS inválida');
  config({ credentials });
  const result = await higgsfield.subscribe(MODEL_ID, { input: buildWanPayload(input), withPolling: true });
  if (result.status !== 'completed' || !result.video?.url) throw new Error('A API não retornou um vídeo concluído');
  return result.video.url;
}
