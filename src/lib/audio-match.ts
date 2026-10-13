// Regras de áudio do Cérebro que também rodam no navegador (pré-visualização do painel).

const plain = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** áudio para mandar quando a ligação de voz termina ("logo após ligar", "depois da ligação"); não repete um já enviado */
export function afterCallAudio<T extends { id: string; url: string; when?: string }>(audios: T[], past: string): T | null {
  return (
    audios.find(
      (a) =>
        !past.includes(`audio_id "${a.id}"`) &&
        /\b(apos|depois|terminar|terminou|acabar|acabou|despues|al terminar)\b.{0,25}\b(liga|ligar|ligacao|ligou|chamada|llamada|llamar|llame)|\b(desligar|desligou|desligue|colgar|colgo|cuelgue)\b/.test(plain(a.when ?? "")),
    ) ?? null
  );
}
