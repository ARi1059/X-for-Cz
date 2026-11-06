'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, Gem, Heart, Link2, Radio, Send, Share2 } from 'lucide-react';
import type { PublicSite } from './client-api.ts';
import { NoirStage } from './noir-motion.tsx';
import { idleNavigationFeedback, type NavigationFeedback } from './navigation-state.ts';
import { resolvePrimaryLinkId } from './link-presentation.ts';
import { IntroCurtain } from './intro-curtain.tsx';

export function MediaImage({ mediaId, alt, version, token = '', admin = false, variant = 'thumbnail', className = '', focalPoint, onAccessError, onDecoded, loadingText = '图片加载中', errorText = '图片加载失败' }: {
  mediaId: string; alt: string; version?: string; token?: string; admin?: boolean; variant?: 'thumbnail' | 'display'; className?: string; focalPoint?: { x: number; y: number }; onAccessError?: (status: number) => void; onDecoded?: (image: HTMLImageElement) => void; loadingText?: string; errorText?: string;
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const errorRef = useRef(onAccessError); errorRef.current = onAccessError;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setUrl(''); setFailed(false);
    const path = admin ? `/api/admin/media/${encodeURIComponent(mediaId)}/content?variant=${variant}` : `/media/${encodeURIComponent(mediaId)}?version=${encodeURIComponent(version ?? '')}&variant=${variant}`;
    void fetch(path, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async response => {
      if (!response.ok) { errorRef.current?.(response.status); throw new Error('media'); }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(error => { if (error?.name !== 'AbortError') setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId, version, token, admin, variant]);
  return <span className={`media-image ${className}`}>
    {url ? <img src={url} alt={alt} decoding="async" onLoad={event => onDecoded?.(event.currentTarget)} onError={() => { setFailed(true); setUrl(''); }} style={{ objectPosition: focalPoint ? `${focalPoint.x * 100}% ${focalPoint.y * 100}%` : 'center' }} /> : <span role={failed ? 'img' : undefined} aria-label={failed ? `${alt}，${errorText}` : undefined} className="media-placeholder">{failed ? errorText : <span className="sr-only">{loadingText}</span>}</span>}
  </span>;
}

export function PublicView({ data, token = '', preview = false, intro = false, lusion: _lusion, onIntroDone, navigationFeedback = idleNavigationFeedback, onReset, onNavigate, onAccessError }: { data: PublicSite; token?: string; preview?: boolean; intro?: boolean; lusion?: boolean; onIntroDone?: () => void; navigationFeedback?: NavigationFeedback; onReset?: () => void; onNavigate?: (id: string, newTab: boolean) => void; onAccessError?: (status: number) => void }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const gallerySection = useRef<HTMLElement>(null);
  const [galleryRevealed, setGalleryRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const shareTimer = useRef(0);
  const selection = useRef(0);
  const anchors = useRef<number[]>([]);
  // Explicit selection survives browser snapping, focus scrolling and resize.
  // A new touch/wheel gesture hands selection back to the native scroll position.
  const pending = useRef<number | null>(null);
  const scrollFrame = useRef(0);
  const photos = data.gallery.photos;
  const mediaState = { loadingText: data.states.loading, errorText: data.states.error };
  function selectPhoto(next: number) {
    selection.current = next;
    setIndex(next);
  }
  function syncSelection() {
    const element = galleryRef.current;
    if (!element || pending.current !== null || !anchors.current.length) return;
    const max = element.scrollWidth - element.clientWidth;
    // All photos fit on desktop: selection still works without a scroll position.
    if (max <= 1) return;
    const left = element.scrollLeft;
    let nearest = selection.current;
    if (left <= 1) nearest = 0;
    else if (left >= max - 1) nearest = photos.length - 1;
    else anchors.current.forEach((anchor, i) => {
      if (Math.abs(anchor - left) < Math.abs((anchors.current[nearest] ?? 0) - left) - 1) nearest = i;
    });
    selectPhoto(nearest);
  }
  function finishScroll() {
    cancelAnimationFrame(scrollFrame.current);
    syncSelection();
  }
  function moveTo(next: number) {
    const element = galleryRef.current;
    if (!element || !photos.length) return;
    next = Math.min(photos.length - 1, Math.max(0, next));
    pending.current = next;
    selectPhoto(next);
    element.scrollTo({ left: anchors.current[next] ?? 0, behavior: 'instant' });
  }
  function interruptScroll() {
    const element = galleryRef.current;
    if (element && pending.current !== null) element.scrollTo({ left: element.scrollLeft, behavior: 'instant' });
    pending.current = null;
    syncSelection();
  }
  useEffect(() => {
    const element = galleryRef.current;
    if (!element) return;
    selectPhoto(0);
    let resizeFrame = 0;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const max = Math.max(0, element.scrollWidth - element.clientWidth);
      // Cache actual photo centers only when layout changes, never per scroll event.
      anchors.current = [...element.querySelectorAll<HTMLElement>('.photo')].map(photo => {
        const rect = photo.getBoundingClientRect();
        return Math.max(0, Math.min(max, rect.left - bounds.left + element.scrollLeft + rect.width / 2 - element.clientWidth / 2));
      });
      pending.current = selection.current;
      element.scrollTo({ left: anchors.current[selection.current] ?? 0, behavior: 'instant' });
    };
    measure();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measure);
    });
    observer.observe(element);
    element.querySelectorAll('.photo').forEach(photo => observer.observe(photo));
    return () => {
      observer.disconnect(); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(scrollFrame.current);
      pending.current = null;
    };
  }, [data.versionId, data.gallery.enabled, photos.length]);
  useEffect(() => {
    const section = gallerySection.current;
    if (!section) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setGalleryRevealed(true); return; }
    if (!('IntersectionObserver' in window)) { setGalleryRevealed(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setGalleryRevealed(true);
        observer.disconnect();
      }
    }, { threshold: 0.22, rootMargin: '0px 0px -70px 0px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, [data.versionId, photos.length]);
  const linkIcons = { x_profile: ArrowUpRight, tg_personal: Send, tg_preview: Radio, onlyfans: Heart, membership: Gem };
  const primaryId = resolvePrimaryLinkId(data.links);
  function showShareNote(text: string) {
    setShareNote(text);
    window.clearTimeout(shareTimer.current);
    shareTimer.current = window.setTimeout(() => setShareNote(''), 2600);
  }
  async function buildPoster(): Promise<Blob | null> {
    const image = galleryRef.current?.querySelector<HTMLImageElement>('.photo.selected .photo-art img');
    if (!image) return null;
    if (!image.complete) { try { await image.decode(); } catch { return null; } }
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const photo = photos[Math.min(index, photos.length - 1)];
    const caption = photo?.caption || photo?.alt || 'After Hours';
    const origin = location.origin + '/';
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0c0907'; ctx.fillRect(0, 0, W, H);
    const targetH = 940;
    const scale = Math.max(W / image.naturalWidth, targetH / image.naturalHeight);
    const sw = image.naturalWidth * scale, sh = image.naturalHeight * scale;
    ctx.drawImage(image, (W - sw) / 2, (targetH - sh) / 2, sw, sh);
    const fade = ctx.createLinearGradient(0, 560, 0, 1100);
    fade.addColorStop(0, 'rgba(12,9,7,0)');
    fade.addColorStop(.55, 'rgba(12,9,7,.72)');
    fade.addColorStop(1, '#0c0907');
    ctx.fillStyle = fade; ctx.fillRect(0, 520, W, 900);
    ctx.fillStyle = '#e6c79b'; ctx.fillRect(72, 1040, 118, 2);
    ctx.fillStyle = '#b8a690'; ctx.font = '17px "Helvetica Neue", "PingFang SC", sans-serif';
    ctx.fillText('A F T E R   H O U R S   /   P R I V A T E   E D I T I O N', 72, 1084);
    ctx.fillStyle = '#f4ead9'; ctx.font = '66px "Songti SC", "Noto Serif SC", "Times New Roman", serif';
    ctx.fillText(data.site.name, 72, 1164);
    ctx.fillStyle = '#d8c9b2'; ctx.font = '25px "Songti SC", "PingFang SC", sans-serif';
    ctx.fillText(caption, 72, 1212);
    ctx.fillStyle = '#8f806d'; ctx.font = '17px "Helvetica Neue", "PingFang SC", sans-serif';
    ctx.fillText(origin.replace(/^https?:\/\//, ''), 72, 1290);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  }
  async function shareCurrent() {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = await buildPoster();
      if (!blob) throw new Error('poster');
      const photo = photos[Math.min(index, photos.length - 1)];
      const file = new File([blob], `after-hours-${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' });
      const url = location.origin + '/';
      const shareData = { title: data.site.name, text: photo?.caption || photo?.alt || 'After Hours', url };
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ ...shareData, files: [file] });
        showShareNote('已打开分享');
      } else {
        // The share button is for the poster, not just the URL. If file sharing
        // is unavailable, download the 1080x1350 poster; copy-link is separate.
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href; link.download = `after-hours-${String(index + 1).padStart(2, '0')}.png`;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(href), 1000);
        showShareNote('海报已下载');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showShareNote('生成失败，请重试');
    } finally { setSharing(false); }
  }
  async function copyLink() {
    const url = location.origin + '/';
    try {
      await navigator.clipboard.writeText(url);
      showShareNote('链接已复制');
    } catch {
      window.prompt('复制链接', url);
    }
  }
  useEffect(() => () => window.clearTimeout(shareTimer.current), []);
  return <NoirStage className="public-content after-hours" preview={preview} version={data.versionId} testId={preview ? 'draft-preview' : 'public-content'}>
    {intro && <IntroCurtain onDone={onIntroDone ?? (() => {})} />}
    <div className="noir-editorial" aria-hidden="true"><span className="noir-editorial-kicker">THE ART OF PRESENCE</span><span>After</span><span>hours.</span><i>一面冷艳，一面尽兴。</i></div>
    <div className="noir-side-note" aria-hidden="true"><span>LIGHT. SILHOUETTE. ATTITUDE.</span><span className="noir-side-rule" /><span>PERSONAL EDITION / 01</span></div>
    <header className="identity">
      <p className="noir-eyebrow noir-reveal">THE PRIVATE EDIT</p>
      {data.site.avatarMediaId && <div className="noir-avatar-ring noir-reveal"><MediaImage mediaId={data.site.avatarMediaId} alt={`${data.site.name}的头像`} version={data.versionId} token={token} admin={preview} className="avatar" {...mediaState} {...(onAccessError ? { onAccessError } : {})} /><span className="noir-avatar-spark" aria-hidden="true" /></div>}
      <h1 className="noir-reveal" tabIndex={-1}>{data.site.name}</h1>
      {data.site.tagline && <p className="muted noir-tagline noir-reveal">{data.site.tagline}</p>}
      {data.site.description && <p className="muted prose noir-reveal">{data.site.description}</p>}
      <span className="noir-identity-rule noir-reveal" aria-hidden="true" />
    </header>
    <nav className="public-links" aria-label="个人导航" data-pending={navigationFeedback.pendingId ? 'true' : undefined}>
      <p className="sr-only" role="status" aria-live="polite">{navigationFeedback.pendingId ? `正在打开${data.links.find(link => link.id === navigationFeedback.pendingId)?.label ?? '外部平台'}…` : ''}</p>
      {data.links.length === 0 && <p className="muted" role="status">{data.states.empty}</p>}
      {data.links.map((link, linkIndex) => {
        const Icon = linkIcons[link.id];
        const isPrimary = !preview && link.id === primaryId;
        const isPending = navigationFeedback.pendingId === link.id;
        const hasError = navigationFeedback.errorId === link.id;
        const state = !link.available || preview ? 'unavailable' : isPending ? 'pending' : hasError ? 'error' : 'available';
        const errorId = `noir-link-error-${link.id}`;
        const content = <><span className="noir-link-number" aria-hidden="true">{String(linkIndex + 1).padStart(2, '0')}</span><span className="noir-link-icon" aria-hidden="true">{link.id === 'x_profile' ? <span className="noir-x-mark">X</span> : <Icon size={19} strokeWidth={1.3} />}</span><span className="noir-link-label">{link.label}{link.description && <small>{link.description}</small>}</span><span className="noir-link-end">{isPending ? <span className="noir-link-status" aria-hidden="true">正在打开…</span> : !link.available && <span className="noir-link-status">{data.states.unavailable}</span>}<ArrowUpRight className="noir-link-arrow" size={isPrimary ? 18 : 14} strokeWidth={1.3} aria-hidden="true" /></span>{isPending && <span className="lg-link-progress" aria-hidden="true" />}{isPrimary && <span className="cta-breathe" aria-hidden="true" />}</>;
        const className = 'pill public-link' + (isPrimary ? ' is-emphasized' : '');
        return <div className="noir-link-shell" data-primary={isPrimary ? 'true' : undefined} key={link.id}>{link.available && !preview ? <a className={className} data-variant={isPrimary ? 'primary' : 'secondary'} data-state={state} aria-busy={isPending} aria-disabled={navigationFeedback.pendingId ? true : undefined} aria-describedby={hasError ? errorId : undefined} href={`/go/${link.id}?version=${encodeURIComponent(data.versionId)}`} rel="noopener noreferrer" onClick={event => { if (onNavigate || navigationFeedback.pendingId) { event.preventDefault(); if (!navigationFeedback.pendingId) onNavigate?.(link.id, event.metaKey || event.ctrlKey || event.shiftKey || matchMedia('(min-width:800px)').matches); } }} onAuxClick={event => { if (event.button === 1 && (onNavigate || navigationFeedback.pendingId)) { event.preventDefault(); if (!navigationFeedback.pendingId) onNavigate?.(link.id, true); } }} aria-label={`${link.label}，前往外部平台`}>{content}</a> : <button type="button" className={className} data-variant="secondary" data-state={state} disabled>{content}</button>}
          {hasError && !preview && <div className="link-feedback"><span className="lg-feedback-label" aria-hidden="true">{link.label}</span><p id={errorId} role="alert">{navigationFeedback.message}</p><button type="button" className="link-retry" disabled={Boolean(navigationFeedback.pendingId)} aria-label={`重试打开${link.label}`} onClick={event => {
            event.currentTarget.closest('.noir-link-shell')?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
            onNavigate?.(link.id, navigationFeedback.retryNewTab);
          }}>重试</button></div>}
        </div>;
      })}
    </nav>
    {data.gallery.enabled && photos.length > 0 && <section ref={gallerySection} className={`gallery${galleryRevealed ? ' is-revealed' : ''}`} aria-label={data.gallery.title ?? '照片条'}>
      <span className="noir-gallery-rule" aria-hidden="true" />
      <div className="gallery-header"><div><p className="noir-eyebrow">A STUDY IN CONTRAST</p><h2>{data.gallery.title ?? '照片'}<span lang="en">The lookbook.</span></h2></div><div className="noir-gallery-meta"><span className="noir-gallery-count" aria-hidden="true"><span className="noir-gallery-current">{String(index + 1).padStart(2, '0')}</span><span className="noir-gallery-sep">/</span><span className="noir-gallery-total">{String(photos.length).padStart(2, '0')}</span><span className="noir-gallery-frames">FRAMES</span><ArrowDown size={15} strokeWidth={1} /></span><span className="gallery-share-actions"><button type="button" className="gallery-share" aria-label="分享当前照片" disabled={sharing} onClick={() => void shareCurrent()}><Share2 size={13} strokeWidth={1.4} aria-hidden="true" /><span>{sharing ? '生成中' : '分享'}</span></button><button type="button" className="gallery-copy" aria-label="复制页面链接" onClick={() => void copyLink()}><Link2 size={14} strokeWidth={1.4} aria-hidden="true" /></button></span><span className="gallery-share-note" role="status" aria-live="polite">{shareNote}</span></div></div>
      <div ref={galleryRef} className="gallery-strip" tabIndex={0} aria-label="照片浏览，左右方向键切换" onPointerDown={interruptScroll} onWheel={interruptScroll} onKeyDown={event => {
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          moveTo(event.key === 'Home' ? 0 : event.key === 'End' ? photos.length - 1 : selection.current + (event.key === 'ArrowRight' ? 1 : -1));
        }
      }} onScrollEnd={finishScroll} onScroll={() => {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = requestAnimationFrame(syncSelection);
      }}>
        {photos.map((photo, photoIndex) => {
          const offset = photoIndex - index;
          const position = Math.abs(offset) === 1 ? (offset < 0 ? 'is-prev' : 'is-next') : '';
          return <figure key={photo.id} className={`photo ${index === photoIndex ? 'selected' : ''} ${position}`} data-offset={offset} aria-current={index === photoIndex ? 'true' : undefined}><div className="photo-art"><MediaImage mediaId={photo.mediaId} alt={photo.alt} focalPoint={photo.focalPoint} version={data.versionId} token={token} admin={preview} variant="display" {...mediaState} {...(onAccessError ? { onAccessError } : {})} /><span className="noir-photo-index" aria-hidden="true">{String(photoIndex + 1).padStart(2, '0')}</span></div><figcaption><span>{photo.caption || photo.alt}</span></figcaption><span className="noir-photo-rule" aria-hidden="true" /></figure>;
        })}
      </div>
      {photos.length > 1 && <div className="gallery-controls"><span className="noir-gallery-hint">光影之间，自有分寸。</span><div className="noir-gallery-pagination"><button type="button" className="text-button" aria-label="上一张照片" disabled={index === 0} onClick={() => moveTo(selection.current - 1)}><ChevronLeft size={17} strokeWidth={1.2} /></button><span aria-live="polite" aria-atomic="true">{index + 1} / {photos.length}</span><button type="button" className="text-button" aria-label="下一张照片" disabled={index === photos.length - 1} onClick={() => moveTo(selection.current + 1)}><ChevronRight size={17} strokeWidth={1.2} /></button></div></div>}
    </section>}
    {(data.info.title || data.info.body || data.info.faq.length > 0) && <section className="public-info">{data.info.title && <h2>{data.info.title}</h2>}{data.info.body && <p className="prose">{data.info.body}</p>}{data.info.faq.map(item => <details key={item.id}><summary>{item.question}</summary><p className="prose muted">{item.answer}</p></details>)}</section>}
    <footer className="public-footer">
      <p className="noir-signature" aria-hidden="true">Stay a little longer.</p>
      <span className="noir-footer-rule" aria-hidden="true" />
      {data.footer.notice && <p>{data.footer.notice}</p>}
      {data.footer.contactEmail && <a href={`mailto:${data.footer.contactEmail}`}>{data.footer.contactEmail}</a>}
      {data.footer.removalNotice && <p className="prose">{data.footer.removalNotice}</p>}
      {data.footer.updateText && <p>{data.footer.updateText}</p>}
      {!preview && onReset && <button type="button" className="text-button" onClick={onReset}>{data.resetLabel}</button>}
    </footer>
  </NoirStage>;
}
