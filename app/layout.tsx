import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "LexVibe LegalTech",
  description: "LexVibe - profesionalni pravni RAG asistent na srpskom jeziku",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sr">
      <body className="bg-[#071326] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
