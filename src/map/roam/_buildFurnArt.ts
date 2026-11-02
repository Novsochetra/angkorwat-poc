import type { FurnitureId } from '../build/furniture';

/**
 * The build card's little pictures of the furniture and lanterns (AWP-23,
 * build/furniture.ts): 12 × 12 pixel art as the yard pieces' (_buildCard.ts
 * `PIC`), a floor board under each in place of the grass.
 */
const FLOOR = '<path fill="#8a6f55" d="M0 11h12v1H0z"/>';

export const FURN_PIC: Record<FurnitureId, string> = {
  teamat: `${FLOOR}<path fill="#b8423a" d="M1 9h10v2H1z"/><path fill="#3a7a5a" d="M3 9h1v2H3zM8 9h1v2H8z"/><path fill="#5a4a3a" d="M5 6h2v3H5z"/><path fill="#7a6a5a" d="M4 7h1v1H4zM7 6h1v1H7z"/><path fill="#e8e0d0" d="M2 8h1v1H2zM9 8h1v1H9z"/>`,
  bedmat: `${FLOOR}<path fill="#d8c08a" d="M0 9h12v2H0z"/><path fill="#b83a2e" d="M0 10h12v1H0z"/><path fill="#2f7a4a" d="M0 9h12v1H0z" opacity="0.5"/><path fill="#f2ece0" d="M1 7h3v2H1z"/><path fill="#c8d8e8" d="M1 7h3v1H1z"/><path fill="#b8322c" d="M9 8h2v1H9z"/><path fill="#f0ece0" d="M9 7h2v1H9z"/>`,
  bench: `${FLOOR}<path fill="#c8b27a" d="M1 6h10v1H1z"/><path fill="#5a4636" d="M2 7h1v4H2zM9 7h1v4H9z"/><path fill="#9a8458" d="M2 9h8v1H2z"/><path fill="#8a5a38" d="M8 3h2v3H8z"/><path fill="#7a4e30" d="M8 2h1v1H8z"/><path fill="#d8d0c0" d="M5 5h1v1H5zM6 5h1v1H6z"/>`,
  loom: `${FLOOR}<path fill="#6a4a30" d="M1 2h1v9H1zM10 2h1v9h-1zM1 2h10v1H1z"/><path fill="#9a2a5a" d="M2 4h8v3H2z"/><path fill="#b8322c" d="M2 5h8v1H2z"/><path fill="#d8a030" d="M2 7h8v1H2z"/><path fill="#7a5a3a" d="M3 9h6v1H3z"/>`,
  baskets: `${FLOOR}<path fill="#d2b67e" d="M0 6h6v5H0z"/><path fill="#a88f60" d="M0 6h6v1H0z"/><path fill="#f2eee2" d="M1 4h4v2H1z"/><path fill="#c8aa70" d="M7 7h5v4H7z"/><path fill="#c08a42" d="M7 6h5v1H7z"/><path fill="#a46e30" d="M8 6h1v1H8zM10 6h1v1h-1z"/>`,
  pot: `${FLOOR}<path fill="#b8633a" d="M4 7h4v4H4z"/><path fill="#a9582f" d="M4 7h4v1H4z"/><path fill="#4a8a34" d="M2 2h8v5H2z"/><path fill="#356a28" d="M3 3h2v2H3zM7 4h2v2H7z"/><path fill="#e0508a" d="M7 1h2v2H7z"/>`,
  mortar: `${FLOOR}<path fill="#6a4a32" d="M2 6h6v5H2z"/><path fill="#3a2a1e" d="M3 6h4v1H3z"/><path fill="#8a6a48" d="M8 0h1v10H8z"/>`,
  oillamp: `${FLOOR}<path fill="#4a3a2a" d="M3 9h6v2H3zM4 3h4v1H4z"/><path fill="#d8e0dc" d="M4 4h4v5H4z"/><path fill="#ffd27a" d="M5 5h2v3H5z"/><path fill="#fff0b0" d="M5 6h2v1H5z"/>`,
  hanglamp: '<path fill="#2e2a28" d="M5 0h2v3H5z"/><path fill="#3e3830" d="M3 3h6v1H3zM3 9h6v1H3z"/><path fill="#2e2a28" d="M3 4h1v5H3zM8 4h1v5H8z"/><path fill="#ffd27a" d="M4 4h4v5H4z"/><path fill="#fff0b0" d="M5 5h2v2H5z"/>',
};
