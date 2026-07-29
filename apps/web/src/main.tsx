import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { PwaRuntime } from "./components/PwaRuntime";
import { installUiPerformanceDiagnostics } from "./diagnostics/ui-performance";
import { registerDaymarkServiceWorker } from "./pwa";
import "./styles/index.css";

const queryClient = new QueryClient();

registerDaymarkServiceWorker();
installUiPerformanceDiagnostics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PwaRuntime />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
