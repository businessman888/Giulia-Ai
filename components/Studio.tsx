'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clapperboard, Clock3, Copy, Film, GripVertical, Image as ImageIcon, Layers3, LoaderCircle, LogOut, Maximize2, Play, Plus, RotateCcw, Sparkles, Trash2, UploadCloud, WandSparkles, X } from 'lucide-react';
import { composePrompt, estimatedCost, type GenerationInput } from '@/lib/generation';

type Asset = { id: string; kind: 'image' | 'video'; name: string; duration: number | null; url: string };
type Generation = Omit<GenerationInput, 'idempotencyKey' | 'videoIds' | 'imageIds' | 'confirmedEstimatedUsd'> & { id: string; status: string; estimatedUsd: number; errorMessage: string | null; createdAt: string; completedAt: string | null; resultUrl: string | null; references: Asset[] };
type Mode = 'motion' | 'scene' | 'character';
const modeCards: { id: Mode; title: string; text: string; icon: React.ReactNode }[] = [
  { id: 'motion', title: 'Preservar movimento', text: 'Gestos, ritmo e enquadramento', icon: <Film size={17} /> },
  { id: 'scene', title: 'Alterar cenário', text: 'Troque o ambiente da cena', icon: <Layers3 size={17} /> },
  { id: 'character', title: 'Transformar personagem', text: 'Aplique uma aparência de referência', icon: <WandSparkles size={17} /> },
];
const statusText: Record<string, string> = { WAITING: 'Aguardando', SENDING: 'Enviando', PROCESSING: 'Processando', COMPLETED: 'Concluído', FAILED: 'Falhou', CANCELLED: 'Cancelado' };

