import { Outlet } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CalendarReminderRuntime } from "./components/CalendarReminderRuntime";

export function App(): JSX.Element {
  return (
    <AppShell>
      <CalendarReminderRuntime />
      <Outlet />
    </AppShell>
  );
}
