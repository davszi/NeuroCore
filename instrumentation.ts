export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // We import dynamically to avoid issues during build time
    const { startBackgroundServices } = await import('@/lib/service-worker');
    startBackgroundServices();
  }
}