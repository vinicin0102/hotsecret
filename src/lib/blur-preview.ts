// Prévia borrada de uma foto/vídeo do Grupo VIP, feita no navegador do dono ao enviar o arquivo:
// uma imagem minúscula (48px) que, ampliada e borrada na página, mostra só cores e formas — nenhum detalhe.
// É isso que o lead vê enquanto o post está bloqueado; o arquivo de verdade só chega depois do pagamento.

const WIDTH = 48;

function draw(source: CanvasImageSource, w: number, h: number): Promise<File | null> {
  if (!w || !h) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = Math.max(1, Math.round((h / w) * WIDTH));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.filter = "blur(1.5px)";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? new File([b], "preview.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.7));
}

function videoFrame(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (f: File | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(f);
    };
    const timer = setTimeout(() => done(null), 10_000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 3);
    };
    v.onseeked = () => void draw(v, v.videoWidth, v.videoHeight).then(done);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** prévia borrada do arquivo (null se o navegador não conseguir ler — o post fica com o cadeado sem imagem) */
export async function makeBlurPreview(file: File): Promise<File | null> {
  try {
    if (file.type.startsWith("video/")) return await videoFrame(file);
    const bmp = await createImageBitmap(file);
    const f = await draw(bmp, bmp.width, bmp.height);
    bmp.close();
    return f;
  } catch {
    return null;
  }
}
