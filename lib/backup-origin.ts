/** Absolute origin for URLs we hand to machines (local-upload fallback only). */
export function getAppOrigin(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (process.env.VERCEL === "1" && env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}
