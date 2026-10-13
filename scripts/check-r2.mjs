import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function main() {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('R2ConfigMissing');
  }

  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION || 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  const key = `setup-check/${randomUUID()}.txt`;
  let created = false;

  try {
    await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: 'ok', ContentType: 'text/plain' }));
    created = true;
    const result = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    if (await result.Body.transformToString() !== 'ok') throw new Error('R2ContentMismatch');
    process.stdout.write('R2: gravação e leitura OK\n');
  } finally {
    if (created) {
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      process.stdout.write('R2: arquivo de teste removido\n');
    }
    client.destroy();
  }
}

main().catch(error => {
  process.stderr.write(`R2: falhou (${error.name || 'Error'})\n`);
  process.exitCode = 1;
});
