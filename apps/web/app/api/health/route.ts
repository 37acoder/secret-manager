import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "secret-manager-web",
    storage: process.env.DATABASE_URL?.startsWith("file:") ? "sqlite" : "external",
    cryptoBoundary: "packages/crypto"
  });
}
