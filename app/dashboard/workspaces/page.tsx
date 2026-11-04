import { redirect } from "next/navigation";

// Workspaces are picked from the sidebar switcher; the Team page shows the
// workspace picker / creator when you're in Personal, so send people there.
export default function WorkspacesPage() {
  redirect("/dashboard/team");
}
