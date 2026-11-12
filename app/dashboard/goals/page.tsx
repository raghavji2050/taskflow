import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GoalsClient } from "@/components/goals/GoalsClient";

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <GoalsClient />;
}
