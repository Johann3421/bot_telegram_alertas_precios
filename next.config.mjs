/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // No cargar Playwright ni scrapers en el bundle del cliente
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
  // Configuración de dominios para imágenes externas
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hiraoka.com.pe' },
      { protocol: 'https', hostname: '**.coolbox.pe' },
      { protocol: 'https', hostname: '**.impacto.pe' },
      { protocol: 'https', hostname: '**.deltron.com.pe' },
      { protocol: 'https', hostname: '**.oechsle.pe' },
    ],
  },
};

export default nextConfig;
