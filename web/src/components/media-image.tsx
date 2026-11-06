'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Protected media loader. Public reads are authorised by the current version
 * cookie or a memory token; admin reads use the admin media endpoint.
 */
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
