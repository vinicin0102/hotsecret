import { prisma } from "@/lib/prisma";

export async function addTagToLead(leadId: string, tagId: string, source: "manual" | "automation" | "flow" = "manual") {
  await prisma.leadTag.upsert({
    where: { leadId_tagId: { leadId, tagId } },
    create: { leadId, tagId, source },
    update: {},
  });
}

export async function removeTagFromLead(leadId: string, tagId: string) {
  await prisma.leadTag.deleteMany({ where: { leadId, tagId } });
}

/** Garante a existência de uma tag pelo nome (usada pelas tags automáticas do sistema). */
export async function ensureTag(name: string, color = "#D94F7D") {
  return prisma.tag.upsert({ where: { name }, create: { name, color }, update: {} });
}
