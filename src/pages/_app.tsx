import type { AppProps } from "next/app";
import Head from "next/head";
import { ToastProvider } from "@/hooks/useToast";
import "@/styles/globals.css";
import "@/styles/chat.css";
import "@/styles/admin.css";
import "@/styles/builder.css";
// fontes do painel (servidas pelo próprio site) + identidade do painel
import "@fontsource-variable/unbounded";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif/400-italic.css";
import "@/styles/panel.css";
import "@xyflow/react/dist/style.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <title>HOT SECRET</title>
      </Head>
      {/* avisos disponíveis em qualquer página (inclusive no construtor, que fica fora do layout) */}
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </>
  );
}
