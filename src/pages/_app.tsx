import type { AppProps } from "next/app";
import Head from "next/head";
import "@/styles/globals.css";
import "@/styles/chat.css";
import "@/styles/admin.css";
import "@/styles/builder.css";
import "@xyflow/react/dist/style.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <title>HOT SECRET</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
