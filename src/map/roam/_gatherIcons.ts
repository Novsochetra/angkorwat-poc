import type { MaterialId } from '../build/materials';

/**
 * The building materials' little pictures (build/materials.ts), 12 × 12 pixel
 * art in the map's look (as the build card's, roam/_buildCard.ts): a bamboo
 * pole with its nodes and a leaf, a log with its ring end, a folded panel of
 * sugar-palm leaf thatch, a lump of clay in a basket. Used by the gathering's
 * load chip and bag (roam/_gatherHud.ts) and the build card's costs.
 */
const ART: Record<MaterialId, string> = {
  bamboo:
    '<path fill="#6a7a30" d="M8 0h2v1H8zM7 1h2v1H7z"/><path fill="#9ab048" d="M9 1h2v1H9zM10 2h1v1h-1z"/>' +
    '<path fill="#b8b060" d="M5 1h2v11H5z"/><path fill="#d8d088" d="M5 1h1v11H5z"/><path fill="#7a7a38" d="M4 4h4v1H4zM4 8h4v1H4z"/><path fill="#8a8a40" d="M7 2h1v10H7z"/>',
  log:
    '<path fill="#8a6038" d="M3 3h8v6H3z"/><path fill="#a8784a" d="M3 4h8v1H3z"/><path fill="#6a4a2a" d="M3 8h8v1H3z"/>' +
    '<path fill="#6a4a2a" d="M1 3h3v1H1zM0 4h1v4H0zM1 8h3v1H1zM4 4h1v4H4z"/><path fill="#e0c088" d="M1 4h3v4H1z"/><path fill="#b8905a" d="M2 5h1v2H2z"/>',
  thatch:
    '<path fill="#8a7030" d="M1 2h10v1H1z"/><path fill="#c8a850" d="M1 3h10v7H1z"/><path fill="#a88a3a" d="M2 4h1v6H2zM5 4h1v6H5zM8 4h1v6H8z"/>' +
    '<path fill="#e0c870" d="M3 3h1v6H3zM6 3h1v6H6zM9 3h1v6H9z"/><path fill="#7a6028" d="M1 10h10v1H1z"/>',
  clay:
    '<path fill="#6a4a2a" d="M1 6h10v1H1z"/><path fill="#b08a5a" d="M2 7h8v4H2z"/><path fill="#8a6a40" d="M3 8h1v3H3zM6 8h1v3H6zM8 8h1v3H8z"/>' +
    '<path fill="#9a6a48" d="M3 3h6v3H3zM4 2h4v1H4z"/><path fill="#b8805a" d="M4 3h2v2H4z"/><path fill="#7a5038" d="M8 4h1v2H8z"/>',
};

/** A material's picture as an inline SVG (`cls` sizes it). */
export const materialIcon = (m: MaterialId, cls: string): string =>
  `<svg class="${cls}" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">${ART[m]}</svg>`;
