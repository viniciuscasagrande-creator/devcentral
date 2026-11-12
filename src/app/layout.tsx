import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevCentral — Cockpit de Projetos (GitHub, GitLab & Vercel)",
  description:
    "Painel centralizado para visualizar, sincronizar e gerenciar seus repositórios do GitHub, GitLab e aplicações publicadas na Vercel.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased selection:bg-[#746ef0]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
