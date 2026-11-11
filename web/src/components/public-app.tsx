'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUpRight } from 'lucide-react';
import { api, ApiError, errorMessage, postBody, type Gate, type PublicSite } from './client-api.ts';
import { GateStage } from './gate-stage.tsx';
import { idleNavigationFeedback, type NavigationFeedback } from './navigation-state.ts';
import { OpenCursor } from './open-cursor.tsx';

const StoryLab = dynamic(() => import('./story-lab.tsx').then(module => module.StoryLab), { ssr: false, loading: () => <p className="page-loading" role="status">正在加载故事页面…</p> });

export function PublicApp() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
  const [memory, setMemory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [navigationFeedback, setNavigationFeedback] = useState<NavigationFeedback>(idleNavigationFeedback);
  const [intro, setIntro] = useState(false);
  const introSeen = useRef(false);
  const navigationPending = useRef(false);
  const [left, setLeft] = useState(false);
  const sourceRef = useRef('other');
  const viewRecorded = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const readSite = useCallback(async (accessToken = tokenRef.current) => {
    const result = await api<PublicSite>('/api/site', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    setSite(result); setLeft(false); setMessage(''); setNavigationFeedback(idleNavigationFeedback);
  }, []);
  const startIntro = useCallback(() => {
    if (introSeen.current) return;
    introSeen.current = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setIntro(true);
  }, []);
  const readGate = useCallback(async () => {
    const result = await api<Gate>('/api/gate');
    setGate(result); document.title = result.meta.title;
    return result;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const from = new URLSearchParams(location.search).get('from');
    sourceRef.current = from && ['profile', 'pin', 'weekly'].includes(from) ? from : 'other';
    void readGate().then(async result => {
      if (!mounted.current) return;
      if (result.ageStatus.confirmed) {
        try { await readSite(''); } catch { setMessage('请重新确认年龄。'); }
      } else if (!viewRecorded.current) {
        viewRecorded.current = true;
        void api('/api/events/gate-view', postBody({ source: sourceRef.current }, result.csrfToken)).catch(() => {});
      }
    }).catch(error => setMessage(errorMessage(error)));
    return () => { mounted.current = false; tokenRef.current = ''; };
  }, [readGate, readSite]);
  useEffect(() => { if (!site) heading.current?.focus(); }, [site, left]);
  async function confirm() {
    if (!gate || busy) return;
    setBusy(true); setMessage('');
    try {
      const current = await readGate();
      const grant = await api<{ storage: 'cookie' | 'memory'; accessToken?: string }>('/api/age/confirm', postBody({ adult: true, storage: memory ? 'memory' : 'cookie', source: sourceRef.current }, current.csrfToken));
      let accessToken = grant.accessToken ?? '';
      try { await readSite(accessToken); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || grant.storage === 'memory') throw error;
        // Cookie-restricted browsers keep the credential only in this mounted tab.
        const fresh = await readGate();
        const fallback = await api<{ accessToken: string }>('/api/age/confirm', postBody({ adult: true, storage: 'memory', source: sourceRef.current }, fresh.csrfToken));
        accessToken = fallback.accessToken; await readSite(accessToken);
      }
      tokenRef.current = accessToken; setToken(accessToken); setMemory(Boolean(accessToken));
      startIntro();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!gate || busy || navigationPending.current) return;
    setBusy(true);
    try {
      const fresh = await readGate();
      await api('/api/age/reset', postBody({}, fresh.csrfToken, tokenRef.current));
      tokenRef.current = ''; setToken(''); setSite(null); setIntro(false); setLeft(false); setMessage('已清除本次确认，请重新确认年龄。'); await readGate();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function leave() {
    if (!gate || busy) return;
    setBusy(true);
    try {
      const current = await readGate();
      const result = await api<{ exitUrl: string | null; notice: string }>('/api/age/leave', postBody({ source: sourceRef.current }, current.csrfToken));
      if (result.exitUrl) location.assign(result.exitUrl);
      else { setLeft(true); setMessage(result.notice); }
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function accessError(status: number) {
    if (status === 401) { tokenRef.current = ''; setToken(''); setSite(null); setIntro(false); setMessage('确认已到期，请重新确认年龄。'); await readGate().catch(() => {}); }
    if (status === 409) await readSite().catch(error => setMessage(errorMessage(error)));
  }
  async function navigate(id: string, newTab: boolean) {
    if (!site || !gate || busy || navigationPending.current || !site.links.some(link => link.id === id && link.available)) return;
    // Lock synchronously: React state alone does not catch repeated clicks in one task.
    navigationPending.current = true;
    setNavigationFeedback({ pendingId: id, errorId: null, message: '', retryNewTab: newTab });
    setBusy(true); setMessage('');
    let destination: Window | null = null;
    try {
      // Open during the click gesture so memory-mode resolution survives popup restrictions.
      destination = newTab ? window.open('about:blank', '_blank') : null;
      if (newTab && !destination) throw new Error('请允许本站打开新标签页后重试。');
      if (destination) { destination.opener = null; destination.document.title = '正在打开外部平台…'; destination.document.body.textContent = '正在打开外部平台…'; }
      const fresh = await readGate();
      const result = await api<{ url: string }>('/api/links/' + encodeURIComponent(id) + '/resolve', postBody({ versionId: site.versionId, source: sourceRef.current }, fresh.csrfToken, tokenRef.current));
      if (destination) destination.location.replace(result.url);
      else location.assign(result.url);
    } catch (error) {
      destination?.close();
      if (error instanceof ApiError && [401, 409].includes(error.status)) {
        // Keep the entry pending while a changed publication is being refreshed.
        if (error.status === 401) setNavigationFeedback(idleNavigationFeedback);
        await accessError(error.status);
      } else if (mounted.current) {
        setNavigationFeedback({ pendingId: null, errorId: id, message: errorMessage(error), retryNewTab: newTab });
      }
    } finally {
      navigationPending.current = false;
      if (mounted.current) {
        setBusy(false);
        setNavigationFeedback(current => ({ ...current, pendingId: null }));
      }
    }
  }
  if (!gate) return <main className="gate-page"><div className="page-loading"><span className="page-loading-mark" aria-hidden="true">GF</span><p role="status">{message || '加载中…'}</p>{message && <button type="button" className="pill secondary" onClick={() => location.reload()}>重试</button>}</div></main>;
  if (site) {
    return <main className="story-page">{token && <p className="memory-notice" role="status">本次确认仅在当前页面有效，刷新后需重新确认。</p>}{message && <p className="public-notice feedback error" role="alert">{message}</p>}
      <OpenCursor />
      <StoryLab data={site} token={token} intro={intro} onIntroDone={() => setIntro(false)} navigationFeedback={navigationFeedback} onReset={() => void reset()} onNavigate={(id, newTab) => void navigate(id, newTab)} onAccessError={status => void accessError(status)} />
    </main>;
  }
  return <main className="gate-page"><GateStage><section className="gate-content gate-panel identity" aria-busy={busy}>
    <p className="gate-eyebrow gate-reveal">A PRIVATE INVITATION</p>
    <p className="gate-brand gate-reveal">{gate.name}</p>
    <p className="age-mark gate-reveal" aria-hidden="true">18<span>+</span></p>
    <h1 ref={heading} tabIndex={-1}>{left ? gate.ageGate.exitLabel : gate.ageGate.title}</h1>
    {!left && <p className="muted">{gate.ageGate.notice}</p>}
    {message && <p className="feedback error" role="alert">{message}</p>}
    {left ? <button type="button" className="pill secondary" onClick={() => { setLeft(false); setMessage(''); }}>返回确认页</button> : <>
      <button type="button" className="pill primary gate-enter" disabled={busy} onClick={() => void confirm()}><span>{busy ? '处理中…' : gate.ageGate.confirmLabel}</span><ArrowUpRight size={19} strokeWidth={1.3} aria-hidden="true" /></button>
      <button type="button" className="pill secondary" disabled={busy} onClick={() => void leave()}>{gate.ageGate.exitLabel}</button>
      <label className="checkbox-row memory-choice"><input type="checkbox" checked={memory} onChange={event => setMemory(event.target.checked)} />仅在本次访问中确认</label>
    </>}
    <p className="gate-footnote" aria-hidden="true">PRIVATE EDITION · EST. 2026</p>
  </section></GateStage></main>;
}
