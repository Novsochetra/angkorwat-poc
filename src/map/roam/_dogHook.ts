/**
 * What the explorer menu (_explorerMenu.ts) asks of the dog, filled in by the
 * dog's add-on (_dog.ts) when it starts: the menu does not load the dog's
 * module. "Call the dog" goes in as its key (0), so it needs no hook.
 */
export const DOG_MENU = {
  /** He has a dog (its two buttons show). */
  adopted: (): boolean => false,
  /** The card for its name. */
  rename: (): void => {},
};

/** The dog sitting, in pixels, for a menu button (tan, a cream muzzle and chest, pricked ears, the tail curled up). */
export const DOG_MENU_ICON = `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#c49a62" d="M9 1h1v2H9zM12 1h1v2h-1zM9 3h5v4H9zM8 7h4v3H8zM4 9h5v3H4zM2 11h5v3H2zM10 10h2v4h-2zM1 6h1v3H1zM2 5h2v1H2zM3 8h1v1H3z"/>
  <path fill="#9a7446" d="M4 9h4v1H4zM2 11h2v1H2zM9 1h1v1H9zM12 1h1v1h-1z"/>
  <path fill="#ead6ae" d="M13 5h2v2h-2zM10 8h2v2h-2zM10 13h3v1h-3zM6 13h3v1H6zM2 9h1v1H2z"/>
  <path fill="#2b211c" d="M15 5h1v1h-1zM12 4h1v1h-1z"/>
</svg>`;

/** Its name: the dog's head and a gold tag on its collar. */
export const DOG_NAME_ICON = `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#c49a62" d="M3 1h2v2H3zM9 1h2v2H9zM3 3h8v6H3zM4 9h6v1H4z"/>
  <path fill="#9a7446" d="M3 1h1v1H3zM10 1h1v1h-1z"/>
  <path fill="#ead6ae" d="M5 7h4v2H5z"/>
  <path fill="#2b211c" d="M5 5h1v1H5zM8 5h1v1H8zM6 7h2v1H6z"/>
  <path fill="#c8453a" d="M3 10h8v1H3z"/>
  <path fill="#ffe07c" d="M6 11h2v1H6zM5 12h4v3H5z"/><path fill="#b07d1c" d="M6 13h2v1H6z"/>
</svg>`;
