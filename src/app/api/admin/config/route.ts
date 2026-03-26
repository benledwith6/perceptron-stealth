import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { getAllConfigs, setConfig, seedDefaultConfigs, clearConfigCache } from "@/lib/system-config";

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    // Seed defaults if this is the first time
    const created = await seedDefaultConfigs();
    if (created > 0) {
      clearConfigCache();
    }

    const category = req.nextUrl.searchParams.get("category") || undefined;
    const configs = await getAllConfigs(category);

    return NextResponse.json(configs);
  } catch (err) {
    console.error("[GET /api/admin/config]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    let body: { key: string; value: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.key || typeof body.value !== "string") {
      return NextResponse.json(
        { error: "key (string) and value (string) are required" },
        { status: 400 }
      );
    }

    try {
      await setConfig(body.key, body.value);
    } catch {
      return NextResponse.json({ error: `Config key "${body.key}" not found` }, { status: 404 });
    }

    return NextResponse.json({ success: true, key: body.key });
  } catch (err) {
    console.error("[PATCH /api/admin/config]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
