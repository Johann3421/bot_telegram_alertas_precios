'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Bell,
  Package,
  Truck,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const MENU_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { label: 'Alertas', href: '/dashboard/alerts', icon: Bell, badgeKey: 'alerts' },
  { label: 'Productos', href: '/dashboard/products', icon: Package },
  { label: 'Proveedores', href: '/dashboard/providers', icon: Truck },
  { label: 'Histórico', href: '/dashboard/history', icon: BarChart3 },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setAlertCount(data.pendingAlerts ?? 0))
      .catch(() => {});
  }, []);

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        background: 'var(--bg-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {/* Logo / Título */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span
          style={{
            color: 'var(--text-on-dark)',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-ui)',
            letterSpacing: '-0.3px',
          }}
        >
          Precios PE
        </span>
      </div>

      {/* Menú */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {MENU_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                fontSize: 13,
                fontFamily: 'var(--font-ui)',
                color: isActive ? '#FFFFFF' : 'var(--text-on-dark)',
                background: isActive ? 'rgba(0,176,240,0.2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.1s',
                opacity: isActive ? 1 : 0.8,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.badgeKey === 'alerts' && alertCount > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'var(--color-negative)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 8,
                    minWidth: 18,
                    textAlign: 'center',
                  }}
                >
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer del sidebar */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'grid',
          gap: 4,
          fontFamily: 'var(--font-ui)',
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(240,240,240,0.55)' }}>{user.name}</span>
        <span
          style={{
            fontSize: 10,
            color: 'rgba(240,240,240,0.35)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.email}
        </span>
      </div>
    </aside>
  );
}
