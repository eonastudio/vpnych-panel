// The Mini App's support by tickets, when the admin turned it on: the account's tickets, one
// ticket's messages, a new message and closing one. The same tickets as in the bot; the admin
// answers in the panel and the answer also comes in the bot.
import { useEffect, useState, type FormEvent } from "react";
import { t } from "../../i18n";
import { dateShort, time } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { initData, openOutside, postJSON, subRoot } from "../net";
import { IconHeadphones, IconLoader } from "./icons";
import { useStore } from "./store";
import { Button, Card, Footnote, haptic, Title, TopBar } from "./ui";

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

let known: boolean | null = null;

/** Whether the support button opens the tickets: asked once per visit. */
export function useTicketsOn(): boolean {
  const [on, setOn] = useState(known ?? false);
  useEffect(() => {
    if (known !== null || !initData) return;
    call<List>({ action: "list" })
      .then((r) => {
        known = r.ok && !!r.data.enabled;
        setOn(known);
      })
      .catch(() => undefined);
  }, []);
  return on;
}

/** What the support button does: the tickets while they are on, else the admin's support
 *  link; null for neither. */
export function useSupport(): (() => void) | null {
  const { info, push } = useStore();
  const on = useTicketsOn();
  const link = safeHref(info?.support_url, { tg: true });
  if (on) return () => push({ name: "support" });
  return link ? () => openOutside(link) : null;
}

const when = (unix: number) => {
  const d = new Date(unix * 1000).toISOString();
  return `${dateShort(d)} ${time(d)}`;
};

/** The account's tickets and a new one. */
export function Support() {
  const { push } = useStore();
  const [list, setList] = useState<List | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    call<List>({ action: "list" })
      .then((r) => (r.ok ? setList(r.data as List) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.ticketsTop")} bottom={t("sub.app.ticketsBottom")} bg={<IconHeadphones size={280} strokeWidth={2.2} />} />
      {failed ? (
        <Card className="card-pad">
          <p className="muted-text">{t("sub.app.ticketsFailed")}</p>
        </Card>
      ) : !list ? (
        <Card className="card-pad">
          <IconLoader className="spin" aria-label={t("sub.app.ticketsLoading")} />
        </Card>
      ) : !list.enabled ? (
        <Card className="card-pad">
          <p className="muted-text">{t("sub.app.ticketsOff")}</p>
        </Card>
      ) : (
        <>
          <Compose ticket={0} maxBody={list.max_body} maxOpen={list.max_open} onSent={(tk) => push({ name: "ticket", id: tk.ID })} />
          <Card className="list-card">
            <div className="card-pad pb0">
              <label className="label">{t("sub.app.ticketsList")}</label>
            </div>
            {list.tickets.length ? (
              list.tickets.map((tk) => (
                <div key={tk.ID} className="faq">
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      push({ name: "ticket", id: tk.ID });
                    }}
                  >
                    <span>
                      {tk.Unread ? "🔔 " : ""}
                      {tk.Subject}
                      <span className="muted"> · {t(`sub.app.ticketStatus.${tk.Status}`)}</span>
                    </span>
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">{t("sub.app.ticketsEmpty")}</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** One ticket: its messages, an answer and closing it. */
export function TicketThread({ id }: { id: number }) {
  const { toast } = useStore();
  const [data, setData] = useState<{ ticket: Ticket; messages: Message[] } | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const load = () =>
    call<{ ticket: Ticket; messages: Message[] }>({ action: "thread", id })
      .then((r) => (r.ok ? setData(r.data as { ticket: Ticket; messages: Message[] }) : setError(refusal(r.data && (r.data as { code?: string }).code))))
      .catch(() => setError(t("sub.app.ticketsFailed")));
  useEffect(() => {
    void load();
    // The answer may come while the screen is open.
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const close = async () => {
    setClosing(true);
    try {
      const r = await call<{ ok: boolean }>({ action: "close", id });
      if (!r.ok) toast(refusal((r.data as { code?: string }).code), "err");
      else {
        toast(t("sub.app.ticketsClosed"));
        await load();
      }
    } catch {
      toast(t("sub.app.ticketsFailed"), "err");
    } finally {
      setClosing(false);
    }
  };
  const tk = data?.ticket;
  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={tk ? tk.Subject : t("sub.app.ticketsTop")} bottom={tk ? t(`sub.app.ticketStatus.${tk.Status}`) : ""} />
      {error && !data ? (
        <Card className="card-pad">
          <p className="muted-text">{error}</p>
        </Card>
      ) : !data ? (
        <Card className="card-pad">
          <IconLoader className="spin" aria-label={t("sub.app.ticketsLoading")} />
        </Card>
      ) : (
        <>
          <Card className="card-pad">
            <ol className="ticket-thread">
              {data.messages.map((m) => (
                <li key={m.ID} className={m.FromAdmin ? "ticket-msg from-support" : "ticket-msg"}>
                  <div className="muted">
                    {m.FromAdmin ? t("sub.app.ticketsSupport") : t("sub.app.ticketsYou")} · {when(m.CreatedAt)}
                  </div>
                  <p>{[m.Photo ? t("sub.app.ticketsPhoto") : "", m.Body].filter(Boolean).join(" ")}</p>
                </li>
              ))}
            </ol>
          </Card>
          <Compose ticket={id} onSent={() => void load()} />
          {tk && tk.Status !== "closed" ? (
            <Button className="mt" loading={closing} onClick={() => void close()}>
              {t("sub.app.ticketsClose")}
            </Button>
          ) : null}
          <Footnote>{t("sub.app.ticketsBotNote")}</Footnote>
        </>
      )}
    </div>
  );
}

/** A new ticket (ticket 0) or an answer in one. */
function Compose({ ticket, maxBody = 4000, maxOpen = 5, onSent }: { ticket: number; maxBody?: number; maxOpen?: number; onSent: (t: Ticket) => void }) {
  const { toast } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await call<{ ticket: Ticket }>({ action: "post", id: ticket, text: text.trim() });
      if (!r.ok || !r.data.ticket) {
        setError(refusal((r.data as { code?: string }).code, maxOpen));
        return;
      }
      haptic();
      setText("");
      toast(t("sub.app.ticketsSent"));
      onSent(r.data.ticket);
    } catch {
      setError(t("sub.app.ticketsFailed"));
    } finally {
      setBusy(false);
    }
  };
  const field = `ticket-text-${ticket}`;
  return (
    <Card className="card-pad">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="label" htmlFor={field}>
          {ticket ? t("sub.app.ticketsAnswer") : t("sub.app.ticketsNew")}
        </label>
        <textarea
          id={field}
          className="input"
          rows={4}
          value={text}
          maxLength={maxBody}
          placeholder={ticket ? t("sub.app.ticketsAnswerPlaceholder") : t("sub.app.ticketsNewPlaceholder")}
          aria-invalid={!!error}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <Button variant={text.trim() ? "primary" : "glass"} type="submit" className="mt" loading={busy} disabled={!text.trim()}>
          {t("sub.app.ticketsSend")}
        </Button>
      </form>
    </Card>
  );
}
