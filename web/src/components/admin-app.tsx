'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import type { SiteConfig, ValidationIssue } from '../contracts/site-config.ts';
import { api, ApiError, errorMessage, postBody, previewProjection, type AdminSession, type Draft, type Preview, type MediaList, type MediaRecord, type Stats } from './client-api.ts';
import { MediaImage, PublicView } from './public-view.tsx';

type Tab = 'content' | 'age' | 'links' | 'photos' | 'info' | 'footer' | 'states' | 'account' | 'stats';
type LinkStateChange = { id: SiteConfig['links'][number]['id']; field: 'enabled' | 'visible'; label: string };
const tabs: { id: Tab; label: string }[] = [
  { id: 'content', label: '基础与公开文案' }, { id: 'age', label: '成年确认' }, { id: 'links', label: '五个导航入口' }, { id: 'photos', label: '头像与照片' }, { id: 'info', label: '补充信息与问答' }, { id: 'footer', label: '页脚与分享' }, { id: 'states', label: '状态文案' }, { id: 'stats', label: '访问统计' }, { id: 'account', label: '账号与会话' },
];
const fieldId = (path: string) => 'field-' + path.replaceAll('.', '-');
const count = (value: string) => [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value)].length;
function Field({ path, label, value, change, issues = [], help, multiline = false, limit, type = 'text' }: { path: string; label: string; value: string | null; change: (value: string) => void; issues?: ValidationIssue[]; help?: string; multiline?: boolean; limit?: number; type?: string }) {
  const id = fieldId(path); const errors = issues.filter(issue => issue.path === path);
  const props = { id, value: value ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(event.target.value), 'aria-invalid': errors.length > 0, 'aria-describedby': `${id}-help`, name: path };
  return <div className="field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={4} /> : <input {...props} type={type} />}
    <div id={`${id}-help`} className={`field-help ${errors.length ? 'error-text' : ''}`}>{errors.length ? errors.map(issue => issue.message).join(' ') : help}{limit && <span className={count(value ?? '') > limit ? 'error-text' : ''}>{count(value ?? '')} / {limit}</span>}</div>
  </div>;
}
function Toggle({ label, checked, change, id }: { label: string; checked: boolean; change: (value: boolean) => void; id?: string }) {
  return <label className="checkbox-row" {...(id ? { id } : {})}><input type="checkbox" checked={checked} onChange={event => change(event.target.checked)} />{label}</label>;
}
function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) { return <section className="editor-panel"><h2>{title}</h2>{note && <p className="muted">{note}</p>}{children}</section>; }

