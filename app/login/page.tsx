import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from '@/components/LoginForm';
import { authOptions } from '@/lib/auth';

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect('/dashboard');
  }

  return (
    <AuthShell
      mode="Ingreso"
      title="Acceso por cuenta"
      description="Cada operador entra con su propio usuario y mantiene sus credenciales mayoristas separadas."
    >
      <LoginForm />
    </AuthShell>
  );
}