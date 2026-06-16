import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Create account",
  "Register for a new TaskFlow account."
);

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
