"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Pencil, Plus, Trash2, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MemberAvatar } from "./MemberAvatar";
import { MemberFormModal } from "./MemberFormModal";
import { createClient } from "@/lib/supabase/client";
import type { AvatarColor, Member, Relationship } from "@/lib/types";

interface RawProfile {
  id: string;
  name: string | null;
  national_id: string | null;
  relationship: Relationship | null;
  avatar_color: AvatarColor | null;
  is_self: boolean | null;
  date_of_birth: string | null;
  deleted_at: string | null;
  household_id: string | null;
}

function toMember(p: RawProfile): Member {
  return {
    id: p.id,
    name: p.name ?? "—",
    relationship: (p.relationship ?? "self") as Relationship,
    avatar_color: (p.avatar_color ?? "blue") as AvatarColor,
    is_self: !!p.is_self,
    date_of_birth: p.date_of_birth ?? null,
    national_id: p.national_id ?? null,
  };
}

export function HouseholdSection() {
  const t = useTranslations("household");
  const tRel = useTranslations("relationship");
  const locale = useLocale();
  const isHe = locale === "he";

  const [active, setActive] = useState<Member[]>([]);
  const [archived, setArchived] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: self } = await supabase
        .from("profiles")
        .select("household_id")
        .eq("email", user.email)
        .eq("is_self", true)
        .maybeSingle();

      if (!self?.household_id) {
        setActive([]);
        setArchived([]);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select(
          "id, name, national_id, relationship, avatar_color, is_self, date_of_birth, deleted_at, household_id"
        )
        .eq("household_id", self.household_id)
        .order("is_self", { ascending: false })
        .order("created_at", { ascending: true });

      const all = (data ?? []) as RawProfile[];
      setActive(all.filter((p) => p.deleted_at == null).map(toMember));
      setArchived(all.filter((p) => p.deleted_at != null).map(toMember));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(member: Member) {
    setError(null);
    try {
      const res = await fetch(`/api/members/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || (isHe ? "מחיקה נכשלה" : "Delete failed"));
      }
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRestore(member: Member) {
    setError(null);
    try {
      // Backend may not have shipped restore yet; degrade gracefully.
      const res = await fetch(`/api/members/${member.id}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || (isHe ? "שחזור לא זמין כרגע" : "Restore unavailable")
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section
      id="household"
      className="rounded-xl bg-surface p-4 scroll-mt-20"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Users size={18} className="text-text-muted" />
          {t("title")}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cta px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
        >
          <Plus size={14} />
          {t("add")}
        </button>
      </div>

      {error && (
        <p className="mb-3 text-xs text-loss" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-text-muted">
          {isHe ? "טוען..." : "Loading..."}
        </p>
      ) : active.length === 0 ? (
        <p className="text-xs text-text-muted">
          {isHe
            ? "לא נמצאו בני משפחה. הוסף את הראשון."
            : "No members yet. Add your first."}
        </p>
      ) : (
        <ul className="space-y-2">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-background p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <MemberAvatar member={m} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {m.name}
                    {m.is_self && (
                      <span className="ms-2 rounded-full bg-surface px-1.5 py-0.5 text-xs font-normal uppercase tracking-wide text-text-muted">
                        {tRel("self")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {tRel(m.relationship)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  aria-label={isHe ? "ערוך" : "Edit"}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                {!m.is_self && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(m)}
                    aria-label={isHe ? "הסר" : "Remove"}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-loss/15 hover:text-loss cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowArchive((s) => !s)}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${showArchive ? "rotate-180" : ""}`}
          />
          {t("archive")}
          {archived.length > 0 && (
            <span className="text-text-muted">({archived.length})</span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {showArchive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2">
                {archived.length === 0 ? (
                  <p className="text-xs text-text-muted">{t("noArchive")}</p>
                ) : (
                  archived.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-background/60 p-2 opacity-70"
                    >
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={m} size="sm" />
                        <span className="text-xs text-text-primary">
                          {m.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore(m)}
                        className="text-xs text-cta hover:underline cursor-pointer"
                      >
                        {t("restore")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showAdd && (
        <MemberFormModal
          mode="create"
          existingColors={active.map((m) => m.avatar_color)}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}

      {editing && (
        <MemberFormModal
          mode="edit"
          initialMember={editing}
          existingColors={active
            .filter((m) => m.id !== editing.id)
            .map((m) => m.avatar_color)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          member={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
          confirmText={t("deleteConfirm").replace("{name}", confirmDelete.name)}
          cancelLabel={isHe ? "ביטול" : "Cancel"}
          confirmLabel={isHe ? "הסר" : "Remove"}
        />
      )}
    </section>
  );
}

function ConfirmDeleteModal({
  member,
  onCancel,
  onConfirm,
  confirmText,
  cancelLabel,
  confirmLabel,
}: {
  member: Member;
  onCancel: () => void;
  onConfirm: () => void;
  confirmText: string;
  cancelLabel: string;
  confirmLabel: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <MemberAvatar member={member} size="md" />
          <p className="text-sm text-text-primary">{confirmText}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-primary cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-loss px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
