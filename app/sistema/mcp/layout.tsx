import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Control MCP | Quepia",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function McpLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
