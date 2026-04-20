import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans, IBM_Plex_Sans_Hebrew } from "next/font/google";
import { routing } from "@/i18n/routing";

// IBM_Plex_Sans (Latin) and IBM_Plex_Sans_Hebrew are sibling families —
// next/font ships them as separate Google Fonts. We load both under their
// own CSS variables so font-family fallback can pick the right glyphs by
// Unicode range automatically.
const ibmPlexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const ibmPlexSansHebrew = IBM_Plex_Sans_Hebrew({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["hebrew", "latin"],
  variable: "--font-sans-hebrew",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "he" | "en")) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${ibmPlexSans.variable} ${ibmPlexSansHebrew.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
