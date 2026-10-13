'use client';

import { useState } from 'react';
import { ArrowRight, Clapperboard, LockKeyhole } from 'lucide-react';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao entrar.');
      window.location.href = '/';
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao entrar.'); setBusy(false); }
  }
  return <main className="login-wrap"><div className="login-glow" /><form className="login-card" onSubmit={submit}>
    <div className="brand-icon large"><Clapperboard size={28} /></div>
    <div className="eyebrow">ACESSO PRIVADO</div><h1>Bem-vindo ao<br /><span>Giulia AI.</span></h1>
    <p>Entre para criar vídeos com referências de movimento, personagem e cenário em um só fluxo.</p>
    <label className="field-label" htmlFor="password">Senha do estúdio</label>
    <div className="login-input"><LockKeyhole size={18} /><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Digite sua senha" required /></div>
    {error && <div className="error-inline">{error}</div>}
    <button className="primary-button full" disabled={busy}>{busy ? 'Entrando...' : <>Entrar no estúdio <ArrowRight size={18} /></>}</button>
    <div className="login-foot">Wan 3.0 Reference-to-Video · Higgsfield API</div>
  </form></main>;
}
