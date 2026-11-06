'use client';

import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';

/**
 * Magnetic pointer feedback for the single primary entry.
 * `translate` (not `transform`) is used so the existing hover/press transforms
 * keep working unchanged.
 */
export function usePrimaryCtaMotion(scope: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup = () => {};

    const setup = () => {
      cleanup();
      const link = root.querySelector<HTMLElement>('[data-variant="primary"]');
      if (!enabled || !link || !fine.matches || reduce.matches) return;
      const toX = gsap.quickTo(link, '--magnet-x', { duration: 0.35, ease: 'power3.out' });
      const toY = gsap.quickTo(link, '--magnet-y', { duration: 0.35, ease: 'power3.out' });
      const reset = () => { toX(0); toY(0); };
      const move = (event: PointerEvent) => {
        const rect = link.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        if (Math.abs(dx) > rect.width / 2 + 80 || Math.abs(dy) > rect.height / 2 + 80) { reset(); return; }
        toX(gsap.utils.clamp(-5, 5, dx * 0.08));
        toY(gsap.utils.clamp(-3, 3, dy * 0.06));
      };
      root.addEventListener('pointermove', move, { passive: true });
      root.addEventListener('pointerleave', reset);
      cleanup = () => {
        root.removeEventListener('pointermove', move);
        root.removeEventListener('pointerleave', reset);
        toX.tween.kill(); toY.tween.kill();
        if (link.isConnected) gsap.set(link, { '--magnet-x': 0, '--magnet-y': 0 });
      };
    };

    const refresh = () => setup();
    fine.addEventListener('change', refresh);
    reduce.addEventListener('change', refresh);
    setup();
    return () => {
      cleanup();
      fine.removeEventListener('change', refresh);
      reduce.removeEventListener('change', refresh);
    };
  }, [scope, enabled]);
}


/** One shared one-shot breath for both home and light. CSS animation was
 * restarting when light-gallery left its initial reduced=true state. */
export function usePrimaryCtaPulse(scope: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = scope.current;
    const link = root?.querySelector<HTMLElement>('[data-variant="primary"]');
    const ring = link?.querySelector<HTMLElement>('.cta-breathe');
    if (!ring) return;
    const tween = gsap.fromTo(ring,
      { opacity: 0, scale: 0.985 },
      { opacity: 0.55, scale: 1, duration: 0.55, delay: 1.2, ease: 'sine.out', yoyo: true, repeat: 1,
        onComplete: () => gsap.set(ring, { opacity: 0, scale: 1 }) });
    return () => {
      tween.kill();
      if (ring.isConnected) gsap.set(ring, { opacity: 0, scale: 1 });
    };
  }, [scope, enabled]);
}
