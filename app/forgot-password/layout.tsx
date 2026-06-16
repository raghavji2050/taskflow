import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Forgot password",
  "Reset your TaskFlow account password."
);

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
