import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { TopBar } from "@/components/nav/TopBar";
import { Sidebar } from "@/components/nav/Sidebar";
import { AnimatedBackground } from "@/components/background/AnimatedBackground";
import { FloatingParticles } from "@/components/background/FloatingParticles";
import { AdvisorChat } from "@/components/advisor/AdvisorChat";
import { getActiveMember } from "@/lib/active-member";

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

  // Resolve household members once at the layout level so the switcher in both
  // TopBar and Sidebar shares the same data source.
  const active = await getActiveMember({});
  const members = active.members;

  return (
    <div className="min-h-screen pb-20 pt-14 lg:pb-0 lg:pt-0">
      <AnimatedBackground />
      <FloatingParticles />
      <TopBar members={members} />
      <Sidebar members={members} />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-8 lg:ms-60 lg:px-12 lg:pb-8 lg:pt-8">
        {children}
      </main>
      <BottomNav />
      <AdvisorChat />
    </div>
  );
}