export default function Studio({ mock }: { mock: boolean }) {
  const [tab, setTab] = useState<'create' | 'history'>('create');
  const [videos, setVideos] = useState<Asset[]>([]);
  const [images, setImages] = useState<Asset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('motion');
  const [consistency, setConsistency] = useState(true);
  const [finalPrompt, setFinalPrompt] = useState('');
  const [promptEdited, setPromptEdited] = useState(false);
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [aspectRatio, setAspectRatio] = useState<GenerationInput['aspectRatio']>('adaptive');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [enableThinking, setEnableThinking] = useState(false);
  const [seed, setSeed] = useState('');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const idempotency = useRef<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const composed = useMemo(() => composePrompt(prompt, mode, consistency), [prompt, mode, consistency]);
  useEffect(() => { if (!promptEdited) setFinalPrompt(composed); }, [composed, promptEdited]);
  const cost = estimatedCost(duration, resolution);
  const selected = selectedId ? generations.find(g => g.id === selectedId) : tab === 'create' ? generations[0] : undefined;
  const active = generations.find(g => ['WAITING', 'SENDING', 'PROCESSING'].includes(g.status));

  const loadGenerations = useCallback(async () => {
    const response = await fetch('/api/generations', { cache: 'no-store' });
    if (response.ok) setGenerations((await response.json()).generations);
  }, []);
  useEffect(() => { loadGenerations(); }, [loadGenerations]);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(loadGenerations, 3000);
    return () => clearInterval(interval);
  }, [active, loadGenerations]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  async function uploadFiles(files: FileList | File[], kind: 'image' | 'video') {
    setError('');
    const existing = kind === 'video' ? videos : images;
    const max = kind === 'video' ? 5 : 10;
    if (existing.length + files.length > max) { setError(`Limite de ${max} ${kind === 'video' ? 'vídeos' : 'imagens'}.`); return; }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append('file', file);
        const response = await fetch('/api/assets', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao enviar arquivo.');
        const asset = data.asset as Asset;
        if (asset.kind !== kind) throw new Error('Arquivo não corresponde ao tipo selecionado.');
        if (kind === 'video') setVideos(current => [...current, asset]); else setImages(current => [...current, asset]);
      }
      setNotice('Referências enviadas com segurança.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha no upload.'); }
    finally { setUploading(false); }
  }

  function move(kind: 'image' | 'video', index: number, direction: number) {
    const setter = kind === 'video' ? setVideos : setImages;
    setter(current => {
      const next = [...current], target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function removeAsset(asset: Asset) {
    if (asset.kind === 'video') setVideos(current => current.filter(a => a.id !== asset.id));
    else setImages(current => current.filter(a => a.id !== asset.id));
    await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' }).catch(() => {});
  }
  function validate() {
    if (!prompt.trim() || !finalPrompt.trim()) return 'Escreva o prompt antes de gerar.';
    if (!videos.length && !images.length) return 'Envie ao menos uma referência de vídeo ou imagem.';
    const total = videos.reduce((n, v) => n + (v.duration || 0), 0);
    if (total > 30) return 'A soma dos vídeos deve ter no máximo 30 segundos.';
    if (mode === 'character' && !images.length) return 'Envie uma imagem para transformar o personagem.';
    if (seed && (!/^\d+$/.test(seed) || Number(seed) > 2147483647)) return 'Seed deve estar entre 0 e 2147483647.';
    return '';
  }
  function openConfirm() { const invalid = validate(); if (invalid) { setError(invalid); return; } setError(''); setConfirm(true); }
  async function submit() {
    if (submitting) return;
    setSubmitting(true); setError('');
    if (!idempotency.current) idempotency.current = crypto.randomUUID();
    const body: GenerationInput = { idempotencyKey: idempotency.current, prompt, finalPrompt, mode, consistency, duration, resolution, aspectRatio, generateAudio, enableThinking, seed: seed ? Number(seed) : null, videoIds: videos.map(v => v.id), imageIds: images.map(i => i.id), confirmedEstimatedUsd: cost };
    try {
      const response = await fetch('/api/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao iniciar geração.');
      idempotency.current = null; setConfirm(false); setSelectedId(data.generation.id); setTab('create');
      await loadGenerations(); setNotice('Geração adicionada à fila.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao gerar.'); setConfirm(false); }
    finally { setSubmitting(false); }
  }
  function reuse(g: Generation) {
    setPrompt(g.prompt); setFinalPrompt(g.finalPrompt); setPromptEdited(true); setMode(g.mode as Mode);
    setConsistency(g.consistency); setDuration(g.duration); setResolution(g.resolution);
    setAspectRatio(g.aspectRatio); setGenerateAudio(g.generateAudio); setEnableThinking(g.enableThinking);
    setSeed(g.seed === null ? '' : String(g.seed)); setVideos(g.references.filter(a => a.kind === 'video'));
    setImages(g.references.filter(a => a.kind === 'image')); setTab('create'); setSelectedId(g.id);
    window.scrollTo({ top: 0, behavior: 'smooth' }); setNotice('Configurações carregadas.');
  }
  async function deleteGeneration(g: Generation) {
    if (!window.confirm('Excluir esta geração do histórico?')) return;
    const response = await fetch(`/api/generations/${g.id}`, { method: 'DELETE' });
    if (!response.ok) { setError((await response.json()).error); return; }
    if (selectedId === g.id) setSelectedId(null);
    await loadGenerations(); setNotice('Geração excluída.');
  }
  async function logout() { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/login'; }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Clapperboard size={20} /></span><span>WAN<span className="brand-light">STUDIO</span></span><span className="brand-beta">BETA</span></div>
      <div className="topbar-center"><span className="top-dot" /> {mock ? 'Modo de demonstração' : 'Higgsfield conectado'} <span className="topbar-divider" /> Wan 3.0 Reference-to-Video</div>
      <button className="ghost-button logout" onClick={logout} title="Sair"><LogOut size={17} /><span>Sair</span></button></header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><h1>Estúdio de criação</h1></div><span className="model-pill"><Sparkles size={14} /> Wan 3.0</span></div>
        <div className="tabs"><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus size={16} /> Criar vídeo</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Clock3 size={16} /> Minhas gerações <span className="tab-count">{generations.length}</span></button></div>
        {tab === 'create' ? <div className="sidebar-scroll">
          <section className="side-section"><div className="section-title"><span className="step-number">01</span><div><h2>Referências</h2><p>Combine vídeo e imagem no mesmo pedido.</p></div></div>
            <input ref={videoInput} type="file" accept="video/mp4" multiple hidden onChange={e => { if (e.target.files) uploadFiles(e.target.files, 'video'); e.target.value = ''; }} />
            <input ref={imageInput} type="file" accept="image/jpeg,image/png" multiple hidden onChange={e => { if (e.target.files) uploadFiles(e.target.files, 'image'); e.target.value = ''; }} />
            <DropArea kind="video" count={videos.length} max={5} onClick={() => videoInput.current?.click()} onFiles={files => uploadFiles(files, 'video')} busy={uploading} />
            {videos.length > 0 && <div className="asset-list">{videos.map((asset, index) => <AssetRow key={asset.id} asset={asset} index={index} length={videos.length} onMove={direction => move('video', index, direction)} onRemove={() => removeAsset(asset)} onPreview={() => setLightbox(asset.url)} />)}</div>}
            <DropArea kind="image" count={images.length} max={10} onClick={() => imageInput.current?.click()} onFiles={files => uploadFiles(files, 'image')} busy={uploading} />
            {images.length > 0 && <div className="image-grid">{images.map((asset, index) => <div className="image-tile" key={asset.id}><button className="image-open" onClick={() => setLightbox(asset.url)}><img src={asset.url} alt={asset.name} /><Maximize2 size={16} /></button><div className="tile-actions"><span>{index + 1}</span><button title="Mover para esquerda" onClick={() => move('image', index, -1)} disabled={index === 0}><ChevronLeft size={15} /></button><button title="Mover para direita" onClick={() => move('image', index, 1)} disabled={index === images.length - 1}><ChevronRight size={15} /></button><button title="Remover" onClick={() => removeAsset(asset)}><X size={15} /></button></div></div>)}</div>}
            <div className="limit-note">MP4 até 100 MB · JPG/PNG até 15 MB · vídeos: 1–30 s cada, 30 s no total.</div>
          </section>
          <section className="side-section"><div className="section-title"><span className="step-number">02</span><div><h2>Direção criativa</h2><p>Descreva o resultado desejado.</p></div></div>
            <label className="field-label" htmlFor="prompt">Seu prompt</label><textarea id="prompt" className="prompt-input" placeholder="Ex.: Use o movimento do Vídeo 1 e a aparência da Imagem 1. Transforme o cenário em um estúdio cinematográfico..." value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={12000} rows={5} />
            <div className="field-label">Como usar as referências</div><div className="mode-list">{modeCards.map(card => <button key={card.id} className={`mode-card ${mode === card.id ? 'selected' : ''}`} onClick={() => setMode(card.id)}><span className="mode-icon">{card.icon}</span><span><strong>{card.title}</strong><small>{card.text}</small></span><span className="radio-dot" /></button>)}</div>
            <label className="toggle-row"><span><strong>Consistência visual</strong><small>Reforçar aparência e detalhes ao longo do vídeo</small></span><input type="checkbox" checked={consistency} onChange={e => setConsistency(e.target.checked)} /><i /></label>
            <div className="final-prompt-head"><label className="field-label" htmlFor="finalPrompt">Prompt final enviado à API</label><button className="text-button" onClick={() => { setFinalPrompt(composed); setPromptEdited(false); }}><RotateCcw size={13} /> Restaurar</button></div>
            <textarea id="finalPrompt" className="final-prompt" value={finalPrompt} onChange={e => { setFinalPrompt(e.target.value); setPromptEdited(true); }} rows={6} maxLength={16000} />
            <div className="limit-note">Você pode editar o texto final. A preservação de movimento depende do modelo.</div>
          </section>
          <section className="side-section"><div className="section-title"><span className="step-number">03</span><div><h2>Configurações</h2><p>Defina o formato do vídeo final.</p></div></div>
            <div className="field-label split"><span>Duração</span><strong>{duration} s</strong></div><input className="range" type="range" min="2" max="30" value={duration} onChange={e => setDuration(Number(e.target.value))} /><div className="range-labels"><span>2 s</span><span>30 s</span></div>
            <div className="field-label">Resolução</div><div className="segmented">{(['480p', '720p', '1080p'] as const).map(item => <button key={item} className={resolution === item ? 'active' : ''} onClick={() => setResolution(item)}>{item}</button>)}</div>
            <div className="field-label">Proporção</div><div className="select-wrap"><select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as GenerationInput['aspectRatio'])}><option value="adaptive">Adaptativa</option><option value="16:9">16:9 · Paisagem</option><option value="4:3">4:3 · Clássica</option><option value="1:1">1:1 · Quadrada</option><option value="3:4">3:4 · Retrato</option><option value="9:16">9:16 · Vertical</option></select><ChevronDown size={16} /></div>
            <label className="toggle-row"><span><strong>Gerar áudio</strong><small>Áudio sincronizado pelo modelo</small></span><input type="checkbox" checked={generateAudio} onChange={e => setGenerateAudio(e.target.checked)} /><i /></label>
            <label className="toggle-row"><span><strong>Deep Thinking</strong><small>Raciocínio aprimorado antes da geração</small></span><input type="checkbox" checked={enableThinking} onChange={e => setEnableThinking(e.target.checked)} /><i /></label>
            <label className="field-label" htmlFor="seed">Seed <span className="optional">opcional</span></label><input id="seed" className="text-input" type="number" min="0" max="2147483647" placeholder="Aleatória" value={seed} onChange={e => setSeed(e.target.value)} />
          </section>
        </div> : <div className="history-list">{generations.length === 0 ? <div className="history-empty"><Film size={28} /><h3>Nenhuma geração ainda</h3><p>Seu histórico aparecerá aqui após a primeira criação.</p><button className="secondary-button" onClick={() => setTab('create')}>Criar vídeo <ArrowRight size={15} /></button></div> : generations.map(g => <button key={g.id} className={`history-row ${selected?.id === g.id ? 'selected' : ''}`} onClick={() => setSelectedId(g.id)}><span className="history-thumb">{g.resultUrl ? <VideoPoster src={g.resultUrl} /> : <Film size={22} />}</span><span className="history-copy"><strong>{g.prompt.slice(0, 60)}{g.prompt.length > 60 ? '…' : ''}</strong><small>{new Date(g.createdAt).toLocaleDateString('pt-BR')} · {g.duration}s · {g.resolution}</small></span><span className={`tiny-status ${g.status.toLowerCase()}`}>{statusText[g.status]}</span></button>)}</div>}
        {tab === 'create' && <div className="sidebar-footer"><div className="cost-row"><span><small>ESTIMATIVA DE CUSTO</small><strong>US$ {cost.toFixed(2)}</strong></span><span className="cost-rate">{mock ? 'Simulação · sem cobrança' : 'Antes de descontos'}</span></div><button className="primary-button full generate" onClick={openConfirm} disabled={uploading || submitting}><Sparkles size={19} /> Gerar vídeo <ArrowRight size={17} /></button><p>Custo estimado; o valor final pode variar. Confirmação obrigatória.</p></div>}
      </aside>
      <main className="main-panel"><div className="main-heading"><div><div className="eyebrow">WAN STUDIO / {tab === 'create' ? 'CRIAR' : 'BIBLIOTECA'}</div><h2>{tab === 'create' ? 'Seu próximo vídeo começa aqui.' : 'Minhas gerações'}</h2><p>{tab === 'create' ? 'Envie suas referências, descreva a cena e acompanhe o resultado em tempo real.' : 'Explore, assista e reutilize seus vídeos anteriores.'}</p></div><span className="main-model"><span className="pulse-dot" /> Alibaba Wan 3.0</span></div>
        {tab === 'create' ? <><div className="preview-shell"><div className="preview-top"><span><Play size={15} /> PRÉ-VISUALIZAÇÃO</span><span>{selected ? statusText[selected.status] : 'Aguardando criação'}</span></div>{selected?.resultUrl ? <div className="video-stage"><video key={selected.id} src={selected.resultUrl} controls playsInline preload="metadata" /></div> : <div className="preview-empty"><div className={`preview-orb ${active ? 'working' : ''}`}>{active ? <LoaderCircle size={37} className="spin" /> : <Film size={38} />}</div><h3>{active ? `${statusText[active.status]} seu vídeo` : selected?.status === 'FAILED' ? 'Não foi possível gerar o vídeo' : 'A tela é sua.'}</h3><p>{active ? 'O processamento acontece em segundo plano. Você pode sair e voltar depois.' : selected?.status === 'FAILED' ? selected.errorMessage : 'Combine vídeo, imagem e texto para criar algo novo. O resultado aparecerá aqui.'}</p>{!active && !selected && <span className="empty-hint">VÍDEO + IMAGEM + PROMPT → RESULTADO</span>}</div>}
          {selected && <div className="preview-bottom"><div className="preview-meta"><span className={`status-chip ${selected.status.toLowerCase()}`}><span /> {statusText[selected.status]}</span><span>{selected.duration}s</span><span>{selected.resolution}</span><span>{selected.aspectRatio}</span></div><div className="preview-actions">{selected.resultUrl && <a className="secondary-button" href={`${selected.resultUrl}?download=1`}><ArrowDownToLine size={16} /> Baixar MP4</a>}<button className="secondary-button" onClick={() => reuse(selected)}><RotateCcw size={16} /> Reutilizar</button></div></div>}</div>
          <div className="reference-summary"><div className="summary-title"><div><span className="eyebrow">COMPOSIÇÃO</span><h3>Referências deste projeto</h3></div><span>{videos.length + images.length} arquivo(s)</span></div><div className="summary-content">{videos.length || images.length ? <>{videos.map((a, index) => <div className="summary-card" key={a.id}><div className="summary-media"><VideoPoster src={a.url} /></div><div><strong>Vídeo {index + 1}</strong><small>{a.duration?.toFixed(1)} s · Movimento</small></div></div>)}{images.map((a, index) => <div className="summary-card" key={a.id}><div className="summary-media"><img src={a.url} alt={a.name} /></div><div><strong>Imagem {index + 1}</strong><small>Referência visual</small></div></div>)}</> : <div className="summary-empty"><UploadCloud size={21} /> Seus arquivos aparecerão aqui enquanto prepara a geração.</div>}</div></div>
        </> : <div className="library"><div className="library-head"><span>{generations.length} geração(ões)</span><button className="secondary-button" onClick={() => setTab('create')}><Plus size={16} /> Nova geração</button></div>{generations.length ? <div className="library-grid">{generations.map(g => <article className={`library-card ${selected?.id === g.id ? 'focused' : ''}`} key={g.id} onClick={() => setSelectedId(g.id)}><div className="library-media">{g.resultUrl ? <VideoPoster src={g.resultUrl} /> : <div><Film size={32} /></div>}<span className={`status-chip ${g.status.toLowerCase()}`}>{statusText[g.status]}</span></div><div className="library-body"><p>{g.prompt}</p><div className="library-meta">{new Date(g.createdAt).toLocaleDateString('pt-BR')} · {g.duration}s · {g.resolution}</div><div className="library-refs"><ImageIcon size={14} /> {g.references.filter(a => a.kind === 'image').length} imagens <Film size={14} /> {g.references.filter(a => a.kind === 'video').length} vídeos</div><div className="library-actions"><button onClick={event => { event.stopPropagation(); setSelectedId(g.id); }}><Play size={15} /> Abrir</button><button onClick={event => { event.stopPropagation(); reuse(g); }}><Copy size={15} /> Reutilizar</button><button title="Excluir" onClick={event => { event.stopPropagation(); deleteGeneration(g); }}><Trash2 size={15} /></button></div></div></article>)}</div> : <div className="library-empty"><Film size={34} /><h3>Seu acervo começa com uma ideia.</h3><p>Crie um vídeo para vê-lo na biblioteca.</p></div>}
          {selected && <div className="detail-panel"><div className="detail-head"><div><span className="eyebrow">DETALHES DA GERAÇÃO</span><h3>{new Date(selected.createdAt).toLocaleString('pt-BR')}</h3></div><button onClick={() => setSelectedId(null)}><X size={18} /></button></div>{selected.resultUrl && <video src={selected.resultUrl} controls playsInline preload="metadata" />}<p>{selected.prompt}</p><div className="detail-tags"><span>{selected.duration}s</span><span>{selected.resolution}</span><span>{selected.aspectRatio}</span><span>US$ {selected.estimatedUsd.toFixed(2)} estimado</span></div><div className="detail-refs">{selected.references.map(asset => asset.kind === 'image' ? <img key={asset.id} src={asset.url} alt={asset.name} /> : <video key={asset.id} src={asset.url} preload="metadata" controls />)}</div><div className="detail-actions">{selected.resultUrl && <a className="primary-button" href={`${selected.resultUrl}?download=1`}><ArrowDownToLine size={16} /> Baixar MP4</a>}<button className="secondary-button" onClick={() => reuse(selected)}><RotateCcw size={16} /> Reutilizar</button></div></div>}</div>}
      </main>
    </div>
    {confirm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !submitting) setConfirm(false); }}><div className="confirm-modal"><button className="modal-x" onClick={() => setConfirm(false)} disabled={submitting}><X size={18} /></button><div className="confirm-icon"><Sparkles size={24} /></div><div className="eyebrow">CONFIRMAR GERAÇÃO</div><h2>Pronto para criar?</h2><p>Uma solicitação será enviada ao Wan 3.0 com {videos.length} vídeo(s), {images.length} imagem(ns) e o prompt exibido no editor.</p><div className="confirm-facts"><div><span>Duração</span><strong>{duration} segundos</strong></div><div><span>Resolução</span><strong>{resolution}</strong></div><div><span>Custo estimado</span><strong>US$ {cost.toFixed(2)}</strong></div></div><p className="confirm-note">{mock ? 'Modo simulado ativo. Nenhum crédito será consumido.' : 'Esta geração pode consumir créditos reais. O custo pode variar conforme sua conta.'}</p><div className="confirm-buttons"><button className="secondary-button" onClick={() => setConfirm(false)} disabled={submitting}>Voltar</button><button className="primary-button" onClick={submit} disabled={submitting}>{submitting ? <><LoaderCircle size={17} className="spin" /> Enviando...</> : <><Check size={17} /> Confirmar e gerar</>}</button></div></div></div>}
    {lightbox && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setLightbox(null); }}><div className="lightbox"><button onClick={() => setLightbox(null)}><X size={20} /></button>{lightbox.includes('/api/assets/') && (videos.some(v => v.url === lightbox) || generations.some(g => g.references.some(a => a.kind === 'video' && a.url === lightbox))) ? <video src={lightbox} controls autoPlay /> : <img src={lightbox} alt="Referência ampliada" />}</div></div>}
    {(error || notice) && <div className={`toast ${error ? 'toast-error' : ''}`}>{error ? <CircleAlert size={18} /> : <Check size={18} />}{error || notice}<button onClick={() => { setError(''); setNotice(''); }}><X size={15} /></button></div>}
  </div>;
}

