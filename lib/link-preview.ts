import { extractUrls } from "@/lib/urls";

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
}

type JsonNode = {
  type?: string;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
};

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const DIRECT_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".pdf",
  ".zip",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
]);

const MAX_HTML_BYTES = 512 * 1024;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80")) return true;
  return false;
}

export function isBlockedPreviewHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith(".localhost")) return true;
  if (isPrivateIpv4(lower)) return true;
  if (lower.includes(":") && isPrivateIpv6(lower)) return true;
  return false;
}

export function parsePreviewUrl(urlParam: string): URL | null {
  const trimmed = urlParam.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (isBlockedPreviewHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizePreviewUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function walkLinkMarks(node: JsonNode, urls: Set<string>) {
  if (node.type === "text" && node.marks?.length) {
    for (const mark of node.marks) {
      if (mark.type === "link") {
        const href = String(mark.attrs?.href ?? "").trim();
        if (href) urls.add(href);
      }
    }
  }
  for (const child of node.content ?? []) {
    walkLinkMarks(child, urls);
  }
}

export function extractUrlsFromMessage(body: string, bodyJson?: unknown | null): string[] {
  const urls = new Set<string>();
  for (const url of extractUrls(body)) {
    urls.add(url);
  }
  if (bodyJson && typeof bodyJson === "object" && bodyJson !== null) {
    walkLinkMarks(bodyJson as JsonNode, urls);
  }
  return [...urls];
}

export function shouldUnfurlUrl(
  url: string,
  ctx?: { attachmentUrls?: string[] }
): boolean {
  const parsed = parsePreviewUrl(url);
  if (!parsed) return false;

  const normalized = normalizePreviewUrl(parsed.toString());
  const pathLower = parsed.pathname.toLowerCase();
  const ext = pathLower.includes(".") ? pathLower.slice(pathLower.lastIndexOf(".")) : "";
  if (ext && DIRECT_FILE_EXTENSIONS.has(ext)) return false;

  if (ctx?.attachmentUrls?.some((a) => normalizePreviewUrl(a) === normalized)) {
    return false;
  }

  return true;
}

export function pickPreviewUrl(
  urls: string[],
  ctx?: { attachmentUrls?: string[] }
): string | null {
  for (const url of urls) {
    if (shouldUnfurlUrl(url, ctx)) {
      return normalizePreviewUrl(url);
    }
  }
  return null;
}

export function pickPreviewUrlFromMessage(
  body: string,
  bodyJson?: unknown | null,
  ctx?: { attachmentUrls?: string[] }
): string | null {
  return pickPreviewUrl(extractUrlsFromMessage(body, bodyJson), ctx);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseOgFromHtml(html: string, fallbackHostname: string): LinkPreviewData {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ??
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  const image =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

  return {
    url: "",
    title: decodeHtmlEntities(title ?? fallbackHostname),
    description: description ? decodeHtmlEntities(description) : null,
    image: image ? decodeHtmlEntities(image) : null,
  };
}

async function readHtmlCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, MAX_HTML_BYTES);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = MAX_HTML_BYTES - total;
    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      total += remaining;
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  await reader.cancel().catch(() => undefined);

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function fetchLinkPreview(urlParam: string): Promise<LinkPreviewData> {
  const parsed = parsePreviewUrl(urlParam);
  if (!parsed) {
    throw new Error("Invalid URL");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "TaskFlowBot/1.0" },
    signal: AbortSignal.timeout(5000),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error("Could not fetch");
  }

  const html = await readHtmlCapped(res);
  const meta = parseOgFromHtml(html, parsed.hostname);

  return {
    url: parsed.toString(),
    title: meta.title,
    description: meta.description,
    image: meta.image,
  };
}
