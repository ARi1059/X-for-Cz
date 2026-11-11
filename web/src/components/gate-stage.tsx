import type { ReactNode } from 'react';
import { BRAND } from '../brand';

/**
 * Light-only age-gate backdrop. It renders abstract light, never media, and
 * carries the same champagne-on-ink palette as the story page.
 */
export function GateStage({ children }: { children: ReactNode }) {
  return <div className="gate-stage">
    <div className="gate-stage-scene" aria-hidden="true">
      <div className="gate-light-wing gate-light-wing-left" />
      <div className="gate-light-wing gate-light-wing-right" />
      <div className="gate-light-bloom gate-light-bloom-left" />
      <div className="gate-light-bloom gate-light-bloom-right" />
      <div className="gate-light-orbit" />
      <div className="gate-light-rim" />
      <div className="gate-stage-vignette" />
    </div>
    <div className="gate-topbar">
      <span className="gate-monogram" aria-hidden="true">{BRAND.monogram}<span>·</span></span>
      <span className="gate-edition" aria-hidden="true">{BRAND.wordmark}<small>PRIVATE EDITION</small></span>
    </div>
    {children}
  </div>;
}
