import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import Layout from '@/components/layout/Layout';
import { ClusterProvider } from '@/context/ClusterContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClusterProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ClusterProvider>
  );
}