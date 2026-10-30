import { ArrowLeft, Headphones } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui";
import { t } from "../i18n";
import { dateShort, time } from "../lib/format";
import { initData, postJSON, subRoot } from "./net";

type Ticket = { ID: number; Subject: string; Status: "open" | "answered" | "closed"; Unread: boolean; CreatedAt: number; UpdatedAt: number };
type Message = { ID: number; FromAdmin: boolean; Body: string; Photo: string; CreatedAt: number };
type List = { enabled: boolean; tickets: Ticket[]; max_open: number; max_body: number };

const call = <T,>(body: Record<string, unknown>) => postJSON<T>(subRoot + "/tg/tickets", { init_data: initData, ...body });

/** Why the panel refused, in the account's words. */
function refusal(code: string | undefined, maxOpen = 5): string {
  switch (code) {
    case "ticket_many":
      return t("sub.app.ticketsMany", { n: maxOpen });
    case "ticket_empty":
      return t("sub.app.ticketsEmptyMsg");
    case "ticket_off":
      return t("sub.app.ticketsOff");
    case "ticket_gone":
      return t("sub.app.ticketsGone");
  }
  return t("sub.app.ticketsFailed");
}

const when = (unix: number) => {
  const d = new Date(unix * 1000).toISOString();
  return `${dateShort(d)} ${time(d)}`;
};

/**
 * Support by tickets in the Mini App, while the admin has them on: a new ticket, the
 * account's tickets and one ticket's messages in place of the list. The same tickets as in
 * the bot; the admin answers in the panel and the answer also comes in the bot.
 */
