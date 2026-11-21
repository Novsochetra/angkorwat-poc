import type { PostHog } from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(key && host);

type PostHogProperties = Record<string, string | number | boolean>;

// posthog-js (≈ 280 KB) is not part of the page's first download: it loads once the page has loaded and the
// browser is idle, so the map starts sooner. Events sent before that wait in a queue and go when it is ready.
let ready: PostHog | null = null;
const waiting: ((ph: PostHog) => void)[] = [];

function whenReady(call: (ph: PostHog) => void): void {
  if (!isPostHogConfigured) return;
  if (ready) call(ready);
  else waiting.push(call);
}

async function load(): Promise<void> {
  const { default: ph } = await import('posthog-js');
  ph.init(key!, {
    api_host: host,
    logs: {
      serviceName: 'angkorwat-poc-web',
      environment: import.meta.env.MODE,
    },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
  ready = ph;
  for (const call of waiting.splice(0)) call(ph);
}

if (isPostHogConfigured) {
  const start = (): void => {
    const idle = (cb: () => void): void => {
      if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 4000 });
      else setTimeout(cb, 1000);
    };
    idle(() => void load().catch((e) => console.warn('[posthog] did not load', e)));
  };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
} else if (import.meta.env.DEV) {
  // A warning, not a throw: a throw here stopped every page from starting on a machine without `.env`
  // (a cloud machine's headless shots never reached `__ready`).
  const missingVariable = key ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_KEY';
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export const posthogLogger = {
  info(message: string, attributes: PostHogProperties): void {
    whenReady((ph) => ph.logger.info(message, attributes));
  },
};

/** The events the game sends (posthog-js itself loads later: see above). */
const posthog = {
  capture(event: string, properties?: PostHogProperties): void {
    whenReady((ph) => ph.capture(event, properties));
  },
};

export default posthog;
