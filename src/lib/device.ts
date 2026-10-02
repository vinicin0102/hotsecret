/** Detecção simples de dispositivo/navegador/SO a partir do User-Agent. */
export function parseUserAgent(ua: string | undefined | null) {
  const s = ua ?? "";
  const device = /iPad|Tablet/i.test(s) ? "tablet" : /Mobi|Android|iPhone/i.test(s) ? "mobile" : "desktop";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Instagram/.test(s)
          ? "Instagram"
          : /FBAN|FBAV/.test(s)
            ? "Facebook"
            : /Chrome\//.test(s)
              ? "Chrome"
              : /Firefox\//.test(s)
                ? "Firefox"
                : /Safari\//.test(s)
                  ? "Safari"
                  : "Outro";
  const os = /Windows/.test(s)
    ? "Windows"
    : /Android/.test(s)
      ? "Android"
      : /iPhone|iPad|iOS/.test(s)
        ? "iOS"
        : /Mac OS X/.test(s)
          ? "macOS"
          : /Linux/.test(s)
            ? "Linux"
            : "Outro";
  return { device, browser, os };
}
