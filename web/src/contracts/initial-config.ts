import { LINK_IDS, parseSiteConfig, type SiteConfig } from './site-config.ts';

type DesignCopy = {
  values: Record<string, string | null>;
  links: { id: string; label: string; url: string | null; order: number; visible: boolean; enabled: boolean; emphasized: boolean }[];
  photos: { role: string; path: string; alt: string; order?: number; caption?: string | null }[];
};

/** Copy is imported once into the seed; runtime edits belong to database drafts. */
export function initialConfigFromDesign(copy: DesignCopy): SiteConfig {
  const v = copy.values;
  const required = (key: string): string => {
    const value = v[key];
    if (typeof value !== 'string') throw new Error(`Missing design copy: ${key}`);
    return value;
  };
  const optional = (key: string): string | null => {
    if (!(key in v)) throw new Error(`Missing design field: ${key}`);
    return v[key] ?? null;
  };
  return parseSiteConfig({
    schemaVersion: 1, theme: 'ink-champagne',
    site: { name: required('SITE_NAME'), tagline: optional('SITE_TAGLINE'), description: optional('SITE_DESCRIPTION'), avatarMediaId: null },
    ageGate: {
      title: required('AGE_TITLE'), notice: required('AGE_NOTICE'), confirmLabel: required('AGE_CONFIRM_LABEL'),
      exitLabel: required('AGE_EXIT_LABEL'), exitUrl: optional('EXIT_URL'), exitNotice: required('EXIT_NOTICE'), resetLabel: required('RESET_AGE_LABEL'),
    },
    links: LINK_IDS.map(id => {
      const entry = copy.links.find(link => link.id === id);
      if (!entry) throw new Error(`Missing design link: ${id}`);
      return { id, label: entry.label, description: null, url: entry.url, position: entry.order,
        visible: entry.visible, enabled: entry.enabled, emphasized: entry.emphasized };
    }),
    gallery: { enabled: false, title: optional('GALLERY_TITLE'), photos: [] },
    info: { title: optional('INFO_TITLE'), body: optional('INFO_BODY'), faq: [] },
    footer: { notice: required('FOOTER_NOTICE'), contactEmail: optional('CONTACT_EMAIL'), removalNotice: optional('REMOVAL_NOTICE'), updateText: optional('UPDATE_TEXT') },
    meta: { title: required('META_TITLE'), description: required('META_DESCRIPTION'), shareMediaId: null },
    states: { unavailable: required('LINK_UNAVAILABLE_TEXT'), loading: required('LOADING_TEXT'), empty: required('EMPTY_TEXT'), error: required('ERROR_TEXT') },
  });
}

export function mediaImportManifest(copy: DesignCopy) {
  return { stage: 'M3 protected-media import pending', automaticallyPublished: false,
    items: copy.photos.map((photo, i) => ({ source: photo.path, role: photo.role, position: photo.order ?? 1,
      suggestedId: `initial-photo-${i + 1}`, alt: photo.alt, caption: photo.caption ?? null,
      focalPoint: { x: 0.5, y: 0.5 }, status: 'pending-import' })),
  };
}
