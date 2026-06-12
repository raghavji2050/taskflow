export type OAuthProviderId = "google" | "github";

export function getGoogleOAuthConfig() {
  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  return { clientId, clientSecret, enabled: !!(clientId && clientSecret) };
}

export function getGitHubOAuthConfig() {
  const clientId = process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_CLIENT_SECRET;
  return { clientId, clientSecret, enabled: !!(clientId && clientSecret) };
}

export function getEnabledOAuthProviders(): OAuthProviderId[] {
  const providers: OAuthProviderId[] = [];
  if (getGoogleOAuthConfig().enabled) providers.push("google");
  if (getGitHubOAuthConfig().enabled) providers.push("github");
  return providers;
}
