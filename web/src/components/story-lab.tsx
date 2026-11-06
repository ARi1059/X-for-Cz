'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, Check, ChevronDown, ChevronRight, Gem, Heart, Info, Pause, Play, Radio, Send, X,
} from 'lucide-react';
import type { PublicSite } from './client-api';
import { MediaImage } from './media-image';
import { idleNavigationFeedback, type NavigationFeedback } from './navigation-state';
import { resolvePrimaryLinkId } from './link-presentation';
import { IntroCurtain } from './intro-curtain';
import {
  FALLBACK_FEED, MEMBERSHIP_BENEFITS, MEMBERSHIP_TIERS, PURCHASE_FAQ, PURCHASE_STEPS,
  STORY_BIO, STORY_SECTIONS, STORY_SOURCES, formatUpdated,
  type StoryFeed, type StoryPost,
} from './story-content';
import './story-shell.css';
import './story-lab.css';

type Props = {
  data: PublicSite;
  token?: string;
  intro?: boolean;
  onIntroDone?: () => void;
  navigationFeedback?: NavigationFeedback;
  onReset?: () => void;
  onNavigate?: (id: string, newTab: boolean) => void;
  onAccessError?: (status: number) => void;
};

const BACKGROUNDS = ['/lusion/01.jpg', '/lusion/02.jpg', '/lusion/03.jpg', '/lusion/04.jpg', '/lusion/05.jpg'];
const LAST = STORY_SECTIONS.length - 1;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const linkIcons = { x_profile: ArrowUpRight, tg_personal: Send, tg_preview: Radio, onlyfans: Heart, membership: Gem };
const MOBILE_QUERY = '(max-width: 959px)';
const PHONE_QUERY = '(max-width: 599px)';

export function StoryLab({
  data, token = '', intro = false, onIntroDone, navigationFeedback = idleNavigationFeedback,
  onReset, onNavigate, onAccessError,
}: Props) {
  const track = useRef<HTMLElement>(null);
  const currentRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [feed, setFeed] = useState<StoryFeed>(FALLBACK_FEED);
  const [feedLoading, setFeedLoading] = useState(true);
  const [staticMode, setStaticMode] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && matchMedia(MOBILE_QUERY).matches);
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && matchMedia(PHONE_QUERY).matches);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const useStatic = reduced || staticMode;
  const bgRefs = useRef<Array<HTMLDivElement | null>>([]);
  const infoDialog = useRef<HTMLDialogElement>(null);
  const tutorialDialog = useRef<HTMLDialogElement>(null);
  const mediaState = { loadingText: data.states.loading, errorText: data.states.error };

  const links = useMemo(() => data.links.map(link => link.id === 'tg_personal'
    ? { ...link, label: 'Telegram 防丢主页', description: '永久入口 · 丢了也能找到我' }
    : link), [data.links]);
  const primaryId = links.find(link => link.id === 'tg_personal' && link.available)?.id ?? resolvePrimaryLinkId(links);

  // Section changes update the DOM directly. Lifting five full panels into
  // React state made every station boundary re-render the whole page and
  // produced a visible 100ms+ hitch at DPR2; refs keep scrolling smooth.
  const applyActive = useCallback((index: number) => {
    const next = clamp(index, 0, LAST);
    if (next === currentRef.current) return;
    currentRef.current = next;
    const panel = panelRef.current;
    if (panel) {
      panel.dataset.active = String(next);
      panel.querySelectorAll<HTMLElement>('.story-panel-section').forEach((item, itemIndex) => {
        item.setAttribute('aria-hidden', itemIndex === next ? 'false' : 'true');
        item.toggleAttribute('inert', itemIndex !== next);
      });
    }
    const rail = railRef.current;
    if (rail) {
      [...rail.querySelectorAll<HTMLButtonElement>('button')].forEach((button, buttonIndex) => {
        button.classList.toggle('is-active', buttonIndex === next);
        if (buttonIndex === next) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }
    const hint = hintRef.current;
    if (hint) {
      const end = next >= LAST;
      hint.disabled = end;
      hint.tabIndex = end ? -1 : 0;
      if (end) hint.setAttribute('data-hidden', 'true'); else hint.removeAttribute('data-hidden');
      const upcoming = STORY_SECTIONS[next + 1];
      hint.setAttribute('aria-label', upcoming ? `滚动到下一节：${upcoming.nav}` : '已经是最后一节');
    }
    if (statusRef.current) statusRef.current.textContent = STORY_SECTIONS[next]!.title;
  }, []);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const query = matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const query = matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    BACKGROUNDS.forEach(source => { const image = new Image(); image.src = source; });
  }, []);

  useEffect(() => {
    feed.posts.forEach(post => {
      const image = new Image();
      image.decoding = 'async';
      image.src = post.image;
      void image.decode?.().catch(() => {});
    });
  }, [feed.posts]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/lab/story', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('story');
      return response.json() as Promise<StoryFeed>;
    }).then(value => { if (!cancelled) setFeed(value); }).catch(() => {}).finally(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Desktop: the tall section is the scroll track; the fixed layers crossfade
  // between the five portraits as the page scrolls.
  useEffect(() => {
    const story = track.current;
    if (!story) return;
    const query = matchMedia(MOBILE_QUERY);
    let cleanup = () => {};
    const setup = () => {
      cleanup();
      if (query.matches) return;
      let top = story.getBoundingClientRect().top + window.scrollY;
      let range = Math.max(1, story.offsetHeight - window.innerHeight);
      const update = () => {
        const progress = clamp((window.scrollY - top) / range, 0, 1);
        const focus = progress * LAST;
        for (let index = 0; index < BACKGROUNDS.length; index++) {
          const weight = Math.max(0, 1 - Math.abs(focus - index));
          const layer = bgRefs.current[index];
          if (layer) layer.style.opacity = String(weight > 0.002 ? weight : 0.001);
        }
        applyActive(Math.round(focus));
      };
      const measure = () => {
        top = story.getBoundingClientRect().top + window.scrollY;
        range = Math.max(1, story.offsetHeight - window.innerHeight);
        update();
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', measure);
      cleanup = () => {
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', measure);
      };
    };
    setup();
    query.addEventListener('change', setup);
    return () => { query.removeEventListener('change', setup); cleanup(); };
  }, [applyActive]);

  // Mobile: sections are normal document flow; the observer keeps the down
  // hint's label/end state in sync.
  useEffect(() => {
    const query = matchMedia(MOBILE_QUERY);
    let observer: IntersectionObserver | null = null;
    const setup = () => {
      observer?.disconnect(); observer = null;
      if (!query.matches) return;
      const sections = [...document.querySelectorAll<HTMLElement>('.story-mobile-section')];
      observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.section ?? -1);
        if (index >= 0) applyActive(index);
      }, { threshold: [0.45, 0.6] });
      sections.forEach(item => observer?.observe(item));
    };
    setup();
    query.addEventListener('change', setup);
    return () => { query.removeEventListener('change', setup); observer?.disconnect(); };
  }, [applyActive]);

  function scrollToSection(index: number) {
    const story = track.current;
    if (!story) return;
    const target = clamp(index, 0, LAST);
    if (matchMedia(MOBILE_QUERY).matches) {
      const sections = [...document.querySelectorAll<HTMLElement>('.story-mobile-section')];
      sections[target]?.scrollIntoView({ behavior: useStatic ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const top = story.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(0, story.offsetHeight - window.innerHeight);
    window.scrollTo({ top: top + (target / LAST) * range, behavior: useStatic ? 'auto' : 'smooth' });
  }

  function openLink(id: string, newTab = false) {
    const link = links.find(item => item.id === id);
    if (!link?.available || navigationFeedback.pendingId) return;
    onNavigate?.(id, newTab);
  }

  function linkHref(id: string) {
    return '/go/' + id + '?version=' + encodeURIComponent(data.versionId);
  }

  function renderCta(id: string, label: string, primary = false) {
    const link = links.find(item => item.id === id);
    if (!link?.available) return <span className="story-cta is-disabled">{label} · 暂未开放</span>;
    return <button type="button" className={'story-cta' + (primary ? ' is-primary' : '')} disabled={Boolean(navigationFeedback.pendingId)}
      onClick={() => openLink(id, false)}>{label}<ArrowUpRight size={13} strokeWidth={1.3} aria-hidden="true" /></button>;
  }

  function renderPost(post: StoryPost) {
    const body = <>
      <span className="story-post-media">
        <img src={post.image} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" />
        {post.mediaType === 'video' && <span className="story-post-play" aria-hidden="true"><Play size={12} fill="currentColor" /></span>}
        {post.demo && <span className="story-post-demo">示例</span>}
      </span>
      <span className="story-post-copy">
        <strong>{post.text || '最新预告'}</strong>
        <small>{post.demo ? '配置 X API 后自动更新' : new Date(post.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</small>
      </span>
      <ArrowUpRight size={14} strokeWidth={1.2} aria-hidden="true" />
    </>;
    if (post.url) {
      return <a key={post.id} className="story-post" href={post.url} target="_blank" rel="noopener noreferrer" aria-label="在 X 查看这条预告">{body}</a>;
    }
    return <button key={post.id} type="button" className="story-post" disabled={!links.find(link => link.id === 'x_profile')?.available}
      onClick={() => openLink('x_profile', true)} aria-label="在 X 查看最新预告">{body}</button>;
  }

  function renderLinks() {
    return <nav className="sh-links story-links" aria-label="个人导航" data-pending={navigationFeedback.pendingId ? 'true' : undefined}>
      {links.map((link, index) => {
        const Icon = linkIcons[link.id];
        const isPrimary = link.id === primaryId;
        const isPending = navigationFeedback.pendingId === link.id;
        const hasError = navigationFeedback.errorId === link.id;
        const state = !link.available ? 'unavailable' : isPending ? 'pending' : hasError ? 'error' : 'available';
        const errorId = `story-link-error-${link.id}`;
        const body = <>
          <span className="sh-link-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="sh-link-icon">{link.id === 'x_profile' ? <span className="sh-x-mark" aria-hidden="true">X</span> : <Icon size={16} strokeWidth={1.25} aria-hidden="true" />}</span>
          <span className="sh-link-label">{link.label}{link.description && <small>{link.description}</small>}</span>
          <span className="sh-link-end">{isPending ? <small aria-hidden="true">正在打开…</small> : !link.available && <small>暂未开放</small>}{isPrimary ? <ArrowUpRight size={17} strokeWidth={1.2} aria-hidden="true" /> : <ChevronRight size={13} strokeWidth={1.2} aria-hidden="true" />}</span>
          {isPending && <span className="sh-link-progress" aria-hidden="true" />}
        </>;
        const className = 'sh-platform' + (isPrimary ? ' is-emphasized' : '');
        return <div className="sh-link-shell" data-primary={isPrimary ? 'true' : undefined} key={link.id}>
          {link.available ? <a className={className} data-variant={isPrimary ? 'primary' : 'secondary'} data-state={state}
            aria-busy={isPending} aria-disabled={navigationFeedback.pendingId ? true : undefined}
            aria-describedby={hasError ? errorId : undefined} href={linkHref(link.id)} rel="noopener noreferrer"
            aria-label={link.label + '，前往外部平台'}
            onClick={event => {
              if (navigationFeedback.pendingId) { event.preventDefault(); return; }
              event.preventDefault();
              onNavigate?.(link.id, event.metaKey || event.ctrlKey || event.shiftKey || matchMedia('(min-width:800px)').matches);
            }}
            onAuxClick={event => {
              if (event.button !== 1 || navigationFeedback.pendingId) return;
              event.preventDefault();
              onNavigate?.(link.id, true);
            }}>{body}</a>
            : <button type="button" className={className} data-variant="secondary" data-state={state} disabled>{body}</button>}
          {hasError && <div className="link-feedback"><span className="sh-feedback-label" aria-hidden="true">{link.label}</span><p id={errorId} role="alert">{navigationFeedback.message}</p>
            <button type="button" className="link-retry" disabled={Boolean(navigationFeedback.pendingId)} onClick={() => onNavigate?.(link.id, navigationFeedback.retryNewTab)}>重试</button></div>}
        </div>;
      })}
    </nav>;
  }

  function renderMeet() {
    return <div className="story-meet">
      <header className="sh-identity">
        {data.site.avatarMediaId && <MediaImage mediaId={data.site.avatarMediaId} alt={data.site.name + '的头像'} version={data.versionId} token={token} className="sh-avatar" {...mediaState} onAccessError={status => onAccessError?.(status)} />}
        <div><p className="sh-eyebrow">A LITTLE CLOSER</p><h1>{data.site.name}<span>.</span></h1></div>
      </header>
      {data.site.tagline && <p className="sh-tagline">{data.site.tagline}</p>}
      {data.site.description && <p className="sh-description">{data.site.description}</p>}
      {renderLinks()}
      <p className="sh-nav-note">光影之外，在这里找到我。<span>THE LINKS. THE LOOKS. THE LITTLE MOMENTS.</span></p>
    </div>;
  }

  function renderAbout() {
    return <>
      <p className="story-lead">{STORY_BIO}</p>
      <div className="story-stats" aria-busy={feedLoading}>
        {feed.stats.map(stat => <div className="story-stat" key={stat.key}>
          <span className="story-stat-label">{stat.label}</span>
          <strong>{stat.display}</strong>
          <small>{stat.demo ? '示例数据' : `更新于 ${formatUpdated(stat.updatedAt)}`}{!stat.demo && <i>{stat.source}</i>}</small>
        </div>)}
      </div>
      <p className="story-source">{feed.notice ?? STORY_SOURCES}</p>
      <div className="story-actions">{renderCta('x_profile', '关注 X')}{renderCta('tg_preview', '进入预告频道')}</div>
    </>;
  }

  function renderPreview() {
    const total = Math.min(feed.posts.length, 3);
    const visible = phone && !previewExpanded ? 2 : 3;
    return <>
      <p className="story-lead">X 上最新发布的视频和图片，会自动同步到这里；本页只加载链接和预览图，不在服务器保存原片。</p>
      <div className="story-posts">{feed.posts.slice(0, visible).map(renderPost)}</div>
      {phone && total > 2 && <button type="button" className="story-preview-more" aria-expanded={previewExpanded}
        onClick={() => setPreviewExpanded(value => !value)}>{previewExpanded ? '收起预告' : `查看全部 ${total} 条`}
        <ChevronDown size={13} strokeWidth={1.2} aria-hidden="true" /></button>}
      <div className="story-actions">{renderCta('tg_preview', '进入预告频道', true)}{renderCta('x_profile', '打开 X 主页')}</div>
    </>;
  }

  function renderMembership() {
    return <>
      <p className="story-lead">会员频道以 USDT 支付，通过 Telegram Bot 下单；确认后进入会员频道，单月 / 季度 / 年费到期自动移出。</p>
      <ul className="story-benefits">{MEMBERSHIP_BENEFITS.map(benefit => <li key={benefit}><Check size={12} strokeWidth={1.5} aria-hidden="true" />{benefit}</li>)}</ul>
      <div className="story-tiers">{MEMBERSHIP_TIERS.map(tier => <div className={'story-tier' + (tier.featured ? ' is-featured' : '')} key={tier.id}>
        <span>{tier.name}</span><strong>{tier.period}</strong><small>{tier.note}</small>
        {tier.featured && <em>推荐</em>}
      </div>)}</div>
      <p className="story-source">价格与 USDT 网络以 Telegram Bot 内实时报价为准。</p>
      <div className="story-actions"><button type="button" className="story-cta is-primary" onClick={() => scrollToSection(4)}>查看购买方式<ChevronRight size={13} strokeWidth={1.3} aria-hidden="true" /></button></div>
    </>;
  }

  function renderPurchase() {
    return <>
      <p className="story-lead">只通过 Telegram Bot 使用 USDT 购买。Bot 确认到账后会发一条仅允许一人使用的频道链接；单月、季度、年费到期自动移出。</p>
      <ol className="story-steps">{PURCHASE_STEPS.slice(0, 3).map((step, index) => <li key={step.title}>
        <span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><p>{step.body}</p></div>
      </li>)}</ol>
      <div className="story-actions">
        {renderCta('membership', '打开 Telegram Bot', true)}
        <button type="button" className="story-cta" onClick={() => tutorialDialog.current?.showModal()}>查看完整教程</button>
      </div>
      <p className="story-warning">只使用 Bot 内显示的 USDT 地址和网络；不要向任何人私下转账。邀请链接仅限一人，转发会失效。</p>
    </>;
  }

  function renderSection(index: number) {
    if (index === 0) return renderMeet();
    if (index === 1) return renderAbout();
    if (index === 2) return renderPreview();
    if (index === 3) return renderMembership();
    return renderPurchase();
  }

  function renderFooter(mobile = false) {
    return <footer className={'story-footer sh-footer' + (mobile ? ' story-footer-mobile' : '')}>
      <div><span>仅限成年人</span><button type="button" onClick={() => infoDialog.current?.showModal()}><Info size={13} aria-hidden="true" />站点说明</button>
        {onReset && <button type="button" onClick={onReset}>重新确认年龄</button>}</div>
      <div><button type="button" className="sh-motion" aria-pressed={!useStatic} disabled={reduced} onClick={() => setStaticMode(value => !value)}>
        {useStatic ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}{reduced ? '系统减少动态' : staticMode ? '开启动效' : '静态浏览'}
      </button></div>
    </footer>;
  }

  return <section ref={track} className="story-lab story-shell" data-testid="story-lab" data-motion={useStatic ? 'off' : 'on'}>
    {!mobile && <div className="story-fixed">
      <div className="story-backdrop" aria-hidden="true">
        {BACKGROUNDS.map((source, index) => <div className="story-bg-layer" key={source} ref={element => { bgRefs.current[index] = element; }}>
          <div className="story-bg-photo" style={{ backgroundImage: `url(${source})` }} />
        </div>)}
      </div>
      <div className="story-wash" aria-hidden="true" />
      <header className="story-topbar">
        <span className="sh-wordmark">GU QINGTANG<span>PRIVATE EDITION</span></span>
        <span className="sh-edition">LUSION LAB / STORY 01</span>
      </header>
      <p className="sr-only" ref={statusRef} role="status" aria-live="polite">{STORY_SECTIONS[0]!.title}</p>
      <main className="story-panel" ref={panelRef} data-active="0">
        {STORY_SECTIONS.map((item, index) => <div className="story-panel-section" data-panel={index} key={item.id} aria-hidden={index === 0 ? 'false' : 'true'} inert={index !== 0}>
          <p className="story-kicker">{item.kicker}</p>
          <h2 className="story-title">{item.title}</h2>
          {renderSection(index)}
        </div>)}
      </main>
      <nav className="story-rail" aria-label="章节导航" ref={railRef}>
        {STORY_SECTIONS.map((item, index) => <button key={item.id} type="button" aria-label={`跳到：${item.nav}`}
          aria-current={index === 0 ? 'true' : undefined} className={index === 0 ? 'is-active' : undefined}
          onClick={() => scrollToSection(index)}><span>{String(index + 1).padStart(2, '0')}</span><i aria-hidden="true" /></button>)}
      </nav>
      {renderFooter()}
    </div>}

    {mobile && <main className="story-mobile">
      <header className="story-mobile-topbar">
        <span className="sh-wordmark">GU QINGTANG<span>PRIVATE EDITION</span></span>
        <span>STORY 01</span>
      </header>
      {STORY_SECTIONS.map((item, index) => <section className="story-mobile-section" key={item.id} data-section={index}>
        <div className="story-mobile-hero">
          <img className="story-mobile-photo" src={BACKGROUNDS[index]} alt="" loading={index === 0 ? 'eager' : 'lazy'} draggable={false} />
          <div className="story-mobile-hero-caption">
            <p className="story-kicker">{item.kicker}</p>
            <h2 className="story-title">{item.title}</h2>
          </div>
          {index < LAST && <button type="button" className="story-mobile-hint" onClick={() => scrollToSection(index + 1)}
            aria-label={`滚动到下一节：${STORY_SECTIONS[index + 1]?.nav}`}>
            <span>SCROLL</span><span className="story-hint-ring"><ChevronDown size={18} strokeWidth={1.2} aria-hidden="true" /></span>
          </button>}
        </div>
        <div className="story-mobile-content">
          <p className="story-kicker">{item.kicker}</p>
          <h2 className="story-title">{item.title}</h2>
          {renderSection(index)}
        </div>
      </section>)}
      {renderFooter(true)}
    </main>}

    <button ref={hintRef} className="story-hint"
      onClick={() => scrollToSection(currentRef.current + 1)} aria-label="滚动到下一节：个人简介">
      <span>SCROLL</span><span className="story-hint-ring"><ChevronDown size={18} strokeWidth={1.2} aria-hidden="true" /></span>
    </button>

    {intro && <IntroCurtain onDone={onIntroDone ?? (() => {})} />}

    <dialog ref={infoDialog} className="sh-dialog" aria-labelledby="story-info-title" onClick={event => { if (event.target === event.currentTarget) infoDialog.current?.close(); }}>
      <div className="sh-dialog-content"><header><h2 id="story-info-title">站点说明</h2><button type="button" aria-label="关闭站点说明" onClick={() => infoDialog.current?.close()}><X size={22} strokeWidth={1} /></button></header>
        {(data.info.title || data.info.body || data.info.faq.length > 0) && <section className="sh-info"><h3>{data.info.title}</h3><p className="prose">{data.info.body}</p>
          {data.info.faq.map(item => <details key={item.id}><summary>{item.question}</summary><p className="prose">{item.answer}</p></details>)}</section>}
        <footer>{data.footer.notice && <p>{data.footer.notice}</p>}{data.footer.contactEmail && <a href={'mailto:' + data.footer.contactEmail}>{data.footer.contactEmail}</a>}
          {data.footer.removalNotice && <p className="prose">{data.footer.removalNotice}</p>}{data.footer.updateText && <p>{data.footer.updateText}</p>}</footer>
      </div>
    </dialog>

    <dialog ref={tutorialDialog} className="sh-dialog story-tutorial" aria-labelledby="story-tutorial-title" onClick={event => { if (event.target === event.currentTarget) tutorialDialog.current?.close(); }}>
      <div className="sh-dialog-content"><header><h2 id="story-tutorial-title">会员购买教程</h2><button type="button" aria-label="关闭会员购买教程" onClick={() => tutorialDialog.current?.close()}><X size={22} strokeWidth={1} /></button></header>
        <section className="story-tutorial-body">
          <p>会员只通过 Telegram Bot 使用 USDT 购买；站内不收款、不保存支付信息。Bot 确认到账后发一条仅允许一人使用的频道链接。</p>
          <ol>{PURCHASE_STEPS.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol>
          <h3>常见问题</h3>
          {PURCHASE_FAQ.map(item => <details key={item.q}><summary>{item.q}</summary><p className="prose">{item.a}</p></details>)}
          <p className="story-warning">只使用 Bot 内显示的 USDT 地址和网络；不要向任何人私下转账。单月、季度、年费到期后 Bot 自动移出频道。</p>
          <div className="story-actions">{renderCta('membership', '打开 Telegram Bot', true)}</div>
        </section>
      </div>
    </dialog>
  </section>;
}
