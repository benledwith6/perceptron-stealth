import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET() {
  try {
    const { error, user } = await requireAuth();
    if (error) return error;

    const [totalVideos, publishedVideos, eventGroups] = await Promise.all([
      prisma.video.count({ where: { userId: user.id } }),
      prisma.video.count({ where: { userId: user.id, status: "published" } }),
      prisma.analyticsEvent.groupBy({
        by: ["eventType"],
        where: { userId: user.id },
        _sum: { count: true },
      }),
    ]);

    // Build totals map from aggregated groups
    const totals: Record<string, number> = {};
    for (const g of eventGroups) {
      totals[g.eventType] = g._sum.count || 0;
    }

    return NextResponse.json({
      totalVideos,
      publishedVideos,
      totalViews: totals.view || 0,
      totalLikes: totals.like || 0,
      totalShares: totals.share || 0,
      totalComments: totals.comment || 0,
    });
  } catch (err) {
    console.error("[GET /api/analytics/summary]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
