import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Reset password",
  "Choose a new password for your TaskFlow account."
);

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
