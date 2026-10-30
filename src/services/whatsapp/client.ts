// WhatsApp não oficial: Evolution API (servidor próprio/hospedado) ou uazapi (hospedada).
// Qual usar vem do endereço (*.uazapi.com = uazapi) ou de WHATSAPP_PROVIDER; endereço e chave ficam nas variáveis de ambiente.
import { createHmac } from "node:crypto";
import * as evolution from "./evolution";
import * as uazapi from "./uazapi";

export type WaProvider = "evolution" | "uazapi";
export interface WaConfig {
  provider: WaProvider;
  url: string;
  /** Evolution: chave global (AUTHENTICATION_API_KEY) · uazapi: token da instância */
  key: string;
  /** Evolution: nome da instância · uazapi: só para mostrar no painel (opcional) */
  instance: string;
}

export const PROVIDER_LABEL: Record<WaProvider, string> = { evolution: "Evolution API", uazapi: "uazapi" };

function providerOf(url: string): WaProvider {
  const forced = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (forced === "uazapi" || forced === "evolution") return forced;
  try {
    return /(^|\.)uazapi\.com$/i.test(new URL(url).hostname) ? "uazapi" : "evolution";
  } catch {
    return "evolution";
  }
}

export function waConfig(): WaConfig | null {
  let url = process.env.WHATSAPP_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.WHATSAPP_API_KEY?.trim();
  const instance = process.env.WHATSAPP_INSTANCE?.trim() ?? "";
  if (!url || !key) return null;
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  const provider = providerOf(url);
  if (provider === "evolution" && !instance) return null;
  return { provider, url, key, instance };
}

/** quais variáveis faltam (só os nomes) */
export function missingWaEnv(): string[] {
  const url = process.env.WHATSAPP_API_URL?.trim() ?? "";
  const needInstance = !url || providerOf(/^https?:\/\//.test(url) ? url : `https://${url}`) === "evolution";
  return ["WHATSAPP_API_URL", "WHATSAPP_API_KEY", ...(needInstance ? ["WHATSAPP_INSTANCE"] : [])].filter((k) => !process.env[k]?.trim());
}

/** token do endereço do webhook: derivado da chave (não precisa de outra variável e muda junto com ela) */
export function webhookToken(cfg: WaConfig): string {
  return createHmac("sha256", cfg.key).update("hotsecret-whatsapp-webhook").digest("hex").slice(0, 40);
}

/** estado padronizado: open (conectado), connecting, close */
export async function connectionState(cfg: WaConfig): Promise<string> {
  if (cfg.provider === "evolution") return evolution.connectionState(cfg);
  const st = await uazapi.connectionState(cfg);
  return st === "connected" ? "open" : st === "connecting" ? "connecting" : st === "disconnected" || st === "hibernated" ? "close" : st;
}

export function setWebhook(cfg: WaConfig, url: string) {
  return cfg.provider === "evolution" ? evolution.setWebhook(cfg, url) : uazapi.setWebhook(cfg, url);
}

export function sendText(cfg: WaConfig, number: string, text: string, delay = 0) {
  return cfg.provider === "evolution" ? evolution.sendText(cfg, number, text, delay) : uazapi.sendText(cfg, number, text, delay);
}

export function sendMedia(cfg: WaConfig, number: string, kind: "image" | "video", url: string, caption?: string) {
  return cfg.provider === "evolution" ? evolution.sendMedia(cfg, number, kind, url, caption) : uazapi.sendMedia(cfg, number, kind, url, caption);
}

/** áudio como mensagem de voz */
export function sendAudio(cfg: WaConfig, number: string, url: string) {
  return cfg.provider === "evolution" ? evolution.sendAudio(cfg, number, url) : uazapi.sendMedia(cfg, number, "ptt", url);
}

/** erro de quem respondeu a chamada (Evolution ou uazapi), para mostrar no painel */
export function isProviderError(e: unknown): e is Error {
  return e instanceof evolution.EvolutionError || e instanceof uazapi.UazapiError;
}
