'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

type CursorLabel = 'OPEN' | 'VIEW' | 'DRAG' | '';

/** Desktop-only editorial cursor. It never mounts on touch, keyboard-only or reduced-motion. */
export function OpenCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const labelRef = useRef<CursorLabel>('');
  const [label, setLabel] = useState<CursorLabel>('');
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let dispose = () => {};

    const setCursorLabel = (next: CursorLabel) => {
      if (labelRef.current === next) return;
      labelRef.current = next;
      setLabel(next);
    };

    const setup = () => {
      dispose();
      if (!fine.matches || reduce.matches) { setEnabled(false); return; }
      setEnabled(true);
      const dotEl = dot.current, ringEl = ring.current;
      if (!dotEl || !ringEl) return;
      const dotX = gsap.quickTo(dotEl, 'x', { duration: 0.08, ease: 'none' });
      const dotY = gsap.quickTo(dotEl, 'y', { duration: 0.08, ease: 'none' });
      const ringX = gsap.quickTo(ringEl, 'x', { duration: 0.26, ease: 'power3.out' });
      const ringY = gsap.quickTo(ringEl, 'y', { duration: 0.26, ease: 'power3.out' });
      let placed = false;
      const show = (x: number, y: number) => {
        if (document.querySelector('[data-motion="off"]')) { hide(); return; }
        document.documentElement.classList.add('has-open-cursor');
        setActive(true);
        if (!placed) { gsap.set([dotEl, ringEl], { x, y }); placed = true; }
        dotX(x); dotY(y); ringX(x); ringY(y);
      };
      const hide = () => {
        document.documentElement.classList.remove('has-open-cursor');
        setActive(false);
        setCursorLabel('');
      };
      const move = (event: PointerEvent) => show(event.clientX, event.clientY);
      const over = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) { setCursorLabel(''); return; }
        const photo = target.closest('.photo');
        const strip = target.closest('.gallery-strip');
        const interactive = target.closest('a, button, [role="link"], summary');
        setCursorLabel(photo ? 'VIEW' : strip ? 'DRAG' : interactive ? 'OPEN' : '');
      };
      const leave = () => hide();
      const keydown = () => hide();
      window.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('pointerover', over, { passive: true });
      document.addEventListener('pointerleave', leave);
      document.addEventListener('keydown', keydown);
      dispose = () => {
        window.removeEventListener('pointermove', move);
        document.removeEventListener('pointerover', over);
        document.removeEventListener('pointerleave', leave);
        document.removeEventListener('keydown', keydown);
        dotX.tween.kill(); dotY.tween.kill(); ringX.tween.kill(); ringY.tween.kill();
        document.documentElement.classList.remove('has-open-cursor');
        setActive(false);
      };
    };

    const refresh = () => setup();
    fine.addEventListener('change', refresh);
    reduce.addEventListener('change', refresh);
    setup();
    return () => {
      dispose();
      fine.removeEventListener('change', refresh);
      reduce.removeEventListener('change', refresh);
    };
  }, []);

  return <div className={`open-cursor${active ? ' is-active' : ''}${label ? ' has-label' : ''}${enabled ? '' : ' is-off'}`} aria-hidden="true">
    <span className="open-cursor-dot" ref={dot} />
    <span className="open-cursor-ring" ref={ring}><span className="open-cursor-label">{label}</span></span>
  </div>;
}
