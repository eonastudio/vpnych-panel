// Support by tickets: the clients write in the bot or the Mini App, the admin reads the
// threads here and answers; the answer reaches the client in the bot.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, MessagesSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, basePath, errorText, unwrap, type Schemas } from "../../api/client";
import { Confirm, Drawer } from "../../components/overlay";
import { QueryBoundary } from "../../components/query";
import { SwitchRow } from "../../components/switch";
import { useToast } from "../../components/toast";
import { Button, EmptyState, PageHeader, Pill, Segmented, Skeleton } from "../../components/ui";
import { t } from "../../i18n";
import { ago, dateTime } from "../../lib/format";

type Ticket = Schemas["TicketView"];
type Filter = "open" | "answered" | "closed" | "";

const TONE = { open: "warn", answered: "ok", closed: "off" } as const;
// A page of tickets; the next one starts after the last one shown.
const PAGE = 50;

const who = (tk: Ticket) => (tk.tg_username ? `@${tk.tg_username}` : tk.tg_name || `tg ${tk.tg_id}`);

export function TicketsPage() {
  const [status, setStatus] = useState<Filter>("open");
  const [opened, setOpened] = useState<number | null>(null);
  const list = useInfiniteQuery({
    queryKey: ["tickets", status],
    initialPageParam: { at: 0, id: 0 },
    queryFn: ({ pageParam, signal }) =>
      unwrap(api.GET("/api/v1/tickets", { params: { query: { status, before_at: pageParam.at || undefined, before_id: pageParam.id || undefined, limit: PAGE } }, signal })),
    getNextPageParam: (last) => {
      const end = last.items[last.items.length - 1];
      return last.items.length === PAGE && end ? { at: Math.floor(Date.parse(end.updated_at) / 1000), id: end.id } : undefined;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const head = list.data?.pages[0];
  const label = (s: "open" | "answered" | "closed") => {
    const c = head?.counts[s];
    return c && c.all ? `${t(`tickets.status.${s}`)} · ${c.all}` : t(`tickets.status.${s}`);
  };
  return (
    <>
      <PageHeader title={t("tickets.title")} sub={t("tickets.sub")} />
      <div className="flex max-w-5xl flex-col gap-4">
        <Settings />
        <section className="card glass reveal" aria-label={t("tickets.title")}>
          <div className="mb-4 max-w-full overflow-x-auto">
            <Segmented
              label={t("tickets.filter")}
              value={status}
              onChange={(v) => setStatus(v as Filter)}
              options={[
                { value: "open", label: label("open") },
                { value: "answered", label: label("answered") },
                { value: "closed", label: label("closed") },
                { value: "", label: t("tickets.all") },
              ]}
            />
          </div>
          <QueryBoundary query={list} pending={<Skeleton style={{ height: 240, borderRadius: 16 }} />}>
            {(v) => {
              const items = v.pages.flatMap((p) => p.items);
              return items.length === 0 ? (
                <EmptyState icon={MessagesSquare} title={status === "open" ? t("tickets.emptyOpen") : t("tickets.empty")} text={t("tickets.emptyText")} />
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {items.map((tk) => (
                      <li key={tk.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3 text-left hover:bg-[var(--surface)]"
                          onClick={() => setOpened(tk.id)}
                        >
                          {tk.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label={t("tickets.unread")} /> : <span className="h-2 w-2 shrink-0" />}
                          <span className="min-w-0 flex-1">
                            <span className={tk.unread ? "block truncate font-semibold" : "block truncate"}>{tk.subject}</span>
                            <span className="block truncate text-[13px] text-[var(--ink-600)]">
                              #{tk.id} · {who(tk)} · {t(`tickets.source.${tk.source}`)} · {ago(tk.updated_at)}
                            </span>
                          </span>
                          <Pill tone={TONE[tk.status]}>{t(`tickets.status.${tk.status}`)}</Pill>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {list.hasNextPage ? (
                    <Button className="mt-3" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                      {t("tickets.more")}
                    </Button>
                  ) : null}
                </>
              );
            }}
          </QueryBoundary>
        </section>
      </div>
      <Thread id={opened} onClose={() => setOpened(null)} />
    </>
  );
}

function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["tickets-settings"], queryFn: ({ signal }) => unwrap(api.GET("/api/v1/tickets/settings", { signal })) });
  const save = useMutation({
    mutationFn: (enabled: boolean) => unwrap(api.PUT("/api/v1/tickets/settings", { body: { enabled } })),
    onSuccess: (v) => {
      qc.setQueryData(["tickets-settings"], v);
      toast.ok(v.enabled ? t("tickets.turnedOn") : t("tickets.turnedOff"));
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
  return (
    <section className="card glass reveal">
      <SwitchRow
        label={t("tickets.enabled")}
        sub={t("tickets.enabledSub")}
        checked={save.isPending ? !!save.variables : !!q.data?.enabled}
        disabled={!q.data || save.isPending}
        onChange={(v) => save.mutate(v)}
      />
    </section>
  );
}

function Thread({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const q = useQuery({
    queryKey: ["ticket", id],
    enabled: id != null,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/tickets/{id}", { params: { path: { id: id! } }, signal })),
    refetchInterval: 15_000,
  });
  const done = (v: Schemas["TicketView"] | undefined) => {
    void qc.invalidateQueries({ queryKey: ["tickets"] });
    return v;
  };
  const reply = useMutation({
    mutationFn: (body: string) => unwrap(api.POST("/api/v1/tickets/{id}/reply", { params: { path: { id: id! } }, body: { text: body } })),
    onSuccess: (v) => {
      qc.setQueryData(["ticket", id], v);
      setText("");
      done(v.ticket);
      toast.ok(t("tickets.sent"));
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const status = useMutation({
    mutationFn: (closed: boolean) => unwrap(api.POST("/api/v1/tickets/{id}/status", { params: { path: { id: id! } }, body: { closed } })),
    onSuccess: (v) => {
      qc.setQueryData(["ticket", id], v);
      done(v.ticket);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/tickets/{id}", { params: { path: { id: id! } } })),
    onSuccess: () => {
      setDeleting(false);
      done(undefined);
      onClose();
      toast.ok(t("tickets.deleted"));
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) reply.mutate(text.trim());
  };
  const tk = q.data?.ticket;
  return (
    <Drawer
      open={id != null}
      onOpenChange={(v) => !v && onClose()}
      title={tk ? tk.subject : t("tickets.title")}
      meta={tk ? `#${tk.id} · ${who(tk)} · ${t(`tickets.status.${tk.status}`)}` : null}
      wide
    >
      <QueryBoundary query={q} pending={<Skeleton style={{ height: 240, borderRadius: 16 }} />}>
        {(v) => (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-2">
              {v.messages.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.from_admin
                      ? "ml-8 rounded-2xl bg-[var(--accent-soft,var(--surface))] px-4 py-3"
                      : "mr-8 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3"
                  }
                >
                  <div className="mb-1 text-xs text-[var(--ink-500)]">
                    {m.from_admin ? t("tickets.you") : who(v.ticket)} · <time dateTime={m.created_at}>{dateTime(m.created_at)}</time>
                  </div>
                  {m.photo ? (
                    <a href={`${basePath}/api/v1/tickets/${v.ticket.id}/messages/${m.id}/photo`} target="_blank" rel="noreferrer" className="mb-2 block">
                      <img
                        src={`${basePath}/api/v1/tickets/${v.ticket.id}/messages/${m.id}/photo`}
                        alt={t("tickets.photo")}
                        loading="lazy"
                        className="max-h-64 rounded-xl object-contain"
                      />
                    </a>
                  ) : null}
                  {m.body ? <p className="whitespace-pre-wrap break-words text-[14px]">{m.body}</p> : null}
                </li>
              ))}
            </ol>
            <form onSubmit={submit} className="flex flex-col gap-2">
              <label htmlFor="ticket-reply" className="text-[13px] font-medium">
                {t("tickets.reply")}
              </label>
              <textarea
                id="ticket-reply"
                className="input min-h-[96px]"
                value={text}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("tickets.replyPlaceholder")}
              />
              <p className="text-xs text-[var(--ink-500)]">{t("tickets.replyHint")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" size="sm" loading={reply.isPending} disabled={!text.trim()}>
                  <Send size={16} aria-hidden /> {t("tickets.send")}
                </Button>
                {v.ticket.status === "closed" ? (
                  <Button size="sm" loading={status.isPending} onClick={() => status.mutate(false)}>
                    <RotateCcw size={16} aria-hidden /> {t("tickets.reopen")}
                  </Button>
                ) : (
                  <Button size="sm" loading={status.isPending} onClick={() => status.mutate(true)}>
                    <CheckCheck size={16} aria-hidden /> {t("tickets.close")}
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
                  <Trash2 size={16} aria-hidden /> {t("tickets.delete")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </QueryBoundary>
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title={t("tickets.deleteTitle")}
        text={t("tickets.deleteText")}
        confirm={t("tickets.delete")}
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Drawer>
  );
}
