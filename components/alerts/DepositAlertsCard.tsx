"use client";
import { motion } from "motion/react";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLocale } from "next-intl";
import type { DepositAlert } from "@/lib/insights/deposit-alerts";

export function DepositAlertsCard({ alerts }: { alerts: DepositAlert[] }) {
  const locale = useLocale();
  const isHebrew = locale === "he";

  if (alerts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 rounded-xl border border-gain/20 bg-surface p-4"
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-gain" />
        <div>
          <p className="text-sm font-medium text-text-primary">
            {isHebrew ? "כל ההפקדות תקינות" : "All deposits look healthy"}
          </p>
          <p className="text-xs text-text-muted">
            {isHebrew ? "אין חריגות בחודשים האחרונים" : "No anomalies detected"}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-loss" />
        <h3 className="text-sm font-semibold text-text-primary">
          {isHebrew ? `${alerts.length} התראות הפקדה` : `${alerts.length} deposit ${alerts.length === 1 ? "alert" : "alerts"}`}
        </h3>
      </div>
      {alerts.map((alert, i) => {
        const Icon = alert.severity === "high" ? AlertCircle : AlertTriangle;
        const accent = alert.severity === "high" ? "border-loss/40 bg-loss/5" : "border-loss/20 bg-surface";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-start gap-3 rounded-xl border ${accent} p-3`}
          >
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-loss" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary break-words">
                {isHebrew ? alert.message : alert.messageEn}
              </p>
              <p className="truncate text-xs text-text-muted">{alert.provider}</p>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
