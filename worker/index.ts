import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { db } from '../lib/db';
import { providerUrl, putObject, deleteObject } from '../lib/storage';
import { getWanStatus, submitWan, WanError, WanPollRetryableError } from '../lib/provider';

const mock = process.env.GENERATION_PROVIDER === 'mock';
let stopping = false;

async function makeMockVideo(duration: number) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'wan-mock-'));
  try {
    const target = path.join(folder, 'mock.mp4');
    await new Promise<void>((resolve, reject) => {
      if (!ffmpeg) return reject(new Error('ffmpeg indisponível'));
      const command = spawn(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=24', '-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { windowsHide: true, stdio: 'ignore' });
      command.on('error', reject);
      command.on('close', code => code === 0 ? resolve() : reject(new Error('Falha ao criar vídeo simulado')));
    });
    return await readFile(target);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function publicIp(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  const value = address.toLowerCase();
  return !(value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80') || value.startsWith('::ffff:'));
}

async function fetchVideo(url: string) {
  let current = url;
  let response: Response | undefined;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('URL de resultado inválida');
    const addresses = await lookup(parsed.hostname, { all: true });
    if (!addresses.length || addresses.some(a => !publicIp(a.address))) throw new Error('Endereço de resultado inválido');
    response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento de resultado inválido');
      current = new URL(location, current).toString();
      continue;
    }
    break;
  }
  if (!response || (response.status >= 300 && response.status < 400)) throw new Error('Redirecionamento de resultado excessivo');
  if (!response.ok || !response.body) throw new Error('Não foi possível copiar o vídeo final');
  const limit = 250 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.length;
    if (size > limit) throw new Error('Vídeo final excede 250 MB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('O resultado não é MP4 válido');
  return bytes;
}

async function waitForWanVideo(statusUrl: string, requestId: string, credentials: string) {
  let delay = 2000;
  while (true) {
    try {
      const result = await getWanStatus(statusUrl, requestId, credentials);
      if (result.status === 'completed') {
        if (!result.video?.url) throw new WanError('A Higgsfield concluiu a solicitação sem retornar um vídeo.');
        return { url: result.video.url, canceled: false };
      }
      if (result.status === 'failed') throw new WanError('A Higgsfield informou falha no processamento da solicitação.');
      if (result.status === 'nsfw') throw new WanError('A solicitação foi recusada pela moderação da Higgsfield.');
      if (result.status === 'canceled') return { url: null, canceled: true };
    } catch (error) {
      if (!(error instanceof WanPollRetryableError)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.5), 10000);
  }
}

async function processOne(id: string) {
  const generation = await db.generation.findUnique({ where: { id }, include: { references: { include: { asset: true }, orderBy: { position: 'asc' } } } });
  if (!generation) return;
  let requestId = generation.providerRequestId;
  let stage = 'preparing';
  try {
    let bytes: Buffer;
    if (mock) {
      await db.generation.update({ where: { id }, data: { status: 'PROCESSING' } });
      await new Promise(resolve => setTimeout(resolve, 1800));
      bytes = await makeMockVideo(generation.duration);
    } else {
      const credentials = process.env.HF_CREDENTIALS;
      if (!credentials || !/^[^:]+:[^:]+$/.test(credentials)) throw new Error('HF_CREDENTIALS ausente ou inválida');
      let statusUrl = generation.providerStatusUrl;
      if (requestId && !statusUrl) throw new WanError('Falta o endereço para acompanhar esta solicitação.');
      if (!requestId) {
        const imageUrls = await Promise.all(generation.references.filter(r => r.asset.kind === 'image').map(r => providerUrl(r.asset.storageKey)));
        const videoUrls = await Promise.all(generation.references.filter(r => r.asset.kind === 'video').map(r => providerUrl(r.asset.storageKey)));
        stage = 'submitting';
        const receipt = await submitWan({ finalPrompt: generation.finalPrompt, imageUrls, videoUrls, duration: generation.duration, resolution: generation.resolution, aspectRatio: generation.aspectRatio, generateAudio: generation.generateAudio, enableThinking: generation.enableThinking, seed: generation.seed }, credentials, generation.idempotencyKey);
        requestId = receipt.requestId;
        statusUrl = receipt.statusUrl;
        await db.generation.update({ where: { id }, data: { providerRequestId: requestId, providerStatusUrl: statusUrl } });
      }
      await db.generation.update({ where: { id }, data: { status: 'PROCESSING' } });
      stage = 'polling';
      const result = await waitForWanVideo(statusUrl!, requestId!, credentials);
      if (result.canceled) {
        await db.generation.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
        return;
      }
      stage = 'downloading';
      bytes = await fetchVideo(result.url!);
    }
    stage = 'saving';
    const key = `results/${randomUUID()}.mp4`;
    await putObject(key, bytes, 'video/mp4');
    try {
      await db.generation.update({ where: { id }, data: { status: 'COMPLETED', resultKey: key, completedAt: new Date() } });
    } catch (error) {
      await deleteObject(key);
      throw error;
    }
  } catch (error) {
    const message = error instanceof WanError ? error.message
      : stage === 'preparing' ? 'Não foi possível preparar as referências para a Higgsfield.'
      : stage === 'submitting' ? 'Não foi possível confirmar o envio à Higgsfield. Confira o painel da conta antes de tentar novamente.'
      : stage === 'downloading' || stage === 'saving' ? 'O vídeo foi gerado, mas não pôde ser salvo no estúdio.'
      : 'Não foi possível acompanhar a solicitação na Higgsfield.';
    await db.generation.update({ where: { id }, data: { status: 'FAILED', errorMessage: `${message}${requestId ? ` ID Higgsfield: ${requestId}.` : ''}`, completedAt: new Date() } });
  }
}

async function cleanup() {
  const old = await db.asset.findMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600000) }, references: { none: {} } }, take: 50 });
  for (const asset of old) {
    await db.asset.delete({ where: { id: asset.id } });
    await deleteObject(asset.storageKey);
  }
}

async function main() {
  // Envios sem recibo são ambíguos; os que possuem ID são apenas consultados, nunca reenviados.
  await db.generation.updateMany({ where: { status: { in: ['SENDING', 'PROCESSING'] }, providerRequestId: null }, data: { status: 'FAILED', errorMessage: 'Envio interrompido sem identificador. Verifique a solicitação na Higgsfield antes de tentar novamente.', completedAt: new Date() } });
  let lastCleanup = 0;
  while (!stopping) {
    if (Date.now() - lastCleanup > 3600000) { await cleanup(); lastCleanup = Date.now(); }
    const pending = await db.generation.findFirst({ where: { status: { in: ['SENDING', 'PROCESSING'] }, providerRequestId: { not: null } }, orderBy: { createdAt: 'asc' } });
    if (pending) await processOne(pending.id);
    else {
      const next = await db.generation.findFirst({ where: { status: 'WAITING' }, orderBy: { createdAt: 'asc' } });
      if (!next) { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
      const claimed = await db.generation.updateMany({ where: { id: next.id, status: 'WAITING' }, data: { status: 'SENDING', startedAt: new Date() } });
      if (claimed.count) await processOne(next.id);
    }
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
main().catch(() => { process.exitCode = 1; }).finally(() => db.$disconnect());
