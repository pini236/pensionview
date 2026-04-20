"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_HEX,
  nextAvatarColor,
} from "@/lib/avatar";
import type { AvatarColor, Member, Relationship } from "@/lib/types";

interface MemberFormModalProps {
  mode: "create" | "edit";
  initialMember?: Member;
  /** Avatar colors already used by other household members — used to default a fresh pick. */
  existingColors?: AvatarColor[];
  onClose: () => void;
  onSaved?: (m: Member) => void;
}

const RELATIONSHIPS: Relationship[] = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "other",
];

export function MemberFormModal({
  mode,
  initialMember,
  existingColors = [],
  onClose,
  onSaved,
}: MemberFormModalProps) {
  const t = useTranslations("household");
  const tRel = useTranslations("relationship");
  const locale = useLocale();
  const isHe = locale === "he";

  const formId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState(initialMember?.name ?? "");
  const [nationalId, setNationalId] = useState(initialMember?.national_id ?? "");
  const [relationship, setRelationship] = useState<Relationship>(
    initialMember?.relationship && initialMember.relationship !== "self"
      ? initialMember.relationship
      : "spouse"
  );
  const [dob, setDob] = useState(initialMember?.date_of_birth ?? "");
  const [color, setColor] = useState<AvatarColor>(
    initialMember?.avatar_color ?? nextAvatarColor(existingColors)
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function validate(): string | null {
    if (!name.trim()) {
      return isHe ? "שם הוא שדה חובה" : "Name is required";
    }
    if (nationalId && !/^\d{9}$/.test(nationalId)) {
      return isHe
        ? "תעודת זהות חייבת להיות 9 ספרות"
        : "National ID must be 9 digits";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        national_id: nationalId || null,
        relationship,
        date_of_birth: dob || null,
        avatar_color: color,
      };
      const url =
        mode === "create"
          ? "/api/members"
          : `/api/members/${initialMember!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error ||
            (isHe ? "שמירה נכשלה" : "Save failed")
        );
      }
      const saved = (await res.json().catch(() => null)) as
        | { member?: Member }
        | Member
        | null;
      const member =
        (saved && "member" in saved && saved.member) ||
        (saved as Member) ||
        ({} as Member);
      onSaved?.(member);
      onClose();
      // Optimistic + reload-driven refresh: callers like settings will
      // typically `router.refresh()` themselves.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "create" ? t("add") : t("edit");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-title`}
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="flex w-full max-h-[90vh] max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-background/40 p-6 pb-4">
            <h2
              id={`${formId}-title`}
              className="text-lg font-semibold text-text-primary"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={isHe ? "סגור" : "Close"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <Field label={isHe ? "שם" : "Name"} htmlFor={`${formId}-name`}>
              <input
                id={`${formId}-name`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-cta"
              />
            </Field>

            <Field
              label={isHe ? "תעודת זהות (אופציונלי)" : "National ID (optional)"}
              htmlFor={`${formId}-nid`}
              hint={isHe ? "9 ספרות" : "9 digits"}
            >
              <input
                id={`${formId}-nid`}
                type="text"
                inputMode="numeric"
                pattern="\d{9}"
                maxLength={9}
                value={nationalId ?? ""}
                onChange={(e) =>
                  setNationalId(e.target.value.replace(/[^\d]/g, ""))
                }
                className="w-full rounded-lg bg-background px-3 py-2 text-sm tabular-nums text-text-primary outline-none focus:ring-2 focus:ring-cta"
              />
            </Field>

            <Field
              label={isHe ? "קרבה" : "Relationship"}
              htmlFor={`${formId}-rel`}
            >
              <select
                id={`${formId}-rel`}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as Relationship)}
                className="w-full rounded-lg bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-cta"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {tRel(r)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label={isHe ? "תאריך לידה (אופציונלי)" : "Date of birth (optional)"}
              htmlFor={`${formId}-dob`}
            >
              <input
                id={`${formId}-dob`}
                type="date"
                value={dob ?? ""}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-cta"
              />
            </Field>

            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                {isHe ? "צבע אווטאר" : "Avatar color"}
              </p>
              <div className="flex gap-2">
                {AVATAR_COLORS.map((c) => {
                  const selected = c === color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-pressed={selected}
                      aria-label={c}
                      className={clsx(
                        "h-8 w-8 rounded-full transition-transform cursor-pointer",
                        selected
                          ? "ring-2 ring-offset-2 ring-offset-surface ring-text-primary scale-110"
                          : "hover:scale-105"
                      )}
                      style={{ backgroundColor: AVATAR_COLOR_HEX[c] }}
                    />
                  );
                })}
              </div>
            </div>

            {error && (
                <p className="text-sm text-loss" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-background/40 p-6 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
              >
                {isHe ? "ביטול" : "Cancel"}
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? isHe
                    ? "שומר..."
                    : "Saving..."
                  : isHe
                    ? "שמור"
                    : "Save"}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 flex items-center justify-between text-xs font-medium text-text-muted"
      >
        <span>{label}</span>
        {hint && <span className="text-text-muted/70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
