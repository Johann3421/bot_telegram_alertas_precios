'use client';

import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useScrapeStatus } from '@/components/ScrapeStatusProvider';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Comparador de Precios',
  '/dashboard/alerts': 'Historial de Alertas',
  '/dashboard/products': 'Catálogo de Productos',
  '/dashboard/providers': 'Gestión de Proveedores',
  '/dashboard/history': 'Histórico de Precios',
  '/dashboard/settings': 'Configuración',
};

function formatElapsed(elapsedSeconds: number) {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

export function Header({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';
  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
  const scrapeStatus = useScrapeStatus();
  return (    <header
      style={{
        height: 'var(--header-height)',
        background: 'var(--bg-header)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '2px solid #245A3F',
      }}
    >
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-on-dark)',
          fontFamily: 'var(--font-ui)',
          margin: 0,
        }}
      >
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 999,
            background: scrapeStatus?.isRunning ? 'rgba(237, 125, 49, 0.18)' : 'rgba(255,255,255,0.12)',
            border: scrapeStatus?.isRunning
              ? '1px solid rgba(237, 125, 49, 0.45)'
              : '1px solid rgba(255,255,255,0.18)',
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: scrapeStatus?.isRunning ? 'var(--color-warning)' : 'rgba(240,240,240,0.7)',
              boxShadow: scrapeStatus?.isRunning ? '0 0 0 4px rgba(237, 125, 49, 0.12)' : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-on-dark)',
              fontFamily: 'var(--font-ui)',
              whiteSpace: 'nowrap',
            }}
          >
            {scrapeStatus?.isRunning ? 'Scraping activo' : 'Sin scraping activo'}
          </span>
          {scrapeStatus?.isRunning && scrapeStatus.runningJob && (
            <span
              style={{
                fontSize: 11,
                color: 'rgba(240,240,240,0.78)',
                fontFamily: 'var(--font-ui)',
                whiteSpace: 'nowrap',
              }}
            >
              {scrapeStatus.runningJob.provider} · {formatElapsed(scrapeStatus.runningJob.elapsedSeconds)}
              {scrapeStatus.runningJob.pagesAttempted > 0
                ? ` · pág. ${scrapeStatus.runningJob.pagesSucceeded}/${scrapeStatus.runningJob.pagesAttempted}`
                : ''}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            color: 'rgba(240,240,240,0.7)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {new Date().toLocaleDateString('es-PE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: 'var(--text-on-dark)',
            fontWeight: 700,
          }}
        >
          {initial}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            height: 30,
            padding: '0 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.12)',
            color: 'var(--text-on-dark)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
          }}
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