export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [tab, setTab] = useState<Tab>('content');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [media, setMedia] = useState<MediaList>({ items: [], nextCursor: null });
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [purpose, setPurpose] = useState<'controlled' | 'public_share'>('controlled'); const [neutralConfirmed, setNeutralConfirmed] = useState(false);
  const [statistics, setStatistics] = useState<Stats | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [statFrom, setStatFrom] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)); const [statTo, setStatTo] = useState(today);
  const [deleteTarget, setDeleteTarget] = useState<MediaRecord | null>(null);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [linkStateChange, setLinkStateChange] = useState<LinkStateChange | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null); const deleteDialog = useRef<HTMLDialogElement>(null); const reloadRef = useRef<HTMLDialogElement>(null);
  const linkStateDialog = useRef<HTMLDialogElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const dirty = Boolean(config && draft && JSON.stringify(config) !== JSON.stringify(draft.config));

  function edit(action: (value: SiteConfig) => void) { setConfig(previous => { if (!previous) return previous; const next = structuredClone(previous); action(next); return next; }); setMessage(''); }
  function fail(caught: unknown) {
    setError(errorMessage(caught)); setMessage('');
    if (caught instanceof ApiError) { setIssues(caught.fields); if (caught.status === 401) { setSession(null); setPassword(''); setError('管理会话已到期。重新登录后可继续保存当前输入。'); } }
    requestAnimationFrame(() => feedback.current?.focus());
  }
  const adminRequest = <T,>(path: string, body: unknown, method = 'POST') => api<T>(path, { ...postBody(body, session?.csrfToken), method });
  async function loadMedia(cursor?: string) {
    const result = await api<MediaList>('/api/admin/media?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    setMedia(previous => cursor ? { items: [...previous.items, ...result.items], nextCursor: result.nextCursor } : result);
  }
  async function loadDraft(replace = true) {
    const result = await api<Draft>('/api/admin/draft'); setDraft(result); if (replace) setConfig(result.config); return result;
  }
  useEffect(() => {
    void api<AdminSession>('/api/admin/session').then(async value => { setSession(value); await Promise.all([loadDraft(), loadMedia()]); }).catch(caught => { if (!(caught instanceof ApiError && caught.status === 401)) setError(errorMessage(caught)); }).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    addEventListener('beforeunload', beforeUnload); return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => { if (preview) previewDialog.current?.showModal(); }, [preview]);
  useEffect(() => { if (deleteTarget) deleteDialog.current?.showModal(); }, [deleteTarget]);
  useEffect(() => { if (reloadDialog) reloadRef.current?.showModal(); }, [reloadDialog]);
  useEffect(() => { if (linkStateChange) linkStateDialog.current?.showModal(); }, [linkStateChange]);

  async function login(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const result = await api<AdminSession>('/api/admin/login', postBody({ username, password })); setSession(result); setPassword('');
      if (!config) await loadDraft(); await loadMedia(); setMessage('已登录。');
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  async function save(): Promise<Draft | null> {
    if (!config || !draft) return null;
    const submitted = config;
    const result = await adminRequest<Draft>('/api/admin/draft', { expectedRevision: draft.revision, config: submitted }, 'PUT');
    setDraft(result); setConfig(current => current === submitted ? result.config : current); setIssues([]); setMessage(`草稿已保存 · 修订 ${result.revision}`); setError(''); return result;
  }
  async function action(kind: 'save' | 'preview' | 'publish') {
    if (busy) return; setBusy(true); setError(''); setIssues([]);
    try {
      const saved = dirty || kind === 'save' ? await save() : draft;
      if (!saved) return;
      if (kind === 'preview') setPreview(await api<Preview>('/api/admin/preview'));
      if (kind === 'publish') {
        const result = await adminRequest<{ versionId: string; publishedAt: string }>('/api/admin/publish', { expectedRevision: saved.revision });
        setMessage(`已发布版本 ${result.versionId} · ${new Date(result.publishedAt).toLocaleString('zh-CN')}`); await loadMedia();
      }
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return; setBusy(true);
    try { await adminRequest('/api/admin/logout', {}); setSession(null); setConfig(null); setDraft(null); setMedia({ items: [], nextCursor: null }); setPreview(null); setMessage('已退出登录。'); setError(''); }
    catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true);
    try { await adminRequest('/api/admin/password', { currentPassword, newPassword }, 'PUT'); setCurrentPassword(''); setNewPassword(''); setSession(null); setMessage('密码已更新，旧会话已清除。请使用新密码登录。'); setError(''); }
    catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  async function upload() {
    const file = uploadRef.current?.files?.[0]; if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) { setError('图片需小于 10 MiB。'); return; }
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file); body.set('purpose', purpose); body.set('neutralConfirmed', String(purpose === 'public_share' && neutralConfirmed));
      const result = await api<MediaRecord>('/api/admin/media', { method: 'POST', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' }, body });
      await loadMedia(); setMessage('图片处理完成。请在下方选择用于头像、照片条或分享图。');
      if (uploadRef.current) uploadRef.current.value = ''; setNeutralConfirmed(false);
      // Keep the new media available even if pagination is active.
      setMedia(previous => previous.items.some(item => item.id === result.id) ? previous : { ...previous, items: [result, ...previous.items] });
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  async function deleteMedia() {
    if (!deleteTarget || busy) return; setBusy(true);
    try { await api(`/api/admin/media/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' } }); await loadMedia(); setMessage('未引用的图片已清理。'); setDeleteTarget(null); deleteDialog.current?.close(); }
    catch (caught) { fail(caught); } finally { setBusy(false); }
  }
  function jumpTo(path: string) {
    const group = path.split('.')[0]; const target: Tab = group === 'site' ? 'content' : group === 'ageGate' ? 'age' : group === 'gallery' ? 'photos' : group === 'meta' ? 'footer' : (['links', 'info', 'footer', 'states'].includes(group ?? '') ? group as Tab : 'content');
    setTab(target); requestAnimationFrame(() => { const element = document.getElementById(fieldId(path)); element?.scrollIntoView({ block: 'center' }); if (element instanceof HTMLElement) element.focus(); });
  }
  function moveLink(id: string, direction: number) {
    edit(value => { const list = [...value.links].sort((a, b) => a.position - b.position); const index = list.findIndex(item => item.id === id); const next = index + direction; if (next < 0 || next >= list.length) return; [list[index], list[next]] = [list[next]!, list[index]!]; list.forEach((item, position) => { item.position = position + 1; }); });
  }
  function changeLinkState(id: SiteConfig['links'][number]['id'], field: 'enabled' | 'visible', checked: boolean) {
    const link = config?.links.find(item => item.id === id);
    if (!link) return;
    if (!checked && link.emphasized && link.enabled && link.visible) { setLinkStateChange({ id, field, label: link.label }); return; }
    edit(value => { const item = value.links.find(candidate => candidate.id === id); if (item) item[field] = checked; });
  }
  function movePhoto(id: string, direction: number) {
    edit(value => { const list = [...value.gallery.photos].sort((a, b) => a.position - b.position); const index = list.findIndex(item => item.id === id); const next = index + direction; if (next < 0 || next >= list.length) return; [list[index], list[next]] = [list[next]!, list[index]!]; list.forEach((item, position) => { item.position = position + 1; }); value.gallery.photos = list; });
  }
  const field = (path: string, label: string, value: string | null, change: (value: string) => void, options: { help?: string; multiline?: boolean; limit?: number; type?: string } = {}) => <Field key={path} path={path} label={label} value={value} change={change} issues={issues} {...options} />;
  const nullable = (value: string) => value || null;
  if (checking) return <main className="login-content"><p role="status">正在检查会话…</p></main>;
  if (!session) return <main className="login-content"><p className="eyebrow">管理后台</p><h1>管理员登录</h1><p className="muted">使用本地初始化时设置的账号与密码。</p>
    <div ref={feedback} tabIndex={-1}>{error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}</div>
    <form onSubmit={event => void login(event)} className="stack">
      <div className="field"><label htmlFor="login-username">账号</label><input id="login-username" name="username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></div>
      <div className="field"><label htmlFor="login-password">密码</label><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
      <Toggle label="显示密码" checked={showPassword} change={setShowPassword} />
      <button type="submit" className="pill primary" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
    </form>
  </main>;
  if (!config || !draft) return <main className="login-content"><p className="feedback error" role="alert">{error || '正在读取草稿…'}</p><button type="button" className="pill secondary" onClick={() => void loadDraft().catch(fail)}>重新加载</button></main>;

  return <main className="admin-layout" aria-busy={busy}>
    <aside className="admin-sidebar"><p className="admin-brand">{config.site.name}</p><p className="caption muted">名称暂定 · 管理员后台</p><nav aria-label="管理分区">{tabs.map(item => <button type="button" className={`pill secondary ${tab === item.id ? 'selected' : ''}`} aria-current={tab === item.id ? 'page' : undefined} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><button type="button" className="text-button" onClick={() => { if (dirty) { setError('请先保存草稿，再退出登录。'); setTab('content'); } else void logout(); }} disabled={busy}>退出登录</button></aside>
    <div className="admin-main"><header className="admin-header"><h1>{tabs.find(item => item.id === tab)?.label}</h1><p className="caption muted">草稿修订 {draft.revision} · {dirty ? '有未保存修改' : `已保存 ${new Date(draft.updatedAt).toLocaleString('zh-CN')}`}。公开页使用上次成功发布版本。</p>
      <div className="draft-actions"><button className="pill secondary" type="button" disabled={busy} onClick={() => void action('save')}>{busy ? '处理中…' : '保存草稿'}</button><button className="pill secondary" type="button" disabled={busy} onClick={() => void action('preview')}>预览草稿</button><button className="pill primary" type="button" disabled={busy} onClick={() => void action('publish')}>检查并发布</button><button type="button" className="text-button" disabled={busy} onClick={() => { if (dirty) setReloadDialog(true); else void loadDraft().catch(fail); }}>重新加载</button></div>
    </header>
    <div ref={feedback} tabIndex={-1} className="admin-feedback">{error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}{message.startsWith('已发布版本') && <> <a href="/" target="_blank" rel="noopener noreferrer">查看公开页面</a></>}</p>}{issues.length > 0 && <div className="feedback error" role="alert"><p>请检查以下字段：</p><ul>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}><button type="button" className="issue-link" onClick={() => jumpTo(issue.path)}>{issue.message}</button></li>)}</ul></div>}</div>
    <div className="editor-sections">
      {tab === 'content' && <Panel title="基础信息" note="成年确认页、主页与预览共享站点名称。">
        {field('site.name', '站点名称', config.site.name, text => edit(value => { value.site.name = text; }), { limit: 24 })}
        {field('site.tagline', '短简介', config.site.tagline, text => edit(value => { value.site.tagline = nullable(text); }), { limit: 90 })}
        {field('site.description', '补充说明', config.site.description, text => edit(value => { value.site.description = nullable(text); }), { multiline: true, limit: 500, help: '选填；留空时公开页隐藏。' })}
      </Panel>}
      {tab === 'age' && <Panel title="成年确认" note="确认前只展示本区文字与中性页面信息；不展示头像、简介、导航或照片。">
        {field('ageGate.title', '成年标题', config.ageGate.title, text => edit(value => { value.ageGate.title = text; }), { limit: 40 })}
        {field('ageGate.notice', '成年提示', config.ageGate.notice, text => edit(value => { value.ageGate.notice = text; }), { multiline: true, limit: 300 })}
        {field('ageGate.confirmLabel', '确认按钮', config.ageGate.confirmLabel, text => edit(value => { value.ageGate.confirmLabel = text; }), { limit: 24, help: '须明确表达本人已年满18岁。' })}
        {field('ageGate.exitLabel', '离开按钮', config.ageGate.exitLabel, text => edit(value => { value.ageGate.exitLabel = text; }), { limit: 24 })}
        {field('ageGate.exitUrl', '离开目标', config.ageGate.exitUrl, text => edit(value => { value.ageGate.exitUrl = nullable(text); }), { type: 'url', help: '填写中性的 HTTPS 外部地址；留空时显示退出提示。' })}
        {field('ageGate.exitNotice', '退出提示', config.ageGate.exitNotice, text => edit(value => { value.ageGate.exitNotice = text; }), { limit: 160 })}
        {field('ageGate.resetLabel', '重新确认入口文案', config.ageGate.resetLabel, text => edit(value => { value.ageGate.resetLabel = text; }), { limit: 24 })}
      </Panel>}
      {tab === 'links' && <><p className="muted">五个入口独立配置。只填写真实目标；空目标保持停用。至多一个入口轻强调。</p>{[...config.links].sort((a, b) => a.position - b.position).map((link, index) => {
        const actual = config.links.findIndex(item => item.id === link.id); const path = `links.${actual}`;
        return <Panel key={link.id} title={`${index + 1}. ${link.label}`}><div className="row spread"><p className="caption muted">{link.id}</p><div className="row"><button type="button" className="text-button" aria-label={`${link.label}上移`} disabled={index === 0} onClick={() => moveLink(link.id, -1)}>上移</button><button type="button" className="text-button" aria-label={`${link.label}下移`} disabled={index === 4} onClick={() => moveLink(link.id, 1)}>下移</button></div></div>
          {field(`${path}.label`, '入口名称', link.label, text => edit(value => { value.links[actual]!.label = text; }), { limit: 24 })}
          {field(`${path}.description`, '入口说明', link.description, text => edit(value => { value.links[actual]!.description = nullable(text); }), { limit: 40 })}
          {field(`${path}.url`, '目标地址', link.url, text => edit(value => { value.links[actual]!.url = nullable(text); }), { type: 'url', help: 'HTTPS 外部链接；会员购买仅配置外部目标。' })}
          <div className="row wrap"><Toggle label="公开显示" checked={link.visible} change={checked => changeLinkState(link.id, 'visible', checked)} /><Toggle label="启用入口" checked={link.enabled} change={checked => changeLinkState(link.id, 'enabled', checked)} /><Toggle label="轻强调" checked={link.emphasized} change={checked => edit(value => { value.links.forEach(item => { item.emphasized = item.id === link.id && checked; }); })} /></div>
        </Panel>;
      })}</>}
      {tab === 'photos' && <>
        <Panel title="上传图片" note="JPEG、PNG 或 WebP；单张不超过10 MiB、2400万像素、最长边6000px。上传后服务端去除EXIF并生成展示图。">
          <div className="field"><label htmlFor="media-file">选择图片</label><input ref={uploadRef} id="media-file" type="file" accept="image/jpeg,image/png,image/webp" /></div>
          <div className="field"><label htmlFor="media-purpose">图片用途</label><select id="media-purpose" value={purpose} onChange={event => { setPurpose(event.target.value as 'controlled' | 'public_share'); setNeutralConfirmed(false); }}><option value="controlled">受控头像或照片</option><option value="public_share">中性公开分享图</option></select></div>
          {purpose === 'public_share' && <Toggle label="我已确认此图片内容中性，可以在成年确认前公开展示。" checked={neutralConfirmed} change={setNeutralConfirmed} />}
          <button className="pill secondary" type="button" disabled={busy || (purpose === 'public_share' && !neutralConfirmed)} onClick={() => void upload()}>{busy ? '处理中…' : '上传并处理'}</button>
        </Panel>
        <Panel title="头像与照片条"><Toggle label="显示照片条" checked={config.gallery.enabled} change={checked => edit(value => { value.gallery.enabled = checked; })} />
          {field('gallery.title', '照片区标题', config.gallery.title, text => edit(value => { value.gallery.title = nullable(text); }), { limit: 40 })}
          {config.site.avatarMediaId ? <div className="row wrap"><MediaImage mediaId={config.site.avatarMediaId} alt="当前草稿头像" admin className="avatar" /><button className="text-button" type="button" onClick={() => edit(value => { value.site.avatarMediaId = null; })}>移除草稿头像</button></div> : <p className="muted">尚未选择头像。在图片列表中选择“用作头像”。</p>}
          {config.gallery.photos.length === 0 && <p className="muted">照片条为空。在图片列表中添加照片，最多12张。</p>}
          {[...config.gallery.photos].sort((a, b) => a.position - b.position).map((photo, index) => {
            const actual = config.gallery.photos.findIndex(item => item.id === photo.id); const path = `gallery.photos.${actual}`;
            return <section className="photo-editor" key={photo.id}><div className="row spread wrap"><MediaImage mediaId={photo.mediaId} alt={photo.alt} focalPoint={photo.focalPoint} admin className="photo-thumb" /><div className="row wrap"><button type="button" className="text-button" disabled={index === 0} onClick={() => movePhoto(photo.id, -1)} aria-label={`照片${index + 1}上移`}>上移</button><button type="button" className="text-button" disabled={index === config.gallery.photos.length - 1} onClick={() => movePhoto(photo.id, 1)} aria-label={`照片${index + 1}下移`}>下移</button><button type="button" className="text-button danger" onClick={() => edit(value => { value.gallery.photos = value.gallery.photos.filter(item => item.id !== photo.id).sort((a, b) => a.position - b.position).map((item, position) => ({ ...item, position: position + 1 })); })}>移除引用</button></div></div>
              <div className="field"><label htmlFor={fieldId(`${path}.mediaId`)}>照片素材</label><select id={fieldId(`${path}.mediaId`)} value={photo.mediaId} onChange={event => edit(value => { value.gallery.photos[actual]!.mediaId = event.target.value; })}>{media.items.filter(item => item.purpose === 'controlled' && item.status === 'ready').map(item => <option key={item.id} value={item.id}>{item.width} × {item.height} · {item.id.slice(0, 8)}</option>)}{!media.items.some(item => item.id === photo.mediaId) && <option value={photo.mediaId}>当前照片</option>}</select></div>
              {field(`${path}.alt`, `照片 ${index + 1} 替代文本`, photo.alt, text => edit(value => { value.gallery.photos[actual]!.alt = text; }), { limit: 160, help: '简要描述款式与场景，帮助使用读屏的访客理解图片。' })}
              {field(`${path}.caption`, '照片说明', photo.caption, text => edit(value => { value.gallery.photos[actual]!.caption = nullable(text); }), { limit: 160 })}
              <Toggle label="公开显示此照片" checked={photo.visible} change={checked => edit(value => { value.gallery.photos[actual]!.visible = checked; })} />
              <div className="two-columns">{(['x', 'y'] as const).map(axis => <div className="field" key={axis}><label htmlFor={fieldId(`${path}.focalPoint.${axis}`)}>裁切焦点 {axis === 'x' ? '水平' : '垂直'} · {Math.round(photo.focalPoint[axis] * 100)}%</label><input type="range" id={fieldId(`${path}.focalPoint.${axis}`)} min="0" max="1" step="0.01" value={photo.focalPoint[axis]} onChange={event => edit(value => { value.gallery.photos[actual]!.focalPoint[axis] = Number(event.target.value); })} /></div>)}</div>
            </section>;
          })}
        </Panel>
        <Panel title="图片列表" note="移除草稿引用后需保存；已发布历史版本使用的图片保留。清理操作只删除无引用素材。">
          <div className="media-grid">{media.items.map(item => <article className="media-card" key={item.id}><MediaImage mediaId={item.id} alt={item.purpose === 'controlled' ? '受控图片预览' : '中性分享图预览'} admin className="library-image" /><p className="caption muted">{item.width} × {item.height} · {(item.bytes / 1024).toFixed(0)} KiB<br />{item.purpose === 'controlled' ? '受控素材' : '中性分享图'} · {item.status === 'ready' ? '已就绪' : '处理中'}<br />草稿{item.references.draft ? '引用中' : '未引用'} · {item.references.publishedVersionCount} 个发布版本</p><div className="stack compact">
            {item.purpose === 'controlled' ? <><button type="button" className="pill secondary" disabled={item.status !== 'ready'} onClick={() => edit(value => { value.site.avatarMediaId = item.id; })}>用作头像</button><button type="button" className="pill secondary" disabled={item.status !== 'ready' || config.gallery.photos.length >= 12 || config.gallery.photos.some(photo => photo.mediaId === item.id)} onClick={() => edit(value => { value.gallery.photos.push({ id: crypto.randomUUID(), mediaId: item.id, alt: '照片', caption: null, position: value.gallery.photos.length + 1, visible: true, focalPoint: { x: 0.5, y: 0.5 } }); })}>添加到照片条</button></> : <button type="button" className="pill secondary" disabled={item.status !== 'ready'} onClick={() => edit(value => { value.meta.shareMediaId = item.id; })}>用作分享图</button>}
            <button type="button" className="text-button danger" disabled={item.references.draft || item.references.publishedVersionCount > 0 || busy} onClick={() => setDeleteTarget(item)}>清理图片</button>
          </div></article>)}</div>
          {media.items.length === 0 && <p className="muted">还没有图片。</p>}{media.nextCursor && <button type="button" className="pill secondary" onClick={() => void loadMedia(media.nextCursor!).catch(fail)}>加载更多图片</button>}
        </Panel>
      </>}
      {tab === 'info' && <>
        <Panel title="补充信息" note="选填；留空时整区隐藏。">
          {field('info.title', '信息标题', config.info.title, text => edit(value => { value.info.title = nullable(text); }), { limit: 60 })}
          {field('info.body', '信息正文', config.info.body, text => edit(value => { value.info.body = nullable(text); }), { multiline: true, limit: 1000 })}
        </Panel>
        <Panel title="常见问答" note="最多10条。不填写未经确认的价格、承诺或运营数据。">{config.info.faq.map((item, index) => <section className="photo-editor" key={item.id}>
          {field(`info.faq.${index}.question`, `问题 ${index + 1}`, item.question, text => edit(value => { value.info.faq[index]!.question = text; }), { limit: 120 })}
          {field(`info.faq.${index}.answer`, '回答', item.answer, text => edit(value => { value.info.faq[index]!.answer = text; }), { multiline: true, limit: 1000 })}
          <button type="button" className="text-button danger" onClick={() => edit(value => { value.info.faq.splice(index, 1); })}>移除此问答</button>
        </section>)}<button type="button" className="pill secondary" disabled={config.info.faq.length >= 10} onClick={() => edit(value => { value.info.faq.push({ id: crypto.randomUUID(), question: '', answer: '' }); })}>添加问答</button></Panel>
      </>}
      {tab === 'footer' && <>
        <Panel title="页脚内容">
          {field('footer.notice', '页脚声明', config.footer.notice, text => edit(value => { value.footer.notice = text; }), { limit: 160 })}
          {field('footer.contactEmail', '联系邮箱', config.footer.contactEmail, text => edit(value => { value.footer.contactEmail = nullable(text); }), { type: 'email', help: '发布前填写真实可用的联系邮箱。' })}
          {field('footer.removalNotice', '内容移除说明', config.footer.removalNotice, text => edit(value => { value.footer.removalNotice = nullable(text); }), { multiline: true, limit: 300 })}
          {field('footer.updateText', '更新信息', config.footer.updateText, text => edit(value => { value.footer.updateText = nullable(text); }), { limit: 100 })}
        </Panel>
        <Panel title="页面与分享信息" note="分享信息在成年确认前可见。分享图需单独上传并确认内容中性。">
          {field('meta.title', '页面标题', config.meta.title, text => edit(value => { value.meta.title = text; }), { limit: 60 })}
          {field('meta.description', '页面描述', config.meta.description, text => edit(value => { value.meta.description = text; }), { limit: 160, multiline: true })}
          <div className="field"><label htmlFor={fieldId('meta.shareMediaId')}>中性分享图</label><select id={fieldId('meta.shareMediaId')} value={config.meta.shareMediaId ?? ''} onChange={event => edit(value => { value.meta.shareMediaId = nullable(event.target.value); })}><option value="">不设置分享图</option>{media.items.filter(item => item.purpose === 'public_share' && item.status === 'ready').map(item => <option value={item.id} key={item.id}>{item.width} × {item.height} · {item.id.slice(0, 8)}</option>)}</select></div>
          {config.meta.shareMediaId && <MediaImage mediaId={config.meta.shareMediaId} alt="当前中性分享图" admin className="share-preview" />}
        </Panel>
      </>}
      {tab === 'states' && <Panel title="状态文案" note="发布后用于主页入口、图片加载与失败、全部入口隐藏时的空态。首次成年确认页使用中性加载提示。">{(['unavailable', 'loading', 'empty', 'error'] as const).map((key, index) => field(`states.${key}`, ['入口未开放', '加载中', '空内容', '加载失败'][index]!, config.states[key], text => edit(value => { value.states[key] = text; }), { limit: [40, 60, 100, 160][index]! }))}</Panel>}
      {tab === 'account' && <>
        <Panel title="当前会话"><p>账号：{session.username}</p><p className="muted">本次会话到期：{new Date(session.expiresAt).toLocaleString('zh-CN')}</p><p className="caption muted">会话固定8小时。改密后所有旧会话失效，需要重新登录。</p></Panel>
        <Panel title="修改密码"><form className="stack" onSubmit={event => void changePassword(event)}><div className="field"><label htmlFor="current-password">当前密码</label><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></div><div className="field"><label htmlFor="new-password">新密码</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={newPassword} onChange={event => setNewPassword(event.target.value)} /><p className="field-help">至少12个字符，建议使用密码管理器生成。</p></div><button type="submit" className="pill primary" disabled={busy}>修改密码并重新登录</button></form></Panel>
      </>}
      {tab === 'stats' && <Panel title="访问统计" note="按UTC日期聚合。数据为请求次数，不代表独立访客、频道加入或成交。最多查询90天。"><form className="row wrap" onSubmit={event => { event.preventDefault(); setBusy(true); void api<Stats>(`/api/admin/stats?from=${encodeURIComponent(statFrom)}&to=${encodeURIComponent(statTo)}`).then(setStatistics).catch(fail).finally(() => setBusy(false)); }}><div className="field"><label htmlFor="stat-from">起始日期</label><input id="stat-from" type="date" required value={statFrom} onChange={event => setStatFrom(event.target.value)} /></div><div className="field"><label htmlFor="stat-to">结束日期</label><input id="stat-to" type="date" required value={statTo} onChange={event => setStatTo(event.target.value)} /></div><button className="pill secondary" type="submit" disabled={busy}>查询统计</button></form>
        {statistics && <><div className="stat-totals">{[['gate_view', '成年页展示'], ['adult_confirm', '成年确认'], ['leave', '离开'], ['link_click', '入口点击']].map(([event, label]) => <div className="stat-total" key={event}><p className="caption muted">{label}</p><strong>{statistics.buckets.filter(item => item.event === event).reduce((sum, item) => sum + item.count, 0)}</strong></div>)}</div>{statistics.buckets.length ? <div className="table-scroll"><table><thead><tr><th>日期</th><th>来源</th><th>事件</th><th>入口</th><th>次数</th></tr></thead><tbody>{statistics.buckets.map((item, index) => <tr key={index}><td>{item.date}</td><td>{{ profile: '个人资料', pin: '置顶', weekly: '每周', other: '其他' }[item.source] ?? item.source}</td><td>{{ gate_view: '成年页展示', adult_confirm: '成年确认', leave: '离开', link_click: '入口点击' }[item.event] ?? item.event}</td><td>{config.links.find(link => link.id === item.linkId)?.label ?? '—'}</td><td>{item.count}</td></tr>)}</tbody></table></div> : <p className="muted">此区间暂无记录。</p>}</>}
      </Panel>}
    </div></div>
    <dialog ref={previewDialog} className="preview-dialog" onClose={() => setPreview(null)}><div className="preview-header"><div><h2>草稿预览</h2><p className="caption muted">修订 {preview?.revision} · 尚未发布 · 入口不执行外跳</p></div><button type="button" className="text-button" onClick={() => { previewDialog.current?.close(); setPreview(null); }}>返回编辑</button></div>{preview && <>{preview.publishIssues.length > 0 && <div className="preview-issues"><p className="caption muted">还有 {preview.publishIssues.length} 项发布前待完善内容：</p><ul>{preview.publishIssues.map((issue, index) => <li key={index}><button type="button" className="issue-link" onClick={() => { previewDialog.current?.close(); setPreview(null); setIssues(preview.publishIssues); jumpTo(issue.path); }}>{issue.message}</button></li>)}</ul></div>}<PublicView data={previewProjection(preview.config, preview.revision)} preview /></>}</dialog>
    <dialog ref={deleteDialog} className="confirm-dialog" onClose={() => setDeleteTarget(null)}><h2>清理这张图片？</h2><p className="muted">仅清理没有草稿或发布版本引用的素材。此操作会删除处理后的图片文件。</p><div className="row wrap"><button type="button" className="pill secondary" autoFocus onClick={() => { deleteDialog.current?.close(); setDeleteTarget(null); }}>保留图片</button><button type="button" className="pill primary" disabled={busy} onClick={() => void deleteMedia()}>确认清理</button></div></dialog>
    <dialog ref={reloadRef} className="confirm-dialog" onClose={() => setReloadDialog(false)}><h2>重新加载最新草稿？</h2><p className="muted">当前未保存输入将被最新草稿替换。可先继续编辑并复制需要保留的文字。</p><div className="row wrap"><button type="button" className="pill secondary" autoFocus onClick={() => { reloadRef.current?.close(); setReloadDialog(false); }}>继续编辑</button><button type="button" className="pill primary" onClick={() => { reloadRef.current?.close(); setReloadDialog(false); void loadDraft().then(() => { setIssues([]); setError(''); setMessage('已重新加载最新草稿。'); }).catch(fail); }}>放弃修改并重新加载</button></div></dialog>
    <dialog ref={linkStateDialog} className="confirm-dialog" onClose={() => setLinkStateChange(null)}><h2>{linkStateChange?.field === 'visible' ? '隐藏主要入口？' : '停用主要入口？'}</h2><p className="muted">“{linkStateChange?.label}”是当前轻强调入口。{linkStateChange?.field === 'visible' ? '隐藏后将从公开页面移除。' : '停用后此入口停止跳转。'}修改保存并发布后生效。</p><div className="row wrap"><button type="button" className="pill secondary" autoFocus onClick={() => { linkStateDialog.current?.close(); setLinkStateChange(null); }}>保留入口</button><button type="button" className="pill primary" onClick={() => { if (linkStateChange) edit(value => { const item = value.links.find(candidate => candidate.id === linkStateChange.id); if (item) item[linkStateChange.field] = false; }); linkStateDialog.current?.close(); setLinkStateChange(null); }}>{linkStateChange?.field === 'visible' ? '确认隐藏' : '确认停用'}</button></div></dialog>
  </main>;
}
