/**
 * Security headers applied to every route via next.config.ts.
 *
 * The CSP keeps 'unsafe-inline' for scripts because Next.js injects inline
 * bootstrap scripts on statically rendered pages (no per-request nonce), and
 * for styles because Tailwind/React set inline styles. It still blocks
 * plugins, <base> hijacking, framing by other sites, and limits where the
 * page can connect, load scripts and embed frames.
 */

type Header = { key: string; value: string };

export function buildContentSecurityPolicy({ dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      // Vercel Analytics debug script (prod uses same-origin /_vercel/insights).
      "https://va.vercel-scripts.com",
      // Firebase compat scripts imported by the FCM service worker.
      "https://www.gstatic.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    // Avatars, link-preview images, GIFs, emoji sprites and Blob attachments.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https://*.blob.vercel-storage.com"],
    "frame-src": ["'self'", "blob:", "https://*.blob.vercel-storage.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "connect-src": [
      "'self'",
      // Pusher realtime (websocket, sockjs fallback, stats).
      "https://*.pusher.com",
      "wss://*.pusher.com",
      // Firebase Cloud Messaging / installations.
      "https://*.googleapis.com",
      // Sentry error reporting.
      "https://*.sentry.io",
      // Vercel Blob client uploads.
      "https://vercel.com",
      "https://*.blob.vercel-storage.com",
      // Vercel Analytics / Speed Insights.
      "https://vitals.vercel-insights.com",
      "https://va.vercel-scripts.com",
      ...(dev ? ["ws:", "wss:"] : []),
    ],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function buildSecurityHeaders({ dev = false }: { dev?: boolean } = {}): Header[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy({ dev }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

/**
 * Attachment previews (PDF iframes) load same-origin files from the blob proxy
 * and local uploads, so those paths may be framed by the app itself only.
 */
export function buildSameOriginFrameHeaders({ dev = false }: { dev?: boolean } = {}): Header[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy({ dev }).replace(
        "frame-ancestors 'none'",
        "frame-ancestors 'self'"
      ),
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ];
}
