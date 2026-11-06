// "Voltar" do celular/navegador com a tela do PIX aberta: em vez de sair da página (e perder o lead), abre o
// "Vai desistir agora?". Enquanto a tela do PIX está aberta, há uma entrada a mais no histórico; o voltar a consome
// e o Next não navega (beforePopState). Quando a tela fecha por outro caminho, a entrada sobra e é retirada.
import { useEffect, useRef } from "react";
import Router from "next/router";

let handler: (() => void) | null = null;
/** voltas que nós mesmos demos (retirar a entrada que sobrou): o Next não deve reagir a elas */
let swallow = 0;
let installed = false;
/** pré-visualização dentro do painel: não mexe no histórico do painel */
let enabled = true;

export function setBackGuardEnabled(on: boolean) {
  enabled = on;
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // o Next ouve o mesmo evento antes de nós: enquanto houver guarda (ou volta nossa), ele não navega
  Router.beforePopState(() => !(handler || swallow > 0));
  // nós consumimos o evento (o Next pula o beforePopState no 1º "voltar" da página, por isso o evento direto)
  window.addEventListener("popstate", () => {
    if (swallow > 0) {
      swallow--;
      return;
    }
    if (handler) {
      const h = handler;
      handler = null;
      h();
    }
  });
}

/** active: tela do PIX aberta; onBack: o que fazer quando ele aperta voltar (abrir o "Vai desistir agora?") */
export function useBackGuard(active: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active || !enabled || typeof window === "undefined") return;
    install();
    let ours = true;
    window.history.pushState(window.history.state, "", window.location.href);
    handler = () => {
      ours = false; // o voltar já consumiu a entrada
      cb.current();
    };
    return () => {
      handler = null;
      if (ours) {
        swallow++;
        window.history.back();
      }
    };
  }, [active]);
}
