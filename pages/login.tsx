import { useState, type FormEvent } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import Layout from '../components/layout/Layout';

function safeCallbackUrl(value: string | string[] | undefined): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/';
  }
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!result?.ok) {
        setErrorMessage('Correo o contraseña incorrectos.');
        return;
      }
      await router.replace(safeCallbackUrl(router.query.callbackUrl));
    } catch {
      setErrorMessage('No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const result = await signIn('nodemailer', {
        email: email.trim(),
        redirect: false,
      });
      if (!result?.ok) {
        setErrorMessage('No se pudo solicitar el enlace. Inténtalo de nuevo.');
        return;
      }
      setNotice('Si el correo puede recibir el enlace, te llegará en unos momentos.');
    } catch {
      setErrorMessage('No se pudo solicitar el enlace. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Head><title>Iniciar sesión — Aleca Travel</title></Head>
      <main className="mx-auto max-w-md py-12">
        <section className="space-y-5 rounded-lg border bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-gray-600">Usa tu contraseña o recibe un enlace de acceso por correo.</p>
          </div>
          <form onSubmit={handleCredentials} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Correo electrónico</span>
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded border p-2" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Contraseña</span>
              <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded border p-2" />
            </label>
            <button disabled={loading} className="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60">
              {loading ? 'Procesando…' : 'Entrar con contraseña'}
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs uppercase text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />o<span className="h-px flex-1 bg-gray-200" />
          </div>
          <button type="button" disabled={loading || !email.trim()} onClick={() => void handleMagicLink()} className="w-full rounded border px-4 py-2 font-medium disabled:opacity-60">
            Enviarme un magic link
          </button>
          {errorMessage && <p role="alert" className="text-sm text-red-700">{errorMessage}</p>}
          {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
          <p className="text-sm text-gray-600">
            ¿No tienes cuenta? <Link href="/signup" className="underline">Regístrate</Link>
          </p>
        </section>
      </main>
    </Layout>
  );
}
