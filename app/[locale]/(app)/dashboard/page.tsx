import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface p-6">
        <p className="text-sm text-text-muted">{t("totalSavings")}</p>
        <p className="mt-1 text-3xl font-medium text-text-primary">Loading...</p>
      </div>
    </div>
  );
}
