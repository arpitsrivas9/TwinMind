import type { Metadata } from "next";
import { TwinMindBackground } from "../components/TwinMindBackground";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>
            <TwinMindBackground>{children}</TwinMindBackground>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
