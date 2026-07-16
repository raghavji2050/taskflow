import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { postInboundMessage } from "@/lib/inbound-webhook";

type RouteContext = { params: Promise<{ token: string }> };

const inboundBodySchema = z
  .object({
    body: z.string().max(4000).optional(),
    /** Optional label shown as `[senderName] message` and in push title. */
    senderName: z.string().min(1).max(80).optional().nullable(),
    // Aliases some apps prefer
    text: z.string().max(4000).optional(),
    message: z.string().max(4000).optional(),
  })
  .refine((d) => Boolean((d.body ?? d.text ?? d.message)?.trim()), {
    message: "body is required",
  });

/**
 * Public inbound webhook — no session required.
 * POST /api/inbound/{token}
 * Body: { "body": "Hello", "senderName": "My App" }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Invalid webhook" }, { status: 404 });
    }

    const json = await request.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return NextResponse.json(
        { error: "JSON body required. Example: { \"body\": \"Hello from my app\" }" },
        { status: 400 }
      );
    }

    const parsed = inboundBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data.body || parsed.data.text || parsed.data.message;
    if (!body) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const result = await postInboundMessage({
      token,
      body,
      senderName: parsed.data.senderName,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      { ok: true, messageId: result.message.id, createdAt: result.message.createdAt },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** Health / discovery — confirms the token exists without posting. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const { prisma } = await import("@/lib/prisma");
    const conversation = await prisma.conversation.findUnique({
      where: { inboundToken: token },
      select: { id: true, type: true, name: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Invalid or disabled webhook" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      conversationType: conversation.type,
      usage: {
        method: "POST",
        contentType: "application/json",
        body: { body: "Your message text", senderName: "Optional app name" },
      },
      note: "senderName appears as the message author, not inside the message text.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
