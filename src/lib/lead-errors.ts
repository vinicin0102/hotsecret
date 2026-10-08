// Erros que o chat público mostra ao lead: no fluxo em espanhol (México/Argentina) a resposta da API
// vem traduzida. O chat informa o idioma no cabeçalho x-chat-locale.
const ES: Record<string, string> = {
  "Conteúdo bloqueado": "Contenido bloqueado",
  "Bloco não encontrado": "No encontrado",
  "Bloco inválido": "No disponible",
  "Ligação não encontrada": "Llamada no encontrada",
  "Chamada não encontrada": "Llamada no encontrada",
  "Cartas não encontradas": "Cartas no encontradas",
  "Não foi possível gerar o pagamento agora. Tente novamente em instantes.": "No se pudo generar el pago ahora. Inténtalo de nuevo en unos momentos.",
  "Pagamentos indisponíveis no momento. Tente novamente mais tarde.": "Pagos no disponibles por el momento. Intenta de nuevo más tarde.",
  "Limite de fotos desta conversa atingido": "Llegaste al límite de fotos de esta conversación",
  "Envie uma foto (JPG, PNG ou WEBP)": "Envía una foto (JPG, PNG o WEBP)",
  "Arquivo não é uma foto válida": "El archivo no es una foto válida",
  "Foto grande demais": "La foto es demasiado grande",
  "Este vídeo já foi visualizado": "Este video ya se vio",
  "Vídeo indisponível": "Video no disponible",
  "Pagamento não encontrado": "Pago no encontrado",
  "Não encontrado": "No encontrado",
  "Fluxo indisponível": "Conversación no disponible",
  "Cérebro indisponível": "No disponible",
  "Sessão inválida": "Sesión inválida. Recarga la página.",
  "Sessão expirada": "Tu sesión expiró. Recarga la página.",
  "Pagamento ainda não confirmado": "El pago aún no se confirma",
  "Produto indisponível": "Producto no disponible",
  "Oferta inválida": "Oferta no disponible",
  "Mensagem vazia": "Escribe un mensaje",
  "Método não permitido": "Método no permitido",
  "Dados inválidos": "Datos inválidos",
  "Erro interno": "Ocurrió un error. Inténtalo de nuevo.",
  "Registro duplicado (valor já em uso).": "Ya existe un registro con ese valor.",
  "Registro não encontrado.": "No encontrado.",
};

export function isSpanishChat(header: string | string[] | undefined): boolean {
  const v = Array.isArray(header) ? header[0] : header;
  return typeof v === "string" && v.toLowerCase().startsWith("es");
}

/** Traduz a mensagem de erro para o lead do fluxo em espanhol (mensagens desconhecidas passam iguais). */
export function leadError(message: string, spanish: boolean): string {
  if (!spanish) return message;
  const rate = /^Muitas requisições\. Tente novamente em (\d+)s\.$/.exec(message);
  if (rate) return `Demasiadas solicitudes. Inténtalo de nuevo en ${rate[1]} s.`;
  return ES[message] ?? message;
}
