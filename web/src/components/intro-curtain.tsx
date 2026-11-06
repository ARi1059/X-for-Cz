'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** A one-shot cinematic reveal. It never blocks pointer input or layout. */
export function IntroCurtain({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useGSAP(() => {
    const element = root.current;
    if (!element) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      done.current();
      return;
    }
    const panels = element.querySelectorAll<HTMLElement>('.intro-curtain-panel');
    const line = element.querySelector<HTMLElement>('.intro-curtain-line');
    const copy = element.querySelector<HTMLElement>('.intro-curtain-copy');
    if (!line || !copy) return;
    gsap.set(copy, { autoAlpha: 0, y: 8 });
    const timeline = gsap.timeline({
      onComplete: () => {
        if (process.env.NODE_ENV !== 'production' && (window as Window & { __introHold?: boolean }).__introHold) return;
        done.current();
      },
      defaults: { ease: 'power3.inOut' },
    });
    if (process.env.NODE_ENV !== 'production') {
      (window as Window & { __introTimeline?: gsap.core.Timeline }).__introTimeline = timeline;
    }
    timeline
      .to(line, { scaleY: 1, duration: 0.35, ease: 'power3.inOut' }, 0)
      .to(copy, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.04)
      .to(panels, { scaleY: 0, duration: 0.55, ease: 'power3.out' }, 0.04)
      .to(copy, { autoAlpha: 0, y: -4, duration: 0.12, ease: 'power2.in' }, 0.1)
      .to(line, { autoAlpha: 0, duration: 0.12 }, 0.12)
      .to(element, { autoAlpha: 0, duration: 0.2 }, 0.55)
      .set(element, { display: 'none' });
    return () => timeline.kill();
  }, { scope: root });

  return <div className="intro-curtain" ref={root} aria-hidden="true">
    <span className="intro-curtain-panel intro-curtain-panel-top" />
    <span className="intro-curtain-panel intro-curtain-panel-bottom" />
    <div className="intro-curtain-stage">
      <span className="intro-curtain-line" />
      <p className="intro-curtain-copy">AFTER HOURS<span>PRIVATE EDITION / 01</span></p>
    </div>
  </div>;
}
