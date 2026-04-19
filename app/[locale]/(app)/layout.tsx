import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { TopBar } from "@/components/nav/TopBar";
import { Sidebar } from "@/components/nav/Sidebar";
import { AnimatedBackground } from "@/components/background/AnimatedBackground";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="min-h-screen pb-20 pt-14 lg:pb-0 lg:pt-0">
      <AnimatedBackground />
      <TopBar />
      <Sidebar />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-8 lg:ms-60 lg:px-12 lg:pb-8 lg:pt-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
