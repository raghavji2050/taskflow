import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata("Welcome", "Set up TaskFlow in a minute: personal tasks or a team workspace.");

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
