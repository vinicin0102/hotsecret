import type { Prisma } from "@prisma/client";
import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { videoSchema } from "@/lib/validation";
import { normalizeTimeline } from "@/types/video";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const video = await prisma.video.findUnique({ where: { id: String(req.query.id) } });
    if (!video) throw new HttpError(404, "Vídeo não encontrado");
    return { video: { ...video, timeline: normalizeTimeline(video.timeline, video.durationMs) } };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const data = videoSchema.parse(req.body);
    const video = await prisma.video.update({
      where: { id: String(req.query.id) },
      data: {
        name: data.name,
        url: data.url,
        posterUrl: data.posterUrl ?? null,
        durationMs: data.durationMs,
        ...(data.timeline ? { timeline: normalizeTimeline(data.timeline, data.durationMs) as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return { video };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.video.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
