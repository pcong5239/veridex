import React, { lazy, Suspense, useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';

const Workspace = lazy(() => import('./Workspace').then((module) => ({ default: module.Workspace })));

export const App: React.FC = () => {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(() => window.location.pathname === '/app');

  useEffect(() => {
    const syncRoute = () => setIsWorkspaceOpen(window.location.pathname === '/app');
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  if (!isWorkspaceOpen) {
    return <LandingPage onEnterWorkspace={() => {
      window.history.pushState({}, '', '/app');
      setIsWorkspaceOpen(true);
    }} />;
  }

  return (
    <Suspense fallback={<p className="workspace-loading" role="status">Opening Veridex workspace…</p>}>
      <Workspace />
    </Suspense>
  );
};
