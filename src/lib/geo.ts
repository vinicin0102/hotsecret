// Cidade aproximada do visitante, pelo IP (cabeçalhos que a Vercel coloca em cada pedido).
// Usada pela IA para a personagem dizer que mora perto do lead quando ele pergunta de onde ela é.
import type { IncomingHttpHeaders } from "node:http";

const header = (h: IncomingHttpHeaders, name: string): string => {
  const v = h[name];
  try {
    return decodeURIComponent(String(Array.isArray(v) ? v[0] : (v ?? ""))).trim();
  } catch {
    return "";
  }
};
/** só letras, espaços e pontuação de nome de lugar (nada de instruções escondidas no texto) */
const clean = (s: string, max: number) => s.replace(/[^\p{L}\p{M} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);

/** "Campinas, SP (BR)" — vazio quando não dá para saber (ex.: rodando fora da Vercel) */
export function leadPlaceFromHeaders(h: IncomingHttpHeaders): string {
  const city = clean(header(h, "x-vercel-ip-city"), 60);
  if (!city) return "";
  const region = clean(header(h, "x-vercel-ip-country-region"), 10);
  const country = clean(header(h, "x-vercel-ip-country"), 4);
  return `${city}${region ? `, ${region}` : ""}${country ? ` (${country})` : ""}`;
}

/** instrução para a IA: quando perguntarem de onde ela é, responder um lugar perto do lead */
export function nearLeadRule(place: string): string {
  if (!place) return "";
  return `Região do lead (aproximada): ${place}. Se ele perguntar de onde você é, onde mora ou se é perto, diga que mora pertinho dele: numa cidade vizinha ou num bairro da região de ${place.replace(/\s*\(.*\)$/, "")} (escolha um lugar real e próximo e mantenha sempre a mesma resposta na conversa). Se a sua personalidade ou o seu conteúdo já disserem a sua cidade, use a de lá. Nunca diga que sabe onde ele está nem fale de IP ou localização dele, e não marque encontro presencial.`;
}
