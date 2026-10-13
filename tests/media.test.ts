import { describe, expect, it } from 'vitest';
import { inspectMedia } from '../lib/media';

describe('validação de arquivos', () => {
  it('rejeita imagem com assinatura PNG mas conteúdo corrompido', async () => {
    const fake = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
    await expect(inspectMedia(fake, 'teste.png', 'image/png')).rejects.toThrow('inválido');
  });
  it('rejeita extensão e MIME que não combinam com os bytes', async () => {
    const fake = Buffer.from([0xff, 0xd8, 0xff, 0]);
    await expect(inspectMedia(fake, 'teste.png', 'image/png')).rejects.toThrow('Tipo');
  });
});
