import { config, higgsfield } from '@higgsfield/client/v2';
import { MODEL_ID } from './generation';

export class WanError extends Error {}
export class WanPollRetryableError extends WanError {}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateWanStatusUrl(statusUrl: string, requestId: string) {
  if (!REQUEST_ID.test(requestId)) throw new WanError('A Higgsfield não retornou um identificador de solicitação válido.');
  let url: URL;
  try { url = new URL(statusUrl); } catch { throw new WanError('A Higgsfield não retornou um endereço de acompanhamento válido.'); }
  if (url.origin !== 'https://api.higgsfield.ai' || url.pathname !== `/requests/${requestId}/status` || url.search || url.hash || url.username || url.password) {
    throw new WanError('A Higgsfield não retornou um endereço de acompanhamento válido.');
  }
  return url.toString();
}

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

export async function submitWan(input: Parameters<typeof buildWanPayload>[0], credentials: string, idempotencyKey: string) {
  if (!/^[^:]+:[^:]+$/.test(credentials)) throw new Error('HF_CREDENTIALS inválida');
  config({ credentials, headers: { 'Idempotency-Key': idempotencyKey } });
  try {
    const result = await higgsfield.subscribe(MODEL_ID, { input: buildWanPayload(input), withPolling: false });
    return { requestId: result.request_id, statusUrl: validateWanStatusUrl(result.status_url, result.request_id) };
  } catch (error) {
    if (error instanceof WanError) throw error;
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 401) throw new WanError('A Higgsfield recusou as credenciais da API.');
    if (code === 403) throw new WanError('A Higgsfield informou saldo insuficiente para a geração.');
    if (code === 400 || code === 422) throw new WanError('A Higgsfield recusou os parâmetros enviados. Verifique os limites do modelo.');
    throw new WanError('Não foi possível confirmar o envio à Higgsfield. Confira o painel da conta antes de tentar novamente.');
  }
}

export async function getWanStatus(statusUrl: string, requestId: string, credentials: string) {
  const url = validateWanStatusUrl(statusUrl, requestId);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Key ${credentials}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  } catch {
    throw new WanPollRetryableError('Falha temporária ao consultar a Higgsfield.');
  }
  if (response.status >= 500 || response.status === 429) throw new WanPollRetryableError('A Higgsfield está temporariamente indisponível.');
  if (response.status === 401 || response.status === 403) throw new WanError('A Higgsfield recusou as credenciais ao consultar a solicitação.');
  if (response.status === 404) throw new WanError('A solicitação não foi encontrada na conta Higgsfield.');
  if (!response.ok) throw new WanError(`Falha ao consultar a Higgsfield (HTTP ${response.status}).`);
  let result: { status?: string; video?: { url?: string } };
  try { result = await response.json(); } catch { throw new WanPollRetryableError('Resposta temporariamente inválida da Higgsfield.'); }
  if (!['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled'].includes(result.status || '')) {
    throw new WanPollRetryableError('Estado temporariamente desconhecido da Higgsfield.');
  }
  return result as { status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'; video?: { url?: string } };
}
