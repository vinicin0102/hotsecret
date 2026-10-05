import type { Prisma } from "@prisma/client";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { videoSchema } from "@/lib/validation";
import { defaultTimeline, normalizeTimeline } from "@/types/video";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const videos = await prisma.video.findMany({ orderBy: { createdAt: "desc" } });
    return { videos };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = videoSchema.parse(req.body);
    const timeline = data.timeline ? normalizeTimeline(data.timeline, data.durationMs) : defaultTimeline(data.durationMs);
    const video = await prisma.video.create({
      data: { name: data.name, url: data.url, posterUrl: data.posterUrl ?? null, durationMs: data.durationMs, timeline: timeline as unknown as Prisma.InputJsonValue },
    });
    return { video };
  },
});
