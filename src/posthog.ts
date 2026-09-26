import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(key && host);

if (isPostHogConfigured) {
  posthog.init(key!, {
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
} else if (import.meta.env.DEV) {
  const missingVariable = key ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_KEY';
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

type PostHogLogAttributes = Record<string, string | number | boolean>;

export const posthogLogger = {
  info(message: string, attributes: PostHogLogAttributes): void {
    if (isPostHogConfigured) posthog.logger.info(message, attributes);
  },
};

export default posthog;
