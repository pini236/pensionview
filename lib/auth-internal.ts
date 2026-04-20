import { NextRequest, NextResponse } from "next/server";

const INTERNAL_SECRET = process.env.PIPELINE_INTERNAL_SECRET;

export function assertInternalRequest(request: NextRequest): NextResponse | null {
  const auth = request.headers.get("x-pipeline-secret");
  if (!INTERNAL_SECRET) {
    console.error("PIPELINE_INTERNAL_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (auth !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const CRON_SECRET = process.env.CRON_SECRET;

export function assertVercelCron(request: NextRequest): NextResponse | null {
  // Vercel cron sends Bearer token in Authorization header
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
