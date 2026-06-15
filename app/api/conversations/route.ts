import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { createConversationSchema } from "@/lib/validations";
import {
  createDirectConversation,
  createGroupConversation,
  ensurePersonalConversation,
  ensureWorkspaceChannel,
  listUserConversations,
} from "@/lib/conversations";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    await Promise.all(
      memberships.map(async (m) => {
        try {
          await ensureWorkspaceChannel(m.workspaceId, user.id);
        } catch (error) {
          console.error(`Failed to sync workspace channel ${m.workspaceId}:`, error);
        }
      })
    );

    try {
      await ensurePersonalConversation(user.id);
    } catch (error) {
      console.error("Failed to ensure personal chat:", error);
    }

    const result = await listUserConversations(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = createConversationSchema.parse(await request.json());

    if (data.type === "DIRECT") {
      const conversation = await createDirectConversation(user.id, data.userId);
      return NextResponse.json(
        {
          conversation: {
            id: conversation.id,
            type: conversation.type,
            participants: conversation.participants.map((p) => p.user),
          },
        },
        { status: 201 }
      );
    }

    const conversation = await createGroupConversation(
      user.id,
      data.memberIds,
      data.name
    );
    return NextResponse.json(
      {
        conversation: {
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          participants: conversation.participants.map((p) => p.user),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
