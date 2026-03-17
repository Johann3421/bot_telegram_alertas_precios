import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { RegisterForm } from '@/components/RegisterForm';
import { authOptions } from '@/lib/auth';

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect('/dashboard');
  }

  return (
    <AuthShell
      mode="Registro"
      title="Alta de operador"
      description="Crea una cuenta privada para guardar accesos mayoristas y probar la auditoría completa sin editar el proyecto."
    >
      <RegisterForm />
    </AuthShell>
  );
}