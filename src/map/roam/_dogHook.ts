/**
 * What the explorer menu (_explorerMenu.ts) asks of the dog, filled in by the
 * dog's add-on (_dog.ts) when it starts: the menu does not load the dog's
 * module. "Call the dog" (on the menu's Moves page) goes in as its key (0),
 * so it needs no hook; the orders beside it (Follow me, Stay here, Go home)
 * and its name (on the Me page) do.
 */
export const DOG_MENU = {
  /** He has a dog (its buttons show: Call the dog and the three orders on Moves, its name on Me). */
  adopted: (): boolean => false,
  /** The card for its name. */
  rename: (): void => {},
  /** What it was told last (its button is lit). */
  order: (): DogOrder => 'follow',
  /** Tell it (done on the next roaming step, as a key is). */
  tell: (_o: DogOrder): void => {},
};

/** What he told his dog: follow him (as it does once it is his), stay where it is, go home (to its bed). */
export type DogOrder = 'follow' | 'stay' | 'home';
export const DOG_ORDERS: readonly DogOrder[] = ['follow', 'stay', 'home'];

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

/**
 * The orders in pixels (the menu's Moves page, the order card): Follow me (it trots after a gold arrow), Stay here
 * (sitting on a gold spot), Go home (its head under his stilt house).
 */
export const DOG_ORDER_ICONS: Record<DogOrder, string> = {
  follow: `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#c49a62" d="M8 3h4v3H8zM2 6h8v3H2zM2 9h1v3H2zM4 9h1v2H4zM7 9h1v2H7zM9 9h1v3H9zM1 4h1v2H1zM2 3h1v1H2z"/>
  <path fill="#9a7446" d="M8 2h1v1H8zM10 2h1v1h-1zM3 6h5v1H3z"/>
  <path fill="#ead6ae" d="M12 4h1v2h-1zM4 8h3v1H4zM2 11h1v1H2zM9 11h1v1H9z"/>
  <path fill="#2b211c" d="M13 4h1v1h-1zM10 4h1v1h-1z"/>
  <path fill="#ffe07c" d="M11 12h3v1h-3zM13 11h1v1h-1zM13 13h1v1h-1zM14 12h1v1h-1z"/>
</svg>`,
  stay: `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#c49a62" d="M9 1h1v2H9zM12 1h1v2h-1zM9 3h5v4H9zM8 7h4v3H8zM4 9h5v3H4zM2 11h5v3H2zM10 10h2v4h-2zM1 6h1v3H1zM2 5h2v1H2zM3 8h1v1H3z"/>
  <path fill="#9a7446" d="M4 9h4v1H4zM2 11h2v1H2zM9 1h1v1H9zM12 1h1v1h-1z"/>
  <path fill="#ead6ae" d="M13 5h2v2h-2zM10 8h2v2h-2zM10 13h3v1h-3zM6 13h3v1H6zM2 9h1v1H2z"/>
  <path fill="#2b211c" d="M15 5h1v1h-1zM12 4h1v1h-1z"/>
  <path fill="#ffe07c" d="M2 15h12v1H2zM1 14h1v1H1zM14 14h1v1h-1z"/>
</svg>`,
  home: `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#e58a5a" d="M7 1h2v1H7zM6 2h4v1H6zM5 3h6v1H5zM4 4h8v1H4z"/>
  <path fill="#b4532f" d="M2 5h12v1H2z"/>
  <path fill="#8a6038" d="M4 6h8v3H4z"/>
  <path fill="#ffd76a" d="M5 7h1v1H5zM10 7h1v1h-1z"/>
  <path fill="#4a2e1c" d="M7 7h2v2H7zM4 9h1v6H4zM11 9h1v6h-1z"/>
  <path fill="#c49a62" d="M5 11h6v4H5zM5 10h1v1H5zM10 10h1v1h-1z"/>
  <path fill="#ead6ae" d="M7 13h2v2H7z"/>
  <path fill="#2b211c" d="M6 12h1v1H6zM9 12h1v1H9zM7 13h2v1H7z"/>
</svg>`,
};