function DropArea({ kind, count, max, onClick, onFiles, busy }: { kind: 'video' | 'image'; count: number; max: number; onClick: () => void; onFiles: (files: File[]) => void; busy: boolean }) {
  const [dragging, setDragging] = useState(false);
  const isVideo = kind === 'video';
  return <div className={`drop-area ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); onFiles(Array.from(e.dataTransfer.files)); }}><button onClick={onClick} disabled={busy || count >= max}><span className="drop-icon">{busy ? <LoaderCircle size={21} className="spin" /> : isVideo ? <Film size={21} /> : <ImageIcon size={21} />}</span><span><strong>{busy ? 'Enviando arquivo...' : isVideo ? 'Vídeos de referência' : 'Imagens de referência'}</strong><small>Arraste arquivos ou clique para selecionar</small></span><span className="drop-count">{count}/{max}</span></button></div>;
}

function AssetRow({ asset, index, length, onMove, onRemove, onPreview }: { asset: Asset; index: number; length: number; onMove: (direction: number) => void; onRemove: () => void; onPreview: () => void }) {
  return <div className="asset-row"><GripVertical size={16} className="grip" /><button className="asset-thumb" onClick={onPreview}><VideoPoster src={asset.url} /><Play size={13} /></button><span className="asset-copy"><strong>{asset.name}</strong><small>{asset.duration?.toFixed(1)} s · Vídeo {index + 1}</small></span><button title="Subir" onClick={() => onMove(-1)} disabled={index === 0}><ChevronLeft size={16} /></button><button title="Descer" onClick={() => onMove(1)} disabled={index === length - 1}><ChevronRight size={16} /></button><button title="Remover" onClick={onRemove}><X size={16} /></button></div>;
}

function VideoPoster({ src }: { src: string }) {
  return <video src={src} preload="metadata" muted playsInline onLoadedMetadata={event => {
    const video = event.currentTarget;
    if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = 0.1;
  }} />;
}
