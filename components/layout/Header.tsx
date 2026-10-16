import Link from "next/link"
import { useRouter } from "next/router"
import { signOut } from "next-auth/react"
import { useMe } from "../../features/auth/useMe"

const Header = () => {
  const router = useRouter()
  const { user, status } = useMe()

  function isActive(pathname: string) {
    return router.pathname === pathname
  }

  return (
    <nav aria-label="Navegación principal">
      <div className="left">
        <Link href="/" legacyBehavior>
          <a className="bold" data-active={isActive("/")}>
            Catálogo
          </a>
        </Link>
        <Link href="/search" legacyBehavior>
          <a data-active={isActive("/search")}>Buscar</a>
        </Link>
      </div>
      <div className="right">
        {status === "authenticated" ? (
          <>
            <span>{user?.name ?? user?.email}</span>
            <Link href="/mis-reservas" legacyBehavior>
              <a data-active={isActive("/mis-reservas")}>Mis reservas</a>
            </Link>
            {(user?.role === "ADMIN" || user?.role === "AGENT") && (
              <Link href="/admin" legacyBehavior>
                <a data-active={isActive("/admin")}>Administración</a>
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link href="/create" legacyBehavior>
                <a data-active={isActive("/create")}>+ Nuevo Hotel</a>
              </Link>
            )}
            <button type="button" onClick={() => void signOut({ redirectTo: "/" })}>
              Cerrar sesión
            </button>
          </>
        ) : status === "unauthenticated" ? (
          <>
            <Link href="/login" legacyBehavior>
              <a data-active={isActive("/login")}>Iniciar sesión</a>
            </Link>
            <Link href="/signup" legacyBehavior>
              <a data-active={isActive("/signup")}>Crear cuenta</a>
            </Link>
          </>
        ) : (
          <span aria-live="polite">Cargando sesión…</span>
        )}
      </div>
      <style jsx>{`
        nav {
          display: flex;
          padding: 2rem;
          align-items: center;
        }

        .bold {
          font-weight: bold;
        }

        a {
          text-decoration: none;
          color: #000;
          display: inline-block;
        }

        .left a[data-active="true"] {
          color: gray;
        }

        a + a {
          margin-left: 1rem;
        }

        .right {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .right a {
          border: 1px solid black;
          padding: 0.5rem 1rem;
          border-radius: 3px;
        }

        button {
          background: white;
          border: 1px solid black;
          padding: 0.5rem 1rem;
          border-radius: 3px;
        }
      `}</style>
    </nav>
  );
}

export default Header
