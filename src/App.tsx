import { ThemeProvider } from "@/components/theme-provider";
// import { ModeToggle } from "@/components/mode-toggle";
import { lazy, Suspense } from "react";
import { LandingPage } from "@/pages/LandingPage";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

// The configurator (and its deps) downloads only when someone opens it, not with the landing page.
const ConfigurePage = lazy(() => import("@/pages/ConfigurePage").then((m) => ({ default: m.ConfigurePage })));

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="itaiko-ui-theme">
      {/* <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div> */}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/configure" element={<Suspense fallback={null}><ConfigurePage /></Suspense>} />
      </Routes>
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}

export default App;
