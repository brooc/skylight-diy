import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/today", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/chores", label: "Chores" },
  { to: "/meals", label: "Meals" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" }
];

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="text-lg font-semibold">Skylight DIY</div>
          <div className="text-sm text-slate-400">
            {new Date().toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit"
            })}
          </div>
        </div>
      </header>
      <nav className="border-b border-slate-800 bg-slate-900/60 px-4 py-2">
        <ul className="mx-auto flex max-w-7xl flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-sky-500 text-white"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
