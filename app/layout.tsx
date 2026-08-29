import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lorenzo · Office",
  description: "Sala de trabalho dos agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
