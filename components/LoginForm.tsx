'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setIsSubmitting(false);

    if (!response?.ok) {
      setError('Correo o contraseña incorrectos.');
      return;
    }

    router.push(response.url || callbackUrl);
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <div>
          <div className="auth-card-title">Ingreso seguro</div>
          <div className="auth-card-subtitle">
            Entra a tu panel para cargar credenciales mayoristas, disparar scraping autenticado y
            revisar comparativas desde tu propia cuenta.
          </div>
        </div>
        <div className="auth-badge">Control por usuario</div>
      </div>

      <form className="auth-form-grid" onSubmit={handleSubmit}>
        {error ? <div className="auth-feedback error">{error}</div> : null}

        <div className="auth-field">
          <label htmlFor="login-email">Correo</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="empresa@dominio.com"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Tu clave de acceso"
            required
          />
        </div>

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Validando acceso...' : 'Entrar al centro de control'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ¿Primera vez en el sistema? Crea tu cuenta y luego carga tus accesos mayoristas.
          </span>
          <Link className="auth-secondary-link" href="/register">
            Crear cuenta
          </Link>
        </div>
      </form>
    </div>
  );
}