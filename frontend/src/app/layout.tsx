import type { Metadata } from "next";
import { TwinMindBackground } from "../components/TwinMindBackground";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TwinMind — Your personal cognitive system",
    template: "%s · TwinMind",
  },
  description:
    "A personal cognitive operating system for understanding, remembering, and connecting your information.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <TwinMindBackground>{children}</TwinMindBackground>
      </body>
    </html>
  );
}
