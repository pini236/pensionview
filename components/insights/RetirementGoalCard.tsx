"use client";
import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { Target, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

interface RetirementGoalCardProps {
  projectedFull: number;
  goalMonthly: number | null;
  currentAge: number | null;
  retirementAge: number;
  monthlyDeposits: number;
  locale: string;
}

export function RetirementGoalCard({
  projectedFull,
  goalMonthly,
  currentAge,
  retirementAge,
}: RetirementGoalCardProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const isHebrew = locale === "he";

  if (!goalMonthly) {
    return (
      <Link
        href={`/${locale}/settings#retirement`}
        className="block"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.005 }}
          className="rounded-xl border-2 border-dashed border-surface-hover bg-surface p-5 text-center cursor-pointer hover:border-cta/40 transition-colors"
        >
          <Target className="mx-auto mb-2 h-8 w-8 text-text-muted" />
          <p className="text-sm font-medium text-text-primary">
            {isHebrew ? "הגדר יעד פרישה" : "Set your retirement goal"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {isHebrew
              ? "כמה שקלים בחודש אתה צריך כדי לפרוש בשקט?"
              : "How much monthly income do you need to retire comfortably?"}
          </p>
        </motion.div>
      </Link>
    );
  }

  const progress = Math.min(100, (projectedFull / goalMonthly) * 100);
  const gap = Math.max(0, goalMonthly - projectedFull);
  const onTrack = progress >= 90;
  const yearsLeft = currentAge ? retirementAge - currentAge : null;

  // Suggested deposit increase to close gap (simplified — assume 5% real return)
  // FV = PMT * (((1+r)^n - 1) / r) for annuity
  // Need: extra monthly pension = gap; over yearsLeft years at 5% real
  let suggestedExtra = 0;
  if (yearsLeft && yearsLeft > 0) {
    const r = 0.05;
    const n = yearsLeft;
    // We want extra monthly pension of `gap` for ~20 years post-retirement
    // Lump sum needed at retirement: gap * 12 * 20 / (1 + 0.05*10) (rough)
    const lumpSumNeeded = gap * 12 * 20 / 2; // very rough
    // Monthly deposit to reach lump sum at 5% over n years
    const monthlyR = r / 12;
    const months = n * 12;
    suggestedExtra = (lumpSumNeeded * monthlyR) / (Math.pow(1 + monthlyR, months) - 1);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-surface p-5"
    >
      <div className="mb-3 flex items-start gap-2">
        <Target className="mt-0.5 h-5 w-5 flex-shrink-0 text-cta" />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {isHebrew ? "יעד הפרישה שלך" : "Your retirement goal"}
          </p>
          <p className="text-2xl font-semibold text-text-primary tabular-nums">
            <bdi>{formatCurrency(goalMonthly, fullLocale)}</bdi>
            <span className="text-sm text-text-muted ms-1">
              {isHebrew ? "/חודש" : "/mo"}
            </span>
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-text-muted">
            {isHebrew ? "תחזית נוכחית" : "Currently projected"}
          </span>
          <span className={onTrack ? "text-gain font-medium" : "text-loss font-medium"}>
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-background">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
            className={`absolute inset-y-0 start-0 rounded-full ${onTrack ? "bg-gain" : "bg-loss"}`}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
          <span><bdi>{formatCurrency(projectedFull, fullLocale)}</bdi></span>
          <span><bdi>{formatCurrency(goalMonthly, fullLocale)}</bdi></span>
        </div>
      </div>

      {/* Gap insight */}
      {!onTrack && gap > 0 && (
        <div className="rounded-lg bg-background/50 p-3">
          <p className="text-xs text-text-muted">
            {isHebrew ? "פער עד היעד" : "Gap to goal"}
          </p>
          <p className="text-lg font-semibold text-loss tabular-nums">
            <bdi>{formatCurrency(gap, fullLocale)}</bdi>
            <span className="text-xs text-text-muted ms-1">
              {isHebrew ? "/חודש" : "/mo"}
            </span>
          </p>
          {suggestedExtra > 0 && yearsLeft && (
            <p className="mt-2 text-xs text-text-primary">
              <Sparkles className="inline h-3 w-3 text-cta" />{" "}
              {isHebrew
                ? `הוסף כ-${formatCurrency(Math.round(suggestedExtra), fullLocale)} להפקדה החודשית כדי לסגור את הפער ב-${yearsLeft} שנים`
                : `Add ~${formatCurrency(Math.round(suggestedExtra), fullLocale)}/mo to deposits to close the gap in ${yearsLeft} years`}
            </p>
          )}
        </div>
      )}

      {onTrack && (
        <div className="rounded-lg bg-gain/10 p-3">
          <p className="text-sm font-medium text-gain">
            {isHebrew ? "אתה בדרך הנכונה!" : "You're on track!"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {isHebrew
              ? `תחזית של ${formatCurrency(projectedFull, fullLocale)} עומדת ביעד שלך`
              : `Projected ${formatCurrency(projectedFull, fullLocale)} meets your goal`}
          </p>
        </div>
      )}
    </motion.div>
  );
}
