import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { signIn } from 'next-auth/react';
import { useMutation } from '@apollo/client/react';
import { graphql } from '../gql';

const SIGNUP_MUTATION = graphql(`
  mutation SignupUser($name: String, $email: String!, $password: String!) {
    signupUser(name: $name, email: $email, password: $password) {
      id
      email
    }
  }
`);

function Signup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signup, { loading }] = useMutation(SIGNUP_MUTATION);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      await signup({
        variables: { name: name.trim() || null, email: email.trim(), password },
      });
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setErrorMessage('Tu cuenta se creó, pero no se pudo iniciar sesión. Ve a Iniciar sesión.');
        return;
      }
      await router.replace('/');
    } catch {
      setErrorMessage('No se pudo crear la cuenta. Comprueba los datos o inicia sesión si ya tienes una.');
    }
  };

  return (
    <Layout>
      <Head><title>Crear cuenta — Aleca Travel</title></Head>
      <main className="mx-auto max-w-md py-12">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold">Crear cuenta</h1>
            <p className="mt-1 text-sm text-gray-600">Regístrate para consultar tus reservas.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nombre</span>
            <input autoComplete="name" onChange={(event) => setName(event.target.value)} value={name} className="w-full rounded border p-2" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Correo electrónico</span>
            <input required type="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} value={email} className="w-full rounded border p-2" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Contraseña (mínimo 8 caracteres)</span>
            <input required minLength={8} maxLength={72} type="password" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} value={password} className="w-full rounded border p-2" />
          </label>
          {errorMessage && <p role="alert" className="text-sm text-red-700">{errorMessage}</p>}
          <button disabled={loading} className="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60">
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
          <p className="text-sm text-gray-600">
            ¿Ya tienes cuenta? <Link href="/login" className="underline">Inicia sesión</Link>
          </p>
        </form>
      </main>
    </Layout>
  );
}

export default Signup;
