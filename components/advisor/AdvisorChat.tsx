"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocale } from "next-intl";
import { Sparkles, Send, X } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AdvisorChat() {
  const locale = useLocale();
  const isHebrew = locale === "he";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const suggestions = isHebrew
    ? ["מתי אוכל לפרוש?", "האם דמי הניהול שלי גבוהים?", "מה התשואה החודשית הכי טובה שלי?"]
    : ["When can I retire?", "Are my fees high?", "What's my best-performing fund?"];

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, locale }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: isHebrew ? "שגיאה בקבלת תשובה" : "Error getting reply" },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: isHebrew ? "שגיאה בהתחברות" : "Connection error" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating launcher button */}
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-cta text-background shadow-[0_8px_24px_-8px_rgba(34,197,94,0.6)] cursor-pointer lg:bottom-8"
        aria-label={isHebrew ? "פתח יועץ" : "Open advisor"}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={22} />
            </motion.div>
          ) : (
            <motion.div key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Sparkles size={22} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-44 end-4 z-40 flex h-[min(640px,80vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl lg:bottom-28"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-background/40 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cta/15">
                <Sparkles size={16} className="text-cta" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {isHebrew ? "יועץ פנסיה" : "Pension Advisor"}
                </p>
                <p className="text-xs text-text-muted">
                  {isHebrew ? "מבוסס על הנתונים שלך" : "Powered by your data"}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-text-muted">
                    {isHebrew
                      ? "שאל אותי כל דבר על הפנסיה והחסכון שלך"
                      : "Ask me anything about your pension and savings"}
                  </p>
                  <div className="space-y-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full rounded-lg bg-background px-3 py-2 text-start text-sm text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-cta text-background" : "bg-background text-text-primary"
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-background px-3 py-2 text-sm text-text-muted">
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">·</span>
                      <span className="animate-pulse delay-100">·</span>
                      <span className="animate-pulse delay-200">·</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-center gap-2 border-t border-background/40 p-3"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isHebrew ? "שאל שאלה..." : "Ask a question..."}
                className="flex-1 rounded-lg bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-cta"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-cta text-background transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
