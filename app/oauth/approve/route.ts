import { auth } from "@/lib/auth";
import { getOrigin, issueCode, validateAuthorize } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // CSRF: the consent form must be submitted from our own origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== getOrigin(request)) return new Response("Bad origin", { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return new Response("Not signed in", { status: 401 });

  const form = await request.formData();
  const q = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === "string") q.set(k, v);
  const result = await validateAuthorize(q);
  if (!result.ok) {
    if (result.redirect) return Response.redirect(result.redirect, 303);
    return new Response(result.error, { status: 400 });
  }
  if (q.get("decision") !== "allow") {
    const u = new URL(result.params.redirectUri);
    u.searchParams.set("error", "access_denied");
    if (result.params.state) u.searchParams.set("state", result.params.state);
    return Response.redirect(u.toString(), 303);
  }
  return Response.redirect(await issueCode(session.user.id, result.params), 303);
}
