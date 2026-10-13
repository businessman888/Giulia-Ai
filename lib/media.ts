import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffprobe from 'ffprobe-static';
import sharp from 'sharp';

export type MediaInfo = { kind: 'image' | 'video'; mime: string; extension: 'jpg' | 'png' | 'mp4'; duration: number | null };

function detectedType(bytes: Buffer): Omit<MediaInfo, 'duration'> | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { kind: 'image', mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { kind: 'image', mime: 'image/png', extension: 'png' };
  if (bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return { kind: 'video', mime: 'video/mp4', extension: 'mp4' };
  return null;
}

export async function inspectMedia(bytes: Buffer, fileName: string, claimedMime: string): Promise<MediaInfo> {
  const type = detectedType(bytes);
  if (!type) throw new Error('Formato não aceito. Use MP4, JPG ou PNG.');
  const extension = path.extname(fileName).toLowerCase();
  const allowed = type.extension === 'jpg' ? ['.jpg', '.jpeg'] : [`.${type.extension}`];
  if (!allowed.includes(extension) || claimedMime !== type.mime) throw new Error('Tipo e extensão do arquivo não coincidem.');
  if (bytes.length > (type.kind === 'video' ? 100 : 15) * 1024 * 1024) throw new Error('Arquivo excede o tamanho permitido.');
  if (type.kind === 'image') {
    try {
      await sharp(bytes, { limitInputPixels: 50_000_000 }).stats();
    } catch {
      throw new Error('Arquivo de imagem inválido ou muito grande.');
    }
    return { ...type, duration: null };
  }
  const folder = await mkdtemp(path.join(os.tmpdir(), 'wan-probe-'));
  try {
    const target = path.join(folder, 'input.mp4');
    await writeFile(target, bytes);
    const duration = await new Promise<number>((resolve, reject) => {
      const command = spawn(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', target], { windowsHide: true });
      let output = '';
      command.stdout.on('data', data => { output += data.toString(); });
      command.on('error', reject);
      command.on('close', code => code === 0 ? resolve(Number(output.trim())) : reject(new Error('Duração do vídeo inválida.')));
    });
    if (!Number.isFinite(duration) || duration < 1 || duration > 30) throw new Error('Duração do vídeo deve ser de 1 a 30 segundos.');
    return { ...type, duration };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
