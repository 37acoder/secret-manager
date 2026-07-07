import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecretManager",
  description: "Open source secret management prototype"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
