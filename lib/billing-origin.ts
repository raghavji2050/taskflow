/** Absolute app origin for Stripe return URLs (prefers the configured public URL). */
export function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(request.url).origin;
}
