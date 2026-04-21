"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { Check, ChevronDown, Plus, Settings, Users } from "lucide-react";
import { clsx } from "clsx";
import { MemberAvatar } from "./MemberAvatar";
import { MemberFormModal } from "./MemberFormModal";
import { useActiveMember, type InitialActive } from "@/lib/hooks/use-active-member";
import type { Member } from "@/lib/types";

interface MemberSwitcherProps {
  members: Member[];
  variant?: "compact" | "full";
  /**
   * Server-resolved active member passed down from the layout so the picker
   * starts in sync with what the server rendered — no hydration mismatch, no
   * flash to is_self after navigation that strips ?member= from the URL.
   */
  initialActive?: InitialActive;
}

/**
 * Member switcher pill + dropdown.
 *
 * - `compact` (default) — used in the mobile top bar; shows just the active
 *   avatar + name as a tappable pill.
 * - `full` — used in the desktop sidebar; shows the same chip but full-width
 *   so it has the visual weight of a primary nav element.
 *
 * The dropdown lists "All household" + each member + an "Add member" CTA + a
 * "Manage" link to settings.
 */
export function MemberSwitcher({ members, variant = "compact", initialActive }: MemberSwitcherProps) {
  const t = useTranslations("household");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { activeMemberId, setActive } = useActiveMember(members, initialActive);

  // Click-outside / Esc to close
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeMember =
    activeMemberId !== "all"
      ? members.find((m) => m.id === activeMemberId) ?? null
      : null;

  const triggerLabel =
    activeMemberId === "all" ? t("allMembers") : activeMember?.name ?? "—";

  function handleSelect(id: string | "all") {
    setActive(id);
    setOpen(false);
  }

  const isFull = variant === "full";

  return (
    <div ref={containerRef} className={clsx("relative", isFull && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          "group inline-flex items-center gap-2 rounded-full bg-surface px-2.5 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer",
          "min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-cta",
          isFull && "w-full justify-between px-3 py-2"
        )}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {activeMember ? (
            <MemberAvatar member={activeMember} size="sm" />
          ) : (
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background text-text-muted flex-shrink-0"
              aria-hidden="true"
            >
              <Users size={14} />
            </span>
          )}
          <span className={clsx("truncate", !isFull && "max-w-[140px]")}>{triggerLabel}</span>
        </span>
        <ChevronDown
          size={14}
          className={clsx(
            "flex-shrink-0 text-text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            role="menu"
            className={clsx(
              "absolute z-50 mt-2 overflow-hidden rounded-xl border border-surface-hover bg-surface shadow-2xl",
              isFull ? "w-full" : "min-w-[14rem] start-0"
            )}
          >
            <div className="py-1">
              <DropdownItem
                active={activeMemberId === "all"}
                onClick={() => handleSelect("all")}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background text-text-muted">
                  <Users size={14} />
                </span>
                <span className="flex-1 truncate">{t("allMembers")}</span>
                {activeMemberId === "all" && (
                  <Check size={14} className="text-cta" />
                )}
              </DropdownItem>

              <div className="my-1 h-px bg-surface-hover" aria-hidden="true" />

              {members.map((m) => (
                <DropdownItem
                  key={m.id}
                  active={activeMemberId === m.id}
                  onClick={() => handleSelect(m.id)}
                >
                  <MemberAvatar member={m} size="sm" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {activeMemberId === m.id && (
                    <Check size={14} className="text-cta" />
                  )}
                </DropdownItem>
              ))}

              <div className="my-1 h-px bg-surface-hover" aria-hidden="true" />

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowAddModal(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background text-cta">
                  <Plus size={14} />
                </span>
                <span className="flex-1 text-start">{t("add")}</span>
              </button>

              <Link
                href={`/${locale}/settings#household`}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background text-text-muted">
                  <Settings size={14} />
                </span>
                <span className="flex-1 text-start">{t("manage")}</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAddModal && (
        <MemberFormModal
          mode="create"
          existingColors={members.map((m) => m.avatar_color)}
          onClose={() => setShowAddModal(false)}
          onSaved={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function DropdownItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!active}
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer",
        active
          ? "bg-surface-hover/60 text-text-primary"
          : "text-text-primary hover:bg-surface-hover"
      )}
    >
      {children}
    </button>
  );
}
