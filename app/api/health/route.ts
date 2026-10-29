import { NextResponse } from "next/server";
import { configStatus } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true, app: "pickup", version: "1.0", time: new Date().toISOString(),
    // Config flags are hidden in production.
    ...(process.env.NODE_ENV !== "production" ? { configured: configStatus() } : {}),
  });
}
