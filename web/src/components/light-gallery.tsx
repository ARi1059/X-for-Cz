'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUpRight, ChevronLeft, ChevronRight, Gem, Heart, Info, Pause, Play, Radio, Send, X } from 'lucide-react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { PublicSite } from './client-api.ts';
import { MediaImage } from './public-view.tsx';
import { idleNavigationFeedback, type NavigationFeedback } from './navigation-state.ts';
import { resolvePrimaryLinkId } from './link-presentation.ts';
import { usePrimaryCtaMotion, usePrimaryCtaPulse } from './primary-cta-motion.ts';
import { IntroCurtain } from './intro-curtain.tsx';
import './light-gallery.css';

const LusionScene = dynamic(() => import('./lusion-scene.tsx').then(module => module.LusionScene), { ssr: false });
const LAB_CAPTIONS = ['绿色 Dior', '红色长裙', '白色圣诞', '粉色楼梯', '白色皮草'];

gsap.registerPlugin(useGSAP);

export function LightGallery({ data, token = '', intro = false, lusion = false, onIntroDone, navigationFeedback = idleNavigationFeedback, onReset, onNavigate, onAccessError }: {
  data: PublicSite; token?: string; intro?: boolean; lusion?: boolean; onIntroDone?: () => void; onReset?: () => void;
  navigationFeedback?: NavigationFeedback;
  onNavigate?: (id: string, newTab: boolean) => void; onAccessError?: (status: number) => void;
}) {
  const photos = data.gallery.enabled ? data.gallery.photos : [];
  // Keep the chosen portrait without mounting a gallery or fetching its other photos.
  const backgroundPhoto = photos[Math.min(4, photos.length - 1)];
  const [backgroundReady, setBackgroundReady] = useState(false);
  // LightGallery is client-only (ssr:false). Resolve the preference before the
  // first paint so data-motion does not flip off->on and restart the CTA pulse.
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [staticMode, setStaticMode] = useState(false);
  const [sceneAllowed, setSceneAllowed] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [labIndex, setLabIndex] = useState(0);
  const backgroundImage = useRef<HTMLImageElement | null>(null);
  const track = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const useStatic = reduced || staticMode;
  const scrollMode = lusion && sceneAllowed && sceneReady;
  const mediaState = { loadingText: data.states.loading, errorText: data.states.error };
  const primaryId = resolvePrimaryLinkId(data.links);
  const focusRef = useRef(0);
  const labIndexRef = useRef(labIndex);
  labIndexRef.current = labIndex;
  usePrimaryCtaMotion(track, !useStatic);
  usePrimaryCtaPulse(track, !useStatic);
  const linkIcons = { x_profile: ArrowUpRight, tg_personal: Send, tg_preview: Radio, onlyfans: Heart, membership: Gem };

  function scrollToStation(index: number) {
    const section = track.current;
    if (!scrollMode || !section) return;
    const stations = LAB_CAPTIONS.length - 1;
    const target = Math.max(0, Math.min(stations, index));
    const range = Math.max(0, section.offsetHeight - window.innerHeight);
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (target / stations) * range, behavior: 'smooth' });
  }
  const stepLab = (delta: number) => {
    if (scrollMode) scrollToStation(labIndex + delta);
    else setLabIndex(value => Math.max(0, Math.min(LAB_CAPTIONS.length - 1, value + delta)));
  };

  useEffect(() => {
    const root = track.current;
    if (lusion) return;
    const portrait = root?.querySelector<HTMLElement>('.lg-backdrop-photo');
    if (!root || !portrait) return;
    if (staticMode || reduced) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduce.matches) return;
    const toX = gsap.quickTo(portrait, 'x', { duration: 0.6, ease: 'power3.out' });
    const toY = gsap.quickTo(portrait, 'y', { duration: 0.6, ease: 'power3.out' });
    const move = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
      toX(gsap.utils.clamp(-8, 8, x * 16));
      toY(gsap.utils.clamp(-6, 6, y * 12));
    };
    const reset = () => { toX(0); toY(0); };
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', reset);
    return () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', reset);
      toX.tween.kill(); toY.tween.kill();
      if (portrait.isConnected) gsap.set(portrait, { x: 0, y: 0 });
    };
  }, [data.versionId, staticMode, reduced, lusion]);

  useEffect(() => { setBackgroundReady(false); setSceneReady(false); backgroundImage.current = null; }, [backgroundPhoto?.mediaId, data.versionId]);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches); change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!lusion) { setSceneAllowed(false); setSceneReady(false); return; }
    const query = matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)');
    const update = () => {
      const allowed = query.matches && !matchMedia('(prefers-reduced-motion: reduce)').matches && !staticMode;
      setSceneAllowed(allowed);
      if (!allowed) setSceneReady(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [lusion, reduced, staticMode]);

  useEffect(() => {
    if (!scrollMode) return;
    const section = track.current;
    if (!section) return;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const stations = LAB_CAPTIONS.length - 1;
    // Cache the document geometry. Reading getBoundingClientRect/offsetHeight
    // from a scroll event forces layout on every tick and was the source of a
    // ~100ms hitch during a long scroll.
    let sectionTop = section.getBoundingClientRect().top + window.scrollY;
    let range = Math.max(1, section.offsetHeight - window.innerHeight);
    const scrollFor = (index: number) => {
      const target = Math.max(0, Math.min(stations, index));
      return sectionTop + (target / stations) * range;
    };
    const update = () => {
      const progress = Math.min(1, Math.max(0, (window.scrollY - sectionTop) / range));
      const focus = progress * stations;
      focusRef.current = focus;
      const nearest = Math.round(focus);
      setLabIndex(previous => previous === nearest ? previous : nearest);
      hudRef.current?.style.setProperty('--lab-progress', String(progress));
    };
    const onResize = () => {
      sectionTop = section.getBoundingClientRect().top + window.scrollY;
      range = Math.max(1, section.offsetHeight - window.innerHeight);
      update();
    };
    // Open on the green entrance at the top of the scroll track, then move
    // through the red hero and the remaining three portraits.
    window.scrollTo(0, scrollFor(labIndexRef.current));
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      history.scrollRestoration = previousRestoration;
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', onResize);
      hudRef.current?.style.removeProperty('--lab-progress');
    };
  }, [scrollMode]);

  useGSAP(() => {
    if (useStatic) return;
    const root = track.current;
    if (!root) return;
    const title = root.querySelector<HTMLElement>('.lg-identity h1');
    const heading = root.querySelector<HTMLElement>('.lg-nav-heading');
    const identity = root.querySelector<HTMLElement>('.lg-identity');
    const tagline = root.querySelector<HTMLElement>('.lg-tagline');
    const description = root.querySelector<HTMLElement>('.lg-description');
    const rows = [...root.querySelectorAll<HTMLElement>('.lg-link-shell')];
    const note = root.querySelector<HTMLElement>('.lg-nav-note');
    const footer = root.querySelector<HTMLElement>('.lg-footer');
    const entranceTargets = [heading, identity, tagline, description, title, ...rows, note, footer].filter((element): element is HTMLElement => Boolean(element));

    // Readable first, interactive by 700ms. One timeline owns the whole lift so
    // pending/error re-renders never restart it.
    const entrance = gsap.timeline({
      delay: 0.06, paused: true, defaults: { ease: 'power3.out' },
      onComplete: () => gsap.set(entranceTargets, { clearProps: 'transform,opacity,clipPath' }),
    });
    if (heading) entrance.fromTo(heading, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0);
    if (identity) entrance.fromTo(identity, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.44 }, 0.02);
    if (title) entrance.fromTo(title, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power3.out' }, 0.04);
    if (tagline) entrance.fromTo(tagline, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34 }, 0.04);
    if (description) entrance.fromTo(description, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34 }, 0.06);
    if (rows.length) entrance.fromTo(rows, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.36, stagger: 0.025 }, 0.16);
    if (note) entrance.fromTo(note, { opacity: 0 }, { opacity: 1, duration: 0.22 }, 0.38);
    if (footer) entrance.fromTo(footer, { opacity: 0 }, { opacity: 1, duration: 0.24 }, 0.4);

    // A single greeting keeps the gold finish without repainting text indefinitely.
    // The CSS baseline is 32%; setting 120% in the layout effect prevents the
    // first frame from showing the resting highlight before the sweep starts.
    const sweep = title ? gsap.fromTo(title, { backgroundPosition: '120% 50%' }, {
      backgroundPosition: '32% 50%', duration: 1.6, delay: 0.6, ease: 'sine.inOut', paused: true,
    }) : null;

    let visible = !('IntersectionObserver' in window);
    let disposed = false;
    const syncPlayback = () => {
      if (disposed) return;
      const paused = document.hidden || !visible;
      entrance.paused(paused);
      sweep?.paused(paused);
    };
    const observer = 'IntersectionObserver' in window && title ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      syncPlayback();
    }) : null;
    if (observer && title) observer.observe(title);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, { scope: track, dependencies: [useStatic], revertOnUpdate: true });

  function accessError(status: number) { onAccessError?.(status); }

  return <section ref={track} className="light-gallery" data-testid="light-gallery" data-scroll={scrollMode ? 'true' : undefined}
    data-experience="portrait-navigation" data-lusion={lusion ? 'true' : 'false'} data-motion={useStatic ? 'off' : 'on'}>
    {intro && <IntroCurtain onDone={onIntroDone ?? (() => {})} />}
    <div className="lg-viewport">
      <div className={`lg-backdrop${sceneReady ? ' is-lusion' : ''}`} aria-hidden="true">
        {backgroundPhoto?.lqip && <div className={`lg-backdrop-lqip${backgroundReady ? ' is-ready' : ''}`} style={{ backgroundImage: `url("${backgroundPhoto.lqip}")` }} />}
        {backgroundPhoto && <MediaImage mediaId={backgroundPhoto.mediaId} alt="" version={data.versionId} token={token}
          variant="display" className="lg-backdrop-photo" {...mediaState} onAccessError={accessError} onDecoded={image => { backgroundImage.current = image; setBackgroundReady(true); }} />}
        {lusion && <img className="lg-lusion-fallback" src={`/lusion/0${(sceneReady ? 1 : labIndex) + 1}.jpg`} alt="" />}
        {lusion && sceneAllowed && <LusionScene focusRef={focusRef} onReady={() => setSceneReady(true)} onFail={() => setSceneReady(false)} />}
      </div>
      <header className="lg-topbar">
        <a className="lg-wordmark" href="/" aria-label="返回原版导航">GU QINGTANG<span>PRIVATE EDITION</span></a>
        <span className="lg-edition">{lusion ? 'LUSION LAB / 3D STUDY' : 'THE ART OF PRESENCE / 01'}</span>
      </header>

      <div className="lg-navigation">
        <div className="lg-nav-heading">
          <span className="lg-nav-heading-cn">与我相遇</span>
          <span className="lg-nav-heading-rule" aria-hidden="true" />
          <span className="lg-nav-heading-en">FIND ME HERE</span>
        </div>
        <header className="lg-identity">
          {data.site.avatarMediaId && <MediaImage mediaId={data.site.avatarMediaId} alt={data.site.name + '的头像'} version={data.versionId} token={token} className="lg-avatar" {...mediaState} onAccessError={accessError} />}
          <div><p className="lg-eyebrow">A LITTLE CLOSER</p><h1>{data.site.name}<span>.</span></h1></div>
        </header>
        {data.site.tagline && <p className="lg-tagline">{data.site.tagline}</p>}
        {data.site.description && <p className="lg-description">{data.site.description}</p>}
        <nav aria-label="个人导航" className="lg-links" data-pending={navigationFeedback.pendingId ? 'true' : undefined}>
          <p className="sr-only" role="status" aria-live="polite">{navigationFeedback.pendingId ? `正在打开${data.links.find(link => link.id === navigationFeedback.pendingId)?.label ?? '外部平台'}…` : ''}</p>
          {data.links.map((link, i) => {
            const Icon = linkIcons[link.id];
            const isPrimary = link.id === primaryId;
            const isPending = navigationFeedback.pendingId === link.id;
            const hasError = navigationFeedback.errorId === link.id;
            const state = !link.available ? 'unavailable' : isPending ? 'pending' : hasError ? 'error' : 'available';
            const errorId = `lg-link-error-${link.id}`;
            const body = <><span className="lg-link-index">{String(i + 1).padStart(2, '0')}</span><span className="lg-link-icon">{link.id === 'x_profile' ? <span className="lg-x-mark" aria-hidden="true">X</span> : <Icon size={18} strokeWidth={1.25} aria-hidden="true" />}</span><span className="lg-link-label">{link.label}{link.description && <small>{link.description}</small>}</span><span className="lg-link-end">{isPending ? <small aria-hidden="true">正在打开…</small> : !link.available && <small>{data.states.unavailable}</small>}<ArrowUpRight size={isPrimary ? 18 : 14} strokeWidth={1.25} aria-hidden="true" /></span>{isPending && <span className="lg-link-progress" aria-hidden="true" />}{isPrimary && <span className="cta-breathe" aria-hidden="true" />}</>;
            const className = 'lg-platform' + (isPrimary ? ' is-emphasized' : '');
            return <div className="lg-link-shell" data-primary={isPrimary ? 'true' : undefined} key={link.id}>{link.available ? <a className={className} data-variant={isPrimary ? 'primary' : 'secondary'} data-state={state} aria-busy={isPending} aria-disabled={navigationFeedback.pendingId ? true : undefined} aria-describedby={hasError ? errorId : undefined} href={'/go/' + link.id + '?version=' + encodeURIComponent(data.versionId)} rel="noopener noreferrer" aria-label={link.label + '，前往外部平台'}
              onClick={event => { if (onNavigate || navigationFeedback.pendingId) { event.preventDefault(); if (!navigationFeedback.pendingId) onNavigate?.(link.id, event.metaKey || event.ctrlKey || event.shiftKey || matchMedia('(min-width:800px)').matches); } }}
              onAuxClick={event => { if (event.button === 1 && (onNavigate || navigationFeedback.pendingId)) { event.preventDefault(); if (!navigationFeedback.pendingId) onNavigate?.(link.id, true); } }}>{body}</a>
              : <button type="button" className={className} data-variant="secondary" data-state={state} disabled>{body}</button>}
              {hasError && <div className="link-feedback"><span className="lg-feedback-label" aria-hidden="true">{link.label}</span><p id={errorId} role="alert">{navigationFeedback.message}</p><button type="button" className="link-retry" disabled={Boolean(navigationFeedback.pendingId)} aria-label={`重试打开${link.label}`} onClick={event => {
                event.currentTarget.closest('.lg-link-shell')?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
                onNavigate?.(link.id, navigationFeedback.retryNewTab);
              }}>重试</button></div>}
            </div>;
          })}
          {!data.links.length && <p role="status">{data.states.empty}</p>}
        </nav>
        <p className="lg-nav-note">光影之外，在这里找到我。<span>THE LINKS. THE LOOKS. THE LITTLE MOMENTS.</span></p>
      </div>

      <footer className="lg-footer">
        <div><span>{data.footer.notice || 'PRIVATE COLLECTION'}</span><button type="button" onClick={() => dialog.current?.showModal()}><Info size={13} aria-hidden="true" />站点说明</button>{onReset && <button type="button" onClick={onReset}>{data.resetLabel}</button>}</div>
        <div><button type="button" className="lg-motion" aria-pressed={!useStatic} disabled={reduced} onClick={() => setStaticMode(!staticMode)}>{useStatic ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}{reduced ? '系统减少动态' : staticMode ? '开启文字动效' : '静态浏览'}</button><a href="/">返回原版</a></div>
      </footer>
      {lusion && sceneReady && <div className="lg-lab-hud" ref={hudRef} aria-label="五帧空间">
        <div className="lg-lab-hud-copy"><span>{String(labIndex + 1).padStart(2, '0')} / 05</span><strong>{LAB_CAPTIONS[labIndex]}</strong></div>
        <div className="lg-lab-hud-controls">
          <div className="lg-lab-hud-step" role="button" tabIndex={labIndex === 0 ? -1 : 0} aria-label="上一帧" aria-disabled={labIndex === 0}
            onClick={() => { if (labIndex > 0) stepLab(-1); }}
            onKeyDown={event => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ') && labIndex > 0) { event.preventDefault(); stepLab(-1); } }}>
            <ChevronLeft size={15} strokeWidth={1.2} />
          </div>
          <div className="lg-lab-hud-step" role="button" tabIndex={labIndex === LAB_CAPTIONS.length - 1 ? -1 : 0} aria-label="下一帧" aria-disabled={labIndex === LAB_CAPTIONS.length - 1}
            onClick={() => { if (labIndex < LAB_CAPTIONS.length - 1) stepLab(1); }}
            onKeyDown={event => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ') && labIndex < LAB_CAPTIONS.length - 1) { event.preventDefault(); stepLab(1); } }}>
            <ChevronRight size={15} strokeWidth={1.2} />
          </div>
        </div>
      </div>}
      {lusion && !sceneReady && <div className="lg-lusion-strip" aria-label="五帧缩略图">
        {LAB_CAPTIONS.map((caption, index) => <button key={caption} type="button" className={index === labIndex ? 'is-selected' : ''} aria-current={index === labIndex ? 'true' : undefined} aria-label={`查看${caption}`} onClick={() => setLabIndex(index)}>
          <img src={`/lusion/0${index + 1}.jpg`} alt="" />
          <span>{String(index + 1).padStart(2, '0')}</span>
        </button>)}
      </div>}
      <dialog ref={dialog} className="lg-dialog" aria-labelledby="lg-info-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="lg-dialog-content"><header><h2 id="lg-info-title">站点说明</h2><button type="button" aria-label="关闭站点说明" onClick={() => dialog.current?.close()}><X size={22} strokeWidth={1} /></button></header>
          {(data.info.title || data.info.body || data.info.faq.length > 0) && <section className="lg-info"><h3>{data.info.title}</h3><p className="prose">{data.info.body}</p>{data.info.faq.map(item => <details key={item.id}><summary>{item.question}</summary><p className="prose">{item.answer}</p></details>)}</section>}
          <footer>{data.footer.notice && <p>{data.footer.notice}</p>}{data.footer.contactEmail && <a href={'mailto:' + data.footer.contactEmail}>{data.footer.contactEmail}</a>}{data.footer.removalNotice && <p className="prose">{data.footer.removalNotice}</p>}{data.footer.updateText && <p>{data.footer.updateText}</p>}</footer>
        </div>
      </dialog>
    </div>
  </section>;
}
