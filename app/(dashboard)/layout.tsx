import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={{ name: session.user.name ?? 'Operador', email: session.user.email ?? '' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          user={{
            name: session.user.name ?? 'Operador',
            email: session.user.email ?? '',
          }}
        />
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
