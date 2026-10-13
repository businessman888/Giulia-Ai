// Executar somente com GENERATION_PROVIDER=mock e com servidor + worker ativos.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

assert.equal(process.env.GENERATION_PROVIDER, 'mock', 'Teste bloqueado fora do modo simulado');
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const dir = await mkdtemp(path.join(os.tmpdir(), 'wan-e2e-'));
let cookie = '';
async function call(url, options = {}) {
  return fetch(origin + url, { ...options, headers: { ...(options.headers || {}), cookie } });
}
function make(args) {
  const result = spawnSync(ffmpeg, ['-y', ...args], { windowsHide: true, stdio: 'ignore' });
  assert.equal(result.status, 0, 'ffmpeg falhou');
}
async function upload(filePath, type) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.set('file', new File([bytes], path.basename(filePath), { type }));
  const response = await call('/api/assets', { method: 'POST', body: form });
  const data = await response.json();
  assert.equal(response.status, 201, JSON.stringify(data));
  return data.asset;
}
try {
  const imagePath = path.join(dir, 'image.png');
  const videoPath = path.join(dir, 'video.mp4');
  make(['-f', 'lavfi', '-i', 'color=c=purple:s=320x180', '-frames:v', '1', imagePath]);
  make(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath]);
  const login = await fetch(origin + '/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200, 'Login falhou');
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(cookie, 'Cookie ausente');
  const video = await upload(videoPath, 'video/mp4');
  const image = await upload(imagePath, 'image/png');
  const payload = { idempotencyKey: crypto.randomUUID(), prompt: 'Use o vídeo 1 e a imagem 1 para compor a cena', duration: 2, resolution: '480p', aspectRatio: 'adaptive', generateAudio: false, enableThinking: false, seed: null, videoIds: [video.id], imageIds: [image.id], confirmedEstimatedUsd: 0.1 };
  const submit = await call('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const submitted = await submit.json();
  assert.equal(submit.status, 201, JSON.stringify(submitted));
  const id = submitted.generation.id;
  const duplicate = await call('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(duplicate.status, 200, 'Idempotência falhou');
  let generation;
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await call(`/api/generations/${id}`);
    generation = (await response.json()).generation;
    if (['COMPLETED', 'FAILED'].includes(generation.status)) break;
  }
  assert.equal(generation?.status, 'COMPLETED', JSON.stringify(generation));
  const result = await call(`/api/generations/${id}/video?download=1`);
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-disposition') || '', /attachment/);
  assert.ok((await result.arrayBuffer()).byteLength > 1000, 'Vídeo vazio');
  const history = await call('/api/generations');
  assert.ok((await history.json()).generations.some(g => g.id === id), 'Histórico não persistiu');
  const deletion = await call(`/api/generations/${id}`, { method: 'DELETE' });
  assert.equal(deletion.status, 200);
  await call(`/api/assets/${video.id}`, { method: 'DELETE' });
  await call(`/api/assets/${image.id}`, { method: 'DELETE' });
  process.stdout.write('E2E mock: login, dois uploads, job único, idempotência, MP4, download e histórico: OK\n');
} finally {
  await rm(dir, { recursive: true, force: true });
}
