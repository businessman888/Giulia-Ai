import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const dataRoot = path.join(process.cwd(), 'data', 'objects');
const driver = () => process.env.STORAGE_DRIVER || 'local';

function client() {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('Configure o armazenamento S3.');
  return new S3Client({ endpoint: S3_ENDPOINT, region: S3_REGION || 'auto', forcePathStyle: true, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
}
function bucket() {
  if (!process.env.S3_BUCKET) throw new Error('Configure S3_BUCKET.');
  return process.env.S3_BUCKET;
}
function localPath(key: string) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+\.(mp4|jpg|png)$/.test(key)) throw new Error('Chave de arquivo inválida.');
  return path.join(dataRoot, key);
}

export async function putObject(key: string, bytes: Buffer, mime: string) {
  if (driver() === 's3') {
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: mime, ServerSideEncryption: 'AES256' }));
    return;
  }
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver() === 's3') {
    const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await (result.Body as Readable).toArray().then(chunks => Buffer.concat(chunks.map(c => Buffer.from(c)))));
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string) {
  if (driver() === 's3') await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  else await unlink(localPath(key)).catch(() => {});
}

export async function providerUrl(key: string) {
  if (driver() !== 's3') throw new Error('Armazenamento S3 privado é necessário para geração real.');
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 7 * 86400 });
}
