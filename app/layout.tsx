import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "咚咚映画 · 影视漫画",
  description: "统一搜索电影、电视剧、动画和漫画，按作品选择多个来源。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
