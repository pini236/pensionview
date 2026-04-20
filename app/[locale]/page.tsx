import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function LocaleRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Defensively check auth — if Supabase is slow or errors out, default to login
  // rather than 500ing the page. The login page itself is robust on cold starts.
  let isAuthed = false;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    isAuthed = !!user;
  } catch {
    isAuthed = false;
  }

  redirect(`/${locale}/${isAuthed ? "dashboard" : "login"}`);
}
