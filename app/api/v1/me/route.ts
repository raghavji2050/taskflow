import { ok, preflight, v1 } from "@/lib/public-api";

export const OPTIONS = preflight;
export const GET = v1(async (user) => ok({ user: { id: user.id, name: user.name, email: user.email } }));
