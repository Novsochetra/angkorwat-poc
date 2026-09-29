/**
 * What the free camera (freecam.ts) saves and the wallpaper script
 * (scripts/wallpaper.mjs) draws: views (`wallpapers/views.json`, one picture
 * each) and flights (`wallpapers/paths/<name>.json`, one video each). The dev
 * server keeps them (wallpaperPlugin.ts). Dev server only: the built site has
 * none of this.
 */

/** Folder of the saved views, flights and pictures (in the project). */
export const WALLPAPER_DIR = 'wallpapers';
/** The dev server's address for them (wallpaperPlugin.ts). */
export const WALLPAPER_ENDPOINT = '/__wallpaper';

/** A name that is safe as a file name. */
export const safeName = (v: string): string =>
  v
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** How a video is made: HEVC (small: for a wallpaper) or H.264 (plays everywhere). */
export type VideoCodec = 'hevc' | 'h264';

/** A view: where the free camera stands, how the picture is cut, and the moment. */
export interface WallpaperView {
  /** Its picture is `wallpapers/out/<name>.png`. */
  name: string;
  /** The `cam=` values: the camera's position and what it looks at (m), then the picture's vertical field of view (degrees). */
  cam: number[];
  /** The picture's size (pixels). */
  w: number;
  h: number;
  /** The shape's name in the panel. */
  shape: string;
  /** The moment as URL values (the scene's `t`, the time of day, the moon, the season, the weather; with the explorer: his spot too). */
  query: string;
  /** The explorer is left out of the picture (`explorer=0`). */
  noExplorer: boolean;
  /**
   * The frame's height on the screen when it was saved, in the pixels the map drew: the picture's glow and fireflies
   * are drawn that big for it (`pxscale=` = the picture's height over this; none: a screen 1800 pixels high).
   */
  screenH?: number;
  /** When it was saved (ISO). */
  saved: string;
}

/** A flight: the free camera along a path, drawn frame by frame into a video. */
export interface WallpaperFlight {
  /** Its video is `wallpapers/out/<name>.mp4`. */
  name: string;
  w: number;
  h: number;
  fps: number;
  /** The scene's time stood still while it was flown. */
  frozen: boolean;
  /** The scene's time at the first frame (s). */
  t0: number;
  /** The moment's URL values, without `t` and `clock` (the frames have their own clock). */
  query: string;
  noExplorer: boolean;
  /** As a view's (`WallpaperView.screenH`). */
  screenH?: number;
  /** One row a frame: x, y, z, tx, ty, tz, field of view, and the day's clock (0‥1). */
  samples: number[][];
  /**
   * A loop: the path comes round to where it began (the frame after the last is the first), and the video is
   * made to repeat with no jump: the world moves on while the camera comes round, so the seam is a cross-fade of
   * the same view at two times (scripts/wallpaper.mjs).
   */
  loop?: boolean;
  /** What made it: a loop preset's name; none when it was flown. */
  kind?: string;
  saved: string;
}

/** What `GET /__wallpaper/list` answers. */
export interface WallpaperList {
  views: WallpaperView[];
  flights: { name: string; w: number; h: number; fps: number; seconds: number; loop: boolean; saved: string }[];
  /** Pictures and videos drawn so far: name → file under `wallpapers/`. */
  out: Record<string, string>;
  /** When each was drawn (ms): its thumbnail's address changes with it. */
  drawn: Record<string, number>;
}

/** A render job (`POST /__wallpaper/render`, `GET /__wallpaper/job?id=`). */
export interface WallpaperJob {
  id: string;
  names: string[];
  status: 'running' | 'done' | 'failed';
  /** The script's last lines. */
  log: string[];
  /** The one being drawn now, and how far it is (frames of a flight). */
  now: { name: string; done: number; total: number } | null;
  /** Files drawn so far, under `wallpapers/`. */
  files: { name: string; file: string }[];
  /** Why it failed. */
  error?: string;
}
