import { NextResponse } from "next/server";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export async function GET(request: Request) {
  try {
    const urlParam = new URL(request.url).searchParams.get("url")?.trim();
    if (!urlParam) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(urlParam);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
    if (BLOCKED_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: "Blocked host" }, { status: 400 });
    }

    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "TaskFlowBot/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Could not fetch" }, { status: 502 });
    }

    const html = await res.text();
    const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const description = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];

    return NextResponse.json({
      url: parsed.toString(),
      title: title ?? parsed.hostname,
      description: description ?? null,
      image: image ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
