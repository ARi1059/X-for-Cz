'use client';

import { useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Pause, Play } from 'lucide-react';
import { usePrimaryCtaMotion, usePrimaryCtaPulse } from './primary-cta-motion.ts';

gsap.registerPlugin(useGSAP);

type NoirStageProps = {
  children: ReactNode;
  version: string;
  preview?: boolean;
  gate?: boolean;
  className?: string;
  testId?: string;
};

/** Abstract light only: this layer never requests or preloads protected media. */
export function NoirStage({ children, preview = false, version, gate = false, className = '', testId }: NoirStageProps) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const enteredVersion = useRef('');
  const enteredPhotos = useRef(new WeakSet<Element>());
  usePrimaryCtaMotion(root, !paused && !reduced);
  usePrimaryCtaPulse(root, !paused && !reduced);

  useGSAP(() => {
    const element = root.current;
    if (!element) return;
    const media = gsap.matchMedia(element);

    media.add({
      reduce: '(prefers-reduced-motion: reduce)',
      fine: '(hover: hover) and (pointer: fine)',
      ambient: '(min-width: 761px) and (hover: hover) and (pointer: fine)',
      any: '(min-width: 0px)',
    }, context => {
      const reduceMotion = Boolean(context.conditions?.reduce);
      setReduced(reduceMotion);
      const select = <T extends Element = HTMLElement>(selector: string) => [...element.querySelectorAll<T>(selector)];
      const entranceKey = `${version}:${gate ? 'gate' : 'site'}`;
      const art = select<HTMLElement>('.photo-art');
      // Reverting the previous context restores every element's visible baseline.
      // Pause is also an explicit request to finish the entrance, not replay it.
      if (paused || reduceMotion) {
        enteredVersion.current = entranceKey;
        art.forEach(photo => enteredPhotos.current.add(photo));
        return;
      }

      const scene = element.querySelector<HTMLElement>('.noir-stage-scene');
      const finiteAnimations: gsap.core.Animation[] = [];
      const interactionTweens: gsap.core.Tween[] = [];
      // Touch and narrow screens keep the same lighting as a static composition.
      const ambient = context.conditions?.ambient ? gsap.timeline({ repeat: -1, yoyo: true, paused: true }) : null;
      if (ambient) ambient.fromTo(select('.noir-light-wing-left'),
          { rotation: -22 }, { rotation: -16, duration: 12, ease: 'sine.inOut' }, 0)
        .fromTo(select('.noir-light-wing-right'),
          { rotation: 22, scaleX: -1 }, { rotation: 16, scaleX: -1, duration: 12, ease: 'sine.inOut' }, 0)
        .to(select('.noir-light-bloom'), { x: 36, y: -28, scale: 1.08, duration: 10, ease: 'sine.inOut', stagger: 1.4 }, 0)
        .to(select('.noir-light-rim'), { opacity: 0.75, duration: 12, ease: 'sine.inOut' }, 0);

      const identity = select('.identity .noir-reveal');
      const title = element.querySelector<HTMLElement>('.identity h1');
      const links = select('.noir-link-shell');
      if (enteredVersion.current !== entranceKey) {
        const entrance = gsap.timeline({
          paused: true,
          defaults: { ease: 'power3.out' },
          // StrictMode first mounts, reverts and mounts again. Only a completed
          // entrance counts; its throwaway first timeline must not consume it.
          onComplete: () => { enteredVersion.current = entranceKey; },
        });
        if (identity.length) entrance.fromTo(identity,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.46, stagger: 0.04, clearProps: 'transform,opacity' }, 0.04);
        if (title) entrance.fromTo(title,
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power3.out', clearProps: 'clipPath' }, 0.04);
        if (links.length) entrance.fromTo(links,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.42, stagger: 0.025, clearProps: 'transform,opacity' }, 0.16);
        finiteAnimations.push(entrance);
      }

      // Observe the actual scroll surface, including the embedded admin preview.
      // Animations are created synchronously so the GSAP context owns cleanup.
      const photoTweens = new Map<Element, gsap.core.Tween>();
      const visiblePhotos = new Set<Element>();
      const intersectionRoot = preview ? element.closest('dialog') : null;
      const ambientTarget = element.querySelector('.noir-light-orbit') ?? element;
      let stageVisible = !('IntersectionObserver' in window);
      let ambientVisible = stageVisible;
      let disposed = false;
      const syncPlayback = () => {
        if (disposed) return;
        const active = !document.hidden && stageVisible;
        ambient?.paused(!active || !ambientVisible);
        finiteAnimations.forEach(animation => animation.paused(!active));
        photoTweens.forEach((tween, photo) => tween.paused(!active || !visiblePhotos.has(photo)));
        if (!active) interactionTweens.forEach(tween => tween.pause());
      };
      const activityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.target === element) stageVisible = entry.isIntersecting;
          if (entry.target === ambientTarget) ambientVisible = entry.isIntersecting;
        }
        syncPlayback();
      }, { root: intersectionRoot }) : null;
      activityObserver?.observe(element);
      if (ambient && ambientTarget !== element) activityObserver?.observe(ambientTarget);
      let observer: IntersectionObserver | undefined;
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) visiblePhotos.add(entry.target);
            else visiblePhotos.delete(entry.target);
          }
          syncPlayback();
        }, { root: intersectionRoot, threshold: 0.08, rootMargin: '0px 0px 36px 0px' });
        art.forEach((photo, index) => {
          if (enteredPhotos.current.has(photo)) return;
          photoTweens.set(photo, gsap.fromTo(photo,
            { y: 22, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.95, delay: Math.min(index, 4) * 0.065, ease: 'power3.out', paused: true,
              onComplete: () => {
                enteredPhotos.current.add(photo);
                visiblePhotos.delete(photo);
                observer?.unobserve(photo);
              } }));
          observer!.observe(photo);
        });
      }

      const dispose: Array<() => void> = [];
      if (context.conditions?.fine) {
        const spot = element.querySelector<HTMLElement>('.noir-pointer-light');
        if (spot) {
          const toX = gsap.quickTo(spot, 'x', { duration: 1.2, ease: 'power3.out' });
          const toY = gsap.quickTo(spot, 'y', { duration: 1.2, ease: 'power3.out' });
          interactionTweens.push(toX.tween, toY.tween);
          const follow = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || document.hidden || !stageVisible) return;
            const bounds = element.getBoundingClientRect();
            toX(((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 100);
            toY(Math.max(-30, Math.min(65, (event.clientY - bounds.top - 300) * 0.11)));
          };
          const reset = () => {
            toX(0); toY(0);
            if (document.hidden || !stageVisible) {
              toX.tween.progress(1).pause(); toY.tween.progress(1).pause();
            }
          };
          element.addEventListener('pointermove', follow, { passive: true });
          element.addEventListener('pointerleave', reset);
          dispose.push(() => {
            element.removeEventListener('pointermove', follow);
            element.removeEventListener('pointerleave', reset);
          });
        }

        for (const photo of art) {
          gsap.set(photo, { transformPerspective: 900, transformOrigin: '50% 50%' });
          const rotateX = gsap.quickTo(photo, 'rotationX', { duration: 0.65, ease: 'power3.out' });
          const rotateY = gsap.quickTo(photo, 'rotationY', { duration: 0.65, ease: 'power3.out' });
          interactionTweens.push(rotateX.tween, rotateY.tween);
          const tilt = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || document.hidden || !stageVisible) return;
            const bounds = photo.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5;
            const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5;
            rotateX(Math.max(-2.5, Math.min(2.5, -y * 5)));
            rotateY(Math.max(-3, Math.min(3, x * 6)));
          };
          const reset = () => {
            rotateX(0); rotateY(0);
            if (document.hidden || !stageVisible) {
              rotateX.tween.progress(1).pause(); rotateY.tween.progress(1).pause();
            }
          };
          photo.addEventListener('pointermove', tilt, { passive: true });
          photo.addEventListener('pointerleave', reset);
          dispose.push(() => {
            photo.removeEventListener('pointermove', tilt);
            photo.removeEventListener('pointerleave', reset);
          });
        }
      }

      // No scroll interception or document-wide styles are needed for this stage.
      if (scene) finiteAnimations.push(gsap.fromTo(scene, { opacity: 0.6 }, { opacity: 1, duration: 0.9, ease: 'power2.out', paused: true }));
      syncPlayback();
      document.addEventListener('visibilitychange', syncPlayback);
      return () => {
        disposed = true;
        activityObserver?.disconnect();
        observer?.disconnect();
        dispose.forEach(remove => remove());
        document.removeEventListener('visibilitychange', syncPlayback);
      };
    });

    return () => media.revert();
  }, { scope: root, dependencies: [version, preview, gate, paused], revertOnUpdate: true });

  const motionEnabled = !paused && !reduced;
  return <div ref={root} className={`noir-stage ${className}`} data-testid={testId} data-preview={preview ? 'true' : undefined} data-gate={gate ? 'true' : undefined} data-motion={motionEnabled ? 'on' : 'off'}>
    <div className="noir-stage-scene" aria-hidden="true">
      <div className="noir-light-wing noir-light-wing-left" />
      <div className="noir-light-wing noir-light-wing-right" />
      <div className="noir-light-bloom noir-light-bloom-left" />
      <div className="noir-light-bloom noir-light-bloom-right" />
      <div className="noir-light-orbit" />
      <div className="noir-light-rim" />
      <div className="noir-pointer-light" />
      <div className="noir-stage-vignette" />
    </div>
    <div className="noir-topbar">
      <div className="noir-edition" aria-label="GU QINGTANG 私人珍藏">
        <span className="noir-monogram" aria-hidden="true">GQ<span>·</span></span>
        <span className="noir-wordmark-full" aria-hidden="true">GU QINGTANG</span>
        <span className="noir-edition-label" aria-hidden="true">PRIVATE<br />EDITION</span>
      </div>
      <button type="button" className="noir-motion-toggle" aria-pressed={motionEnabled} disabled={reduced} aria-label={reduced ? '系统已减少动态效果' : motionEnabled ? '暂停动效' : '启用动效'} onClick={() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        setPaused(value => !value);
      }}>
        <span className="noir-motion-symbol" aria-hidden="true">{motionEnabled ? <Pause size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}</span>
        <span>{reduced ? '静态模式' : motionEnabled ? '暂停动效' : '启用动效'}</span>
      </button>
    </div>
    {children}
  </div>;
}
