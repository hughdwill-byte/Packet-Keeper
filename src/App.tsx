import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

function TabLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
          isActive ? "text-brand-600" : "text-stone-500"
        }`
      }
    >
      <span className="text-2xl leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}

export default function App() {
  const loc = useLocation();
  const onUpload = loc.pathname.startsWith("/upload");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-100 bg-orange-50/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
          <span className="text-2xl">🥘</span> Packet Keeper
        </Link>
        <Link
          to="/settings"
          className="rounded-full p-2 text-stone-500 hover:bg-orange-100"
          aria-label="Settings"
        >
          <span className="text-xl">⚙️</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* Floating add button (hidden on the upload screen itself) */}
      {!onUpload && (
        <Link
          to="/upload"
          className="fixed bottom-20 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-600 text-3xl text-white shadow-lg shadow-orange-300 active:scale-95"
          aria-label="Add recipe"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          +
        </Link>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 border-t border-orange-100 bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <TabLink to="/" label="Recipes" icon="📖" />
        <TabLink to="/upload" label="Add" icon="📷" />
        <TabLink to="/prices" label="Prices" icon="🛒" />
        <TabLink to="/settings" label="Settings" icon="⚙️" />
      </nav>
    </div>
  );
}
