"use client";

import { AppProvider, useApp } from "@/context/AppContext";
import { ToastProvider, Spinner } from "@/components/ui";
import AuthGate from "@/components/AuthGate";
import AppShell from "@/components/AppShell";

function Gate() {
  const { session, loading } = useApp();
  if (!session) return <AuthGate />;
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="กำลังโหลดข้อมูล…" />
      </div>
    );
  return <AppShell />;
}

export default function Page() {
  return (
    <ToastProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </ToastProvider>
  );
}
