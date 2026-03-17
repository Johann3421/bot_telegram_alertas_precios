'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

    if (!response.ok) {
      setIsSubmitting(false);
      setError(payload.error ?? 'No se pudo crear la cuenta.');
      return;
    }

    setFeedback(payload.message ?? 'Cuenta creada. Iniciando sesión...');

    const signInResponse = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/dashboard/settings',
    });

    setIsSubmitting(false);

    if (!signInResponse?.ok) {
      router.push('/login');
      return;
    }

    router.push('/dashboard/settings');
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <div>
          <div className="auth-card-title">Crear acceso</div>
          <div className="auth-card-subtitle">
            Registra a tu operador y habilita un espacio privado para guardar credenciales
            mayoristas, umbrales y notificaciones sin exponer datos a otros usuarios.
          </div>
        </div>
        <div className="auth-badge">Cuenta nueva</div>
      </div>

      <form className="auth-form-grid" onSubmit={handleSubmit}>
        {error ? <div className="auth-feedback error">{error}</div> : null}
        {feedback ? <div className="auth-feedback">{feedback}</div> : null}

        <div className="auth-field">
          <label htmlFor="register-name">Nombre visible</label>
          <input
            id="register-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Analista comercial"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="register-email">Correo</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="empresa@dominio.com"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="register-password">Contraseña</label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="register-password-confirm">Confirmar contraseña</label>
          <input
            id="register-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repite la contraseña"
            required
            minLength={8}
          />
        </div>

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta operativa'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Si ya tienes acceso, entra y completa tus credenciales mayoristas desde configuración.
          </span>
          <Link className="auth-secondary-link" href="/login">
            Ya tengo cuenta
          </Link>
        </div>
      </form>
    </div>
  );
}