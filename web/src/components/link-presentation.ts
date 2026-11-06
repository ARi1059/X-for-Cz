export type LinkPresentationInput = {
  id: string;
  available: boolean;
  emphasized: boolean;
};

/**
 * One accent per page. Prefer the editor's emphasized available entry; if none
 * is available, fall back to the first available entry. A fully closed site has
 * no primary row.
 */
export function resolvePrimaryLinkId(links: readonly LinkPresentationInput[]): string | null {
  const available = links.filter(link => link.available);
  return (available.find(link => link.emphasized) ?? available[0])?.id ?? null;
}
