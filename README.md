# Giulia AI

Estúdio privado em português brasileiro para criar vídeos com **Alibaba Wan 3.0 Reference-to-Video** pela API da Higgsfield. Vídeos de movimento, imagens de aparência e prompt seguem juntos na mesma chamada ao modelo.

## O que funciona

- Login privado com cookie assinado e senha definida no servidor.
- Upload direto do computador, prévia, remoção e reordenação de até 5 vídeos e 10 imagens.
- Validação no servidor de assinatura do arquivo, extensão, MIME, tamanho e duração. Por segurança, esta versão aceita **MP4, JPG e PNG**. Cada vídeo: 1–30 s; soma dos vídeos: até 30 s.
- Prompt único enviado sem instruções automáticas, seed opcional, duração, resolução, proporção, áudio e Deep Thinking.
- Estimativa de custo e confirmação antes da geração. Em modo simulado não há cobrança.
- Fila persistente em SQLite com worker separado. O navegador consulta os estados reais `WAITING`, `SENDING`, `PROCESSING`, `COMPLETED`, `FAILED` e `CANCELLED`.
- Resultado MP4 copiado para armazenamento próprio, reprodução, download, histórico, detalhes, reutilização e exclusão.
- Armazenamento local no modo simulado e bucket privado S3/R2 para produção.

## Início rápido sem gastar créditos

Requisitos: Node.js 22 ou 24 e npm.

```powershell
npm ci
Copy-Item .env.example .env
```

Edite `.env` com `ADMIN_PASSWORD` (pelo menos 12 caracteres) e `SESSION_SECRET` (pelo menos 32 caracteres aleatórios). Mantenha `GENERATION_PROVIDER=mock` e `STORAGE_DRIVER=local`. O `.env` é ignorado pelo Git. Este checkout já pode conter um `.env` local gerado para teste; substitua a senha antes de uso pessoal.

```powershell
npm run db:migrate
npm run dev
```

Em outro terminal:

```powershell
npm run worker
```

Abra `http://localhost:3000`, entre com a senha de `.env`, envie uma imagem e/ou vídeo e gere. O worker produz um MP4 de teste visual. O conteúdo desse MP4 é **simulado**, sem chamada à Higgsfield.

## Produção com Higgsfield e Cloudflare R2

Configure no servidor e no processo do worker:

```dotenv
GENERATION_PROVIDER=higgsfield
HF_CREDENTIALS=KEY_ID:KEY_SECRET
STORAGE_DRIVER=s3
S3_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=wan-studio-private
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
APP_ORIGIN=https://seu-dominio.com
```

Crie um bucket **privado** e uma chave R2 com leitura, escrita e exclusão apenas nele. O backend faz upload para o bucket, e o worker assina URLs de leitura somente quando inicia o job. Cada URL dura sete dias, cobrindo a fila e o processamento. O resultado é copiado para o bucket e servido por uma rota autenticada.

Confira a conexão R2 com `npm run storage:check`. O comando grava, lê e remove um arquivo pequeno no bucket, sem chamar a Higgsfield. Configure a credencial Higgsfield completa diretamente no ambiente privado. Não a envie ao frontend nem faça commit do `.env`. A chamada real ao modelo ainda exige validação com créditos.

Para deploy em um único servidor/VM com volume persistente:

1. Defina as variáveis de ambiente e monte um volume para o arquivo SQLite (`prisma/dev.db` para a URL de exemplo). Use `DATABASE_URL=file:/caminho/persistente/wan.db` se preferir outro local.
2. Rode `npm ci`, `npm run db:migrate` e `npm run build`.
3. Execute `npm run start` e **exatamente um** processo `npm run worker` como serviços supervisionados.
4. Use proxy HTTPS para a aplicação, configure `APP_ORIGIN` com a origem exata e limite o corpo de upload no proxy a aproximadamente 110 MB.
5. Faça backup do banco SQLite e do bucket. Restringa rede, acesso ao `.env` e permissões do volume.

Esta arquitetura usa SQLite e um worker para facilitar a execução local e o deploy em instância única. Para múltiplas instâncias, migre o schema Prisma para PostgreSQL e adote uma fila distribuída antes de escalar; não execute dois workers simultâneos com o mecanismo de recuperação atual.

## Como a geração é enviada

O worker usa `@higgsfield/client/v2` exclusivamente no servidor:

```ts
higgsfield.subscribe('alibaba/wan-3.0/reference-to-video', {
  input: {
    prompt: finalPrompt,
    image_urls: imageUrls,
    video_urls: videoUrls,
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
    enable_thinking: enableThinking,
    // seed quando preenchida
  },
  withPolling: false,
});
```

Descreva no próprio prompt como usar cada referência, inclusive movimentos, personagem e cenário. O modelo não garante fidelidade exata de movimentos.

O SDK TypeScript v2 submete o pedido sem aguardar o vídeo; o worker salva o `request_id` e consulta o `status_url` oficial até o estado final. Isso evita o limite padrão de cinco minutos do polling embutido no SDK. Se o worker reiniciar depois de receber o identificador, continua consultando o mesmo pedido sem fazer outra submissão. Um envio interrompido antes de salvar o identificador permanece ambíguo e não é reenviado automaticamente. Confira o painel Higgsfield antes de repetir uma geração nessa situação. A interface não mostra porcentagens fictícias.

## Testes

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` usa SDK simulado: valida payload misto em chamada única, custo, limites, confirmação e idempotência sem consumir créditos. Para um teste ponta a ponta sem cobrança, inicie o servidor e o worker em modo mock e execute:

```powershell
node tests/manual-e2e.mjs
```

Esse script cria arquivos de teste temporários, verifica login, uploads, job, MP4, download e histórico, e remove os registros de teste ao terminar com sucesso.

Na verificação deste checkout, `npm audit --omit=dev` não encontrou vulnerabilidades. A auditoria completa ainda aponta cinco avisos altos transitivos na cadeia de lint do `eslint-config-next`; acompanhe atualizações dessa dependência antes de alterar versões maiores.

## Observações operacionais

- A limpeza automática remove uploads **sem referências** com mais de 24 horas. As referências de gerações no histórico permanecem disponíveis; após excluir a geração, ficam elegíveis para a próxima limpeza.
- Arquivos são servidos apenas a usuários autenticados. A API confere sessão, origem, custo confirmado e limites por hora. Buckets não devem ser públicos.
- O arquivo final é limitado a 250 MB. O proxy de vídeo atual lê o MP4 em memória para atender `Range`; para alto volume, use streaming com autenticação na borda.
- Redirecionamentos HTTPS do link de resultado são limitados e validados antes da cópia. Se a cópia falhar depois de uma geração paga, confira o resultado no painel Higgsfield antes de tentar outra solicitação.
- Verifique preços atuais antes de cobrança real: a UI usa os valores-base informados de US$ 0,05/s (480p), US$ 0,10/s (720p) e US$ 0,20/s (1080p), antes de descontos.

Documentação oficial consultada: [Wan 3.0 Reference-to-Video — Higgsfield API](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/api-reference).
