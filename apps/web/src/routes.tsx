import { useQuery } from "@tanstack/react-query";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { apiFetch } from "./api/client";
import { App } from "./App";
import { LoadingState } from "./components/LoadingState";
import { CalendarWeekView } from "./features/calendar/CalendarWeekView";
import { ChoresPage } from "./features/chores/ChoresPage";
import { TodayDashboard } from "./features/dashboard/TodayDashboard";
import { ImportPlaceholder } from "./features/import/ImportPlaceholder";
import { MealPlanWeek } from "./features/meals/MealPlanWeek";
import { SettingsPage } from "./features/settings/SettingsPage";
import { AdminPinUnlock } from "./features/setup/AdminPinUnlock";
import { SetupWizard } from "./features/setup/SetupWizard";

function RootRedirect(): JSX.Element {
  const setupQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiFetch<{ setupRequired: boolean }>("/setup/status")
  });

  if (setupQuery.isLoading) {
    return <LoadingState label="Checking setup..." />;
  }

  if (setupQuery.data?.setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  return <Navigate to="/today" replace />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: "setup", element: <SetupWizard /> },
      { path: "settings/unlock", element: <AdminPinUnlock /> },
      { path: "today", element: <TodayDashboard /> },
      { path: "week", element: <CalendarWeekView /> },
      { path: "chores", element: <ChoresPage /> },
      { path: "meals", element: <MealPlanWeek /> },
      { path: "import", element: <ImportPlaceholder /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);