export function TicketsSection() {
  const [list, setList] = useState<List | null>(null);
  const [open, setOpen] = useState(0);
  const load = () =>
    call<List>({ action: "list" })
      .then((r) => r.ok && setList(r.data as List))
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);
  // Off, or not answered: the page has the support link of its own.
  if (!list?.enabled) return null;
  return (
    <section className="glass sub-card p-4" aria-labelledby="tickets-title">
      <div className="mb-2 flex items-center gap-2">
        <Headphones size={16} className="text-[var(--ink-600)]" aria-hidden />
        <h2 id="tickets-title" className="text-[15px] font-semibold">
          {t("sub.app.ticketsTop")}
        </h2>
      </div>
      {open ? (
        <Thread
          id={open}
          onBack={() => {
            setOpen(0);
            void load();
          }}
        />
      ) : (
        <>
          <Compose ticket={0} maxBody={list.max_body} maxOpen={list.max_open} onSent={(tk) => setOpen(tk.ID)} />
          <div className="mt-4 border-t border-[var(--hairline)] pt-3">
            <div className="mb-2 text-xs font-semibold">{t("sub.app.ticketsList")}</div>
            {list.tickets.length ? (
              <ul className="flex flex-col gap-1">
                {list.tickets.map((tk) => (
                  <li key={tk.ID}>
                    <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-[13px] hover:bg-[var(--hover)]" onClick={() => setOpen(tk.ID)}>
                      {tk.Unread ? "🔔 " : ""}
                      <span className="font-medium">{tk.Subject}</span>
                      <span className="text-[var(--ink-500)]"> · {t(`sub.app.ticketStatus.${tk.Status}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-[var(--ink-500)]">{t("sub.app.ticketsEmpty")}</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** One ticket: its messages, an answer and closing it. */
function Thread({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<{ ticket: Ticket; messages: Message[] } | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const load = () =>
    call<{ ticket: Ticket; messages: Message[] }>({ action: "thread", id })
      .then((r) => (r.ok ? setData(r.data as { ticket: Ticket; messages: Message[] }) : setError(refusal((r.data as { code?: string }).code))))
      .catch(() => setError(t("sub.app.ticketsFailed")));
  useEffect(() => {
    void load();
    // The answer may come while the ticket is open.
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const close = async () => {
    setClosing(true);
    setError("");
    try {
      const r = await call<{ ok: boolean }>({ action: "close", id });
      if (!r.ok) setError(refusal((r.data as { code?: string }).code));
      else await load();
    } catch {
      setError(t("sub.app.ticketsFailed"));
    } finally {
      setClosing(false);
    }
  };
  const tk = data?.ticket;
  return (
    <div>
      <button type="button" className="link-btn mb-2 flex items-center gap-1 text-xs" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden />
        {t("sub.app.ticketsList")}
      </button>
      {tk ? (
        <p className="text-[13px] font-semibold">
          {tk.Subject} <span className="font-normal text-[var(--ink-500)]">· {t(`sub.app.ticketStatus.${tk.Status}`)}</span>
        </p>
      ) : null}
      {data ? (
        <ol className="mt-2 flex flex-col gap-2">
          {data.messages.map((m) => (
            <li key={m.ID} className={"rounded-2xl p-3 text-[13px] " + (m.FromAdmin ? "bg-[var(--leaf-50)]" : "bg-[var(--hover)]")}>
              <div className="mb-1 text-xs text-[var(--ink-500)]">
                {m.FromAdmin ? t("sub.app.ticketsSupport") : t("sub.app.ticketsYou")} · {when(m.CreatedAt)}
              </div>
              <p className="whitespace-pre-wrap break-words">{[m.Photo ? t("sub.app.ticketsPhoto") : "", m.Body].filter(Boolean).join(" ")}</p>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p className="text-xs text-[var(--ink-500)]" role="status">
          {t("sub.app.ticketsLoading")}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[13px] text-[var(--berry-600)]" role="alert">
          {error}
        </p>
      ) : null}
      {tk && tk.Status !== "closed" ? (
        <>
          <Compose ticket={id} onSent={() => void load()} />
          <div className="mt-2">
            <Button variant="ghost" size="sm" loading={closing} onClick={() => void close()}>
              {t("sub.app.ticketsClose")}
            </Button>
          </div>
        </>
      ) : null}
      <p className="mt-3 text-xs text-[var(--ink-500)]">{t("sub.app.ticketsBotNote")}</p>
    </div>
  );
}

/** A new ticket (ticket 0) or an answer in one. */
function Compose({ ticket, maxBody = 4000, maxOpen = 5, onSent }: { ticket: number; maxBody?: number; maxOpen?: number; onSent: (t: Ticket) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setSent(false);
    try {
      const r = await call<{ ticket: Ticket }>({ action: "post", id: ticket, text: text.trim() });
      if (!r.ok || !r.data.ticket) {
        setError(refusal((r.data as { code?: string }).code, maxOpen));
        return;
      }
      setText("");
      setSent(true);
      onSent(r.data.ticket);
    } catch {
      setError(t("sub.app.ticketsFailed"));
    } finally {
      setBusy(false);
    }
  };
  const field = `ticket-text-${ticket}`;
  return (
    <form className="mt-3" onSubmit={(e) => void submit(e)} noValidate>
      <label className="mb-1 block text-xs font-semibold" htmlFor={field}>
        {ticket ? t("sub.app.ticketsAnswer") : t("sub.app.ticketsNew")}
      </label>
      <textarea
        id={field}
        className="input"
        rows={3}
        value={text}
        maxLength={maxBody}
        placeholder={ticket ? t("sub.app.ticketsAnswerPlaceholder") : t("sub.app.ticketsNewPlaceholder")}
        aria-invalid={!!error}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? (
        <p className="mt-2 text-[13px] text-[var(--berry-600)]" role="alert">
          {error}
        </p>
      ) : sent ? (
        <p className="mt-2 text-xs text-[var(--leaf-600)]" role="status">
          {t("sub.app.ticketsSent")}
        </p>
      ) : null}
      <div className="mt-2">
        <Button variant="primary" size="sm" type="submit" loading={busy} disabled={!text.trim()}>
          {t("sub.app.ticketsSend")}
        </Button>
      </div>
    </form>
  );
}
