import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

const links: Array<{ to: string; label: string; icon: string }> = [
  { to: "/today", label: "Calendar", icon: "□" },
  { to: "/import", label: "Lists", icon: "▤" },
  { to: "/chores", label: "Tasks", icon: "✓" },
  { to: "/meals", label: "Meals", icon: "◫" },
  { to: "/week", label: "Week", icon: "▦" },
  { to: "/settings", label: "Settings", icon: "⚙" }
];

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  return (
    <div className="min-h-screen bg-[#f7f7f5] px-2 py-2 text-slate-900 md:px-3 md:py-3">
      <div className="mx-auto flex w-full max-w-[1480px] gap-2 md:gap-3">
        <aside className="hidden w-[92px] shrink-0 rounded-md border border-[#dde5ef] bg-[#eef3fa] md:flex md:flex-col md:items-center">
          <div className="mb-2 mt-2 flex h-14 w-full items-center justify-center border-b border-[#dbe3ee]">
            <span className="font-display text-3xl text-slate-500">D</span>
          </div>
          <nav className="flex w-full flex-1 flex-col gap-1 px-1 py-1">
            {links.map((link) => {
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex min-h-[66px] flex-col items-center justify-center rounded-md px-1 text-center ${
                      isActive
                        ? "bg-[#dce7f5] text-slate-900"
                        : "text-slate-600 hover:bg-[#e5edf8]"
                    }`
                  }
                >
                  <span className="text-xl leading-none">{link.icon}</span>
                  <span className="mt-1 text-[11px] font-medium">{link.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <nav className="mb-2 grid grid-cols-3 gap-2 md:hidden">
            {links.map((link) => {
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex min-h-[50px] items-center justify-center gap-1 rounded-md border text-xs font-semibold ${
                      isActive
                        ? "border-transparent bg-[#dce7f5] text-slate-900"
                        : "border-[#d9e2ee] bg-[#eef3fa] text-slate-600"
                    }`
                  }
                >
                  <span className="text-sm leading-none">{link.icon}</span>
                  {link.label}
                </NavLink>
              );
            })}
          </nav>

          <main className="grid gap-3">{children}</main>
        </div>
      </div>
    </div>
  );
}
