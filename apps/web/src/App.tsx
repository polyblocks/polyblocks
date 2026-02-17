import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AuthGuard from "./components/AuthGuard";
import EditorPage from "./pages/EditorPage";
import DashboardPage from "./pages/DashboardPage";
import TemplatesPage from "./pages/TemplatesPage";
import LibraryPage from "./pages/LibraryPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";
import CopyTradingPage from "./pages/CopyTradingPage";
import BacktestingPage from "./pages/BacktestingPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import { useEffect } from "react";
import { useAuthStore } from "./stores/authStore";

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protected routes — must be logged in */}
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/editor/:strategyId" element={<EditorPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/copy-trading" element={<CopyTradingPage />} />
          <Route path="/backtesting" element={<BacktestingPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
