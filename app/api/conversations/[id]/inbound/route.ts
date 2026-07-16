import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  disableConversationInbound,
  enableConversationInbound,
  getConversationInboundStatus,
  rotateConversationInbound,
} from "@/lib/inbound-webhook";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const status = await getConversationInboundStatus(id, user.id);
    if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(status);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Enable (or return existing) inbound webhook for this conversation. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { rotate?: boolean };

    try {
      const status = body.rotate
        ? await rotateConversationInbound(id, user.id)
        : await enableConversationInbound(id, user.id);
      return NextResponse.json(status);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      if (msg === "Not found") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

/** Disable the inbound webhook (token invalidated). */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    try {
      const status = await disableConversationInbound(id, user.id);
      return NextResponse.json(status);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed";
      if (msg === "Not found") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
