// The Mini App's home: who is signed in, the subscription's term and traffic, its devices,
// the promo code and the help; for an account without a subscription, the ways to get one.
import { BookOpen, Ellipsis, Hourglass, Laptop, Layers, LifeBuoy, Pencil, Plus, RefreshCw, Smartphone, Ticket, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { t, tMaybe } from "../../i18n";
import { DEVICE_NAME_MAX, desktopOS, deviceDetails, deviceLabel, reportedName } from "../../lib/devices";
import { ago, bytes, dateLong, dateShort, expiryText, period, time } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { initData, openOutside, outside, postJSON, subRoot, tgEvent } from "../net";
import { FREE_FAIL, type ShopData } from "../shop";
import type { Device, Info } from "../types";
import { PaperPlane, RubleTags } from "./art";
import { useInfo, useStore, type ShopKind } from "./store";
import { Avatar, Button, Card, Footnote, Sheet, Title } from "./ui";

type TgUser = { first_name?: string; last_name?: string; username?: string; photo_url?: string };

/** The account Telegram signed the launch data for. */
const tgUser: TgUser = (() => {
  try {
    return (JSON.parse(new URLSearchParams(initData).get("user") ?? "{}") as TgUser) ?? {};
  } catch {
    return {};
  }
})();

function greeting(): string {
  const h = new Date().getHours();
  return t(h < 5 ? "sub.app.greetNight" : h < 12 ? "sub.app.greetMorning" : h < 18 ? "sub.app.greetDay" : h < 23 ? "sub.app.greetEvening" : "sub.app.greetNight");
}

/** A pause in hours, whole days as days. */
function pause(hours: number): string {
  return hours % 24 === 0 ? t("sub.periodDays", { n: hours / 24 }) : t("sub.pauseHours", { n: hours });
}

function deviceName(d: Device): string {
  return d.shared && !d.name ? t("sub.sharedPlace") : deviceLabel(d, t("sub.device"));
}

function UserHeader() {
  const { info, push, page, subURL } = useStore();
  const [open, setOpen] = useState(false);
  const name = tgUser.first_name || t("sub.app.guest");
  const support = safeHref(info?.support_url, { tg: true });
  const go = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="user-header-wrap">
      {open ? <div className="menu-dim" onClick={() => setOpen(false)} /> : null}
      <div className="user-header glass">
        <div className="user-row">
          <Avatar url={tgUser.photo_url} name={name} />
          <div className="user-names">
            <div className="user-nick">{greeting()}</div>
            <div className="user-name">{name}</div>
          </div>
          <button type="button" className="icon-btn" aria-label={t("sub.app.menu")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={26} aria-hidden /> : <Ellipsis size={26} aria-hidden />}
          </button>
        </div>
        {open ? (
          <div className="user-menu" role="menu">
            {page.docs.length && subURL ? (
              <button type="button" role="menuitem" onClick={go(() => push({ name: "docs" }))}>
                <BookOpen size={22} aria-hidden /> {t("sub.docs")}
              </button>
            ) : null}
            <button type="button" role="menuitem" onClick={go(() => push({ name: "promo" }))}>
              <Ticket size={22} aria-hidden /> {t("sub.promoTitle")}
            </button>
            {info?.reissue ? (
              <button type="button" role="menuitem" onClick={go(() => push({ name: "reissue" }))}>
                <RefreshCw size={22} aria-hidden /> {t("sub.reissueTitle")}
              </button>
            ) : null}
            {support ? (
              <button type="button" role="menuitem" onClick={go(() => openOutside(support))}>
                <LifeBuoy size={22} aria-hidden /> {t("sub.support")}
              </button>
            ) : null}
            <hr />
            <button type="button" role="menuitem" className="danger" onClick={go(() => tgEvent("web_app_close"))}>
              <X size={22} aria-hidden /> {t("common.close")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubsSwitch() {
  const { subs, subURL, setSubURL } = useStore();
  if (subs.length < 2) return null;
  return (
    <div className="subs" role="group" aria-label={t("sub.app.subs")}>
      {subs.map((s) => {
        const url = subRoot + "/" + s.token;
        return (
          <button key={s.token} type="button" aria-pressed={url === subURL} onClick={() => setSubURL(url)}>
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

function StatusCard() {
  const info = useInfo();
  const { shop, push } = useStore();
  const left = info.expires_at ? expiryText(info.expires_at) : null;
  const firstName = info.name.split(/\s+/)[0] ?? "";
  const support = safeHref(info.support_url, { tg: true });
  const selling = !!shop?.offers.length;
  const ended = info.state === "expired" || info.state === "limited" || info.state === "disabled";
  const used = info.used_up + info.used_down;
  const extra = info.extra ?? 0;
  const cap = info.limit != null ? Math.max(info.limit, used) + extra : 0;
  const leftBytes = info.limit != null ? Math.max(0, info.limit - used) + extra : null;
  const ofTotal = (limit: number, more: number) => t("sub.of", { total: more > 0 ? t("sub.plusPackages", { limit: bytes(limit), extra: bytes(more) }) : bytes(limit) });
  return (
    <Card className="status-card">
      <div className="days-left">{t("sub.app.subLabel")}</div>
      <div className="balance-row">
        <div className="balance">
          <b className={left?.tone === "bad" ? "bad-tone" : left?.tone === "warn" ? "warn-tone" : ""}>{left ? left.text : "∞"}</b>
          <span>{info.expires_at ? t("sub.app.until", { date: dateShort(info.expires_at) }) : t("sub.app.noEnd")}</span>
        </div>
        {selling ? (
          <Button variant="primary" className="topup-btn" onClick={() => push({ name: "shop", kind: "renew" })}>
            {t("sub.shop")}
          </Button>
        ) : support && ended ? (
          <a className="btn btn-primary topup-btn" href={support} target="_blank" rel="noreferrer noopener" {...outside(support)}>
            {t("sub.renew")}
          </a>
        ) : null}
      </div>
      <p className="state-line">
        {t(`sub.status.${info.state}`, { name: firstName })}
        {info.expires_at ? ` · ${dateLong(info.expires_at)}` : ""}
      </p>
      <div className="traffic">
        <div className="traffic-head">
          <span>{t("sub.app.traffic")}</span>
          <b>{info.limit != null ? `${bytes(used)} ${ofTotal(info.limit, extra)}` : `${bytes(used)} · ${t("sub.unlimited")}`}</b>
        </div>
        {info.limit != null ? (
          <div className={`bar ${leftBytes === 0 ? "full" : ""}`}>
            <i style={{ width: `${cap ? Math.min(100, (used / cap) * 100) : 0}%` }} />
          </div>
        ) : null}
        {info.resets_at ? <small>{t("sub.app.resets", { date: dateShort(info.resets_at) })}</small> : null}
      </div>
      {info.pools?.map((pool) => (
        <div key={pool.name} className="traffic">
          <div className="traffic-head">
            <span>{pool.name}</span>
            <b>{pool.limit != null ? `${bytes(pool.used)} ${ofTotal(pool.limit, pool.extra ?? 0)}` : `${bytes(pool.used)} · ${t("sub.poolUnlimited")}`}</b>
          </div>
          {pool.limit != null ? (
            <div className={`bar ${pool.used >= pool.limit && !pool.extra ? "full" : ""}`}>
              <i style={{ width: `${Math.min(100, (pool.used / (Math.max(pool.limit, pool.used) + (pool.extra ?? 0) || 1)) * 100)}%` }} />
            </div>
          ) : null}
          {pool.limit != null && pool.used >= pool.limit && !pool.extra ? <small>{t("sub.poolOut")}</small> : null}
        </div>
      ))}
      {info.device_limit || info.speed_limit ? (
        <div className="facts">
          {info.device_limit ? <span className="fact">{t(info.device_mode === "online" ? "sub.upToOnline" : "sub.upTo", { n: info.device_limit })}</span> : null}
          {info.speed_limit ? <span className="fact">{t("sub.speedUpTo", { n: info.speed_limit })}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

function DevicesCard() {
  const info = useInfo();
  const { push } = useStore();
  const [open, setOpen] = useState<number | null>(null);
  const list = info.devices ?? [];
  const online = info.device_mode === "online";
  const full = !online && info.device_limit > 0 && list.length >= info.device_limit;
  const wait = info.unbind_after && new Date(info.unbind_after).getTime() > Date.now() ? info.unbind_after : "";
  const returnHours = info.return_hours ?? 0;
  const left = info.unbinds_left ?? -1;
  const off = !!info.unbind_off;
  const note = [
    t("sub.devicesNote"),
    online ? t("sub.devicesNoteOnline") : "",
    off ? t("sub.unbindOff") : "",
    !off && left >= 0 && !wait ? t("sub.unbindLeft", { left, limit: info.unbind_limit ?? 0, period: period(info.unbind_days ?? 1) }) : "",
    !off && returnHours > 0 ? t("sub.returnNote", { pause: pause(returnHours) }) : "",
    !off && returnHours < 0 ? t("sub.returnNever") : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shown = list.find((d) => d.id === open);
  return (
    <Card className="devices-card" label={t("sub.app.devices")}>
      <div className="devices-head">
        <div>
          <h2 className="h-display">{t("sub.app.devices")}</h2>
          {info.device_limit > 0 ? (
            <span className="hint">{online ? t("sub.devicesOnline", { limit: info.device_limit }) : t("sub.devicesCount", { n: list.length, limit: info.device_limit })}</span>
          ) : null}
        </div>
        <button type="button" className="fab" aria-label={t("sub.app.addDevice")} onClick={() => push({ name: "wizard" })}>
          <Plus size={40} aria-hidden />
        </button>
      </div>
      {full ? <p className="warn soft" style={{ margin: "16px 36px 0" }}>{t("sub.devicesFull")}</p> : null}
      {wait && list.length ? (
        <p className="warn soft" style={{ margin: "16px 36px 0" }} role="status">
          <Hourglass size={16} aria-hidden style={{ display: "inline", verticalAlign: -3, marginRight: 6 }} />
          {t("sub.unbindLimitTitle")} {t("sub.unbindAfter", { date: dateShort(wait), time: time(wait) })}
        </p>
      ) : null}
      {list.length === 0 ? (
        <p className="empty-devices">{t("sub.devicesEmpty")}</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {list.map((d) => {
            const meta = deviceDetails(d, !d.shared);
            return (
              <button key={d.id} type="button" className="device-row" onClick={() => setOpen(d.id)}>
                <span className="device-icon" aria-hidden>
                  {d.shared ? <Layers size={30} /> : desktopOS.test(d.os) ? <Laptop size={30} /> : <Smartphone size={30} />}
                </span>
                <span className="device-text">
                  <b>{deviceName(d)}</b>
                  <small>
                    {meta ? `${meta} · ` : ""}
                    {d.used ? `${bytes(d.used)} · ` : ""}
                    {ago(d.last_seen)}
                  </small>
                </span>
                <Pencil size={20} className="muted" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
      <p className="devices-note">{note}</p>
      {shown ? <DeviceSheet key={shown.id} d={shown} canUnbind={!off && !wait} returnHours={returnHours} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

/** One device: its own name, and the unbinding that frees its place. */
function DeviceSheet({ d, canUnbind, returnHours, onClose }: { d: Device; canUnbind: boolean; returnHours: number; onClose: () => void }) {
  const { subURL, reload, toast } = useStore();
  const id = useId();
  const [name, setName] = useState(d.name);
  const [busy, setBusy] = useState<"" | "save" | "unbind">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const clean = name.trim();
  const label = deviceName(d);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || clean === d.name) return;
    setBusy("save");
    setError("");
    try {
      const r = await postJSON<{ code: string }>(`${subURL}/devices/${d.id}/name`, { name: clean });
      if (r.ok) {
        await reload();
        onClose();
        return;
      }
      setError((r.data.code && tMaybe(`sub.nameErrors.${r.data.code}`)) || t("sub.renameFailed"));
    } catch {
      setError(t("sub.renameFailed"));
    } finally {
      setBusy("");
    }
  };

  const unbind = async () => {
    setBusy("unbind");
    setError("");
    try {
      const r = await postJSON<{ unbind_after: string }>(`${subURL}/devices/${d.id}/unbind`);
      if (r.status === 429) {
        setError(r.data.unbind_after ? t("sub.unbindAfter", { date: dateShort(r.data.unbind_after), time: time(r.data.unbind_after) }) : t("sub.unbindFailed"));
        setConfirm(false);
        return;
      }
      if (!r.ok) {
        setError(t("sub.unbindFailed"));
        setConfirm(false);
        return;
      }
      await reload();
      toast(t("common.delete") + ": " + label);
      onClose();
    } catch {
      setError(t("sub.unbindFailed"));
    } finally {
      setBusy("");
    }
  };

  return (
    <Sheet onClose={onClose} label={label}>
      <h2 className="sheet-title">{label}</h2>
      <form onSubmit={(e) => void save(e)} noValidate>
        <label htmlFor={id} className="label">
          {t("sub.renameField")}
        </label>
        <input
          id={id}
          className="input"
          value={name}
          maxLength={DEVICE_NAME_MAX}
          placeholder={(d.shared ? t("sub.sharedPlace") : reportedName(d)) || t("sub.device")}
          autoComplete="off"
          aria-invalid={!!error}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="muted-text" style={{ fontSize: 14 }}>
          {t("sub.renameHint")}
        </p>
        <div className="stack">
          <Button variant="primary" type="submit" loading={busy === "save"} disabled={!!busy || clean === d.name}>
            {t("common.save")}
          </Button>
        </div>
      </form>
      {canUnbind ? (
        confirm ? (
          <div className="stack" role="group" aria-label={t("sub.unbindLabel", { name: label })}>
            <p className="warn" style={{ marginTop: 0 }}>
              {t("sub.unbindWarn")}
              {returnHours !== 0 && !d.shared ? " " + (returnHours < 0 ? t("sub.unbindWarnNever") : t("sub.unbindWarnReturn", { pause: pause(returnHours) })) : ""}
            </p>
            <div className="row-half" style={{ marginTop: 0 }}>
              <Button variant="glass" disabled={!!busy} onClick={() => setConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="glass" className="danger-btn" loading={busy === "unbind"} onClick={() => void unbind()}>
                {t("sub.unbindYes")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <Button variant="ghost" className="danger-btn" disabled={!!busy} onClick={() => setConfirm(true)}>
              {t("sub.unbind")}
            </Button>
          </div>
        )
      ) : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function PromoCard() {
  const { push, promoCode } = useStore();
  return (
    <Card className="art-card">
      <RubleTags className="art art-right" />
      <h2 className="h-display">
        {t("sub.app.promoAsk")}
        <br />
        <em>{t("sub.app.promoWord")}</em>
      </h2>
      {promoCode ? <p className="ok-text" style={{ position: "relative" }}>{t("sub.promoSelected", { code: promoCode })}</p> : null}
      <div className="art-actions">
        <Button variant="primary" onClick={() => push({ name: "promo" })}>
          {t("sub.app.promoOpen")}
        </Button>
      </div>
    </Card>
  );
}

function HelpCard() {
  const { info, page, push, subURL } = useStore();
  const docs = page.docs.length > 0 && !!subURL;
  const support = safeHref(info?.support_url, { tg: true });
  if (!support && !docs) return null;
  return (
    <Card className="art-card mirror">
      <PaperPlane className="art art-left" />
      <h2 className="h-display">
        {t("sub.app.helpTop")}
        <br />
        <em>{t("sub.app.helpBottom")}</em>
      </h2>
      <p className="muted-text" style={{ position: "relative", marginLeft: "auto", maxWidth: "70%" }}>
        {t("sub.app.supportText")}
      </p>
      <div className="art-actions">
        {docs ? (
          <Button variant="glass" onClick={() => push({ name: "docs" })} aria-label={t("sub.docs")}>
            <BookOpen size={26} aria-hidden />
          </Button>
        ) : null}
        {support ? (
          <a className="btn btn-primary" href={support} target="_blank" rel="noreferrer noopener" {...outside(support)}>
            {t("sub.support")}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/** What else is on sale: traffic and a device for the subscription, a new one, the trial. */
function Extras({ forNew }: { forNew: boolean }) {
  const { shop, packages, push } = useStore();
  const rows: { kind: ShopKind; title: string; text: string }[] = [];
  if (!forNew && packages?.packages?.length) rows.push({ kind: "packages", title: t("sub.packages"), text: t("sub.packagesPick") });
  if (!forNew && packages?.device) rows.push({ kind: "device", title: t("sub.device"), text: packages.device.description || t("sub.devicePick") });
  if (shop?.trial) rows.push({ kind: "trial", title: t("sub.trialTitle"), text: shop.trial.description || t("sub.trialPick") });
  if (shop?.allow_new && shop.offers.length) rows.push({ kind: forNew ? "new" : "new", title: t(forNew ? "sub.shop" : "sub.shopNew"), text: t("sub.shopPick") });
  if (!rows.length) return null;
  return (
    <Card className="list-card">
      {rows.map((r) => (
        <button key={r.kind + r.title} type="button" className="list-row" onClick={() => push({ name: "shop", kind: r.kind })}>
          <span className="row-main">
            <b>{r.title}</b>
            <small>{r.text}</small>
          </span>
          <span className="row-price">›</span>
        </button>
      ))}
    </Card>
  );
}

/** The free plan: one tap gives the subscription. */
function FreeCard({ offer }: { offer: NonNullable<ShopData["free"]> }) {
  const { session, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const take = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJSON<{ token: string; code: string }>(subRoot + "/tg/free", { init_data: initData });
      if (r.ok && r.data.token) {
        await session();
        refresh();
        return;
      }
      const code = r.data.code ?? "";
      setError(code === "free_channel" ? t("sub.freeChannelNeeded") : t(FREE_FAIL[code] ?? "sub.freeFail"));
    } catch {
      setError(t("sub.freeFail"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="offer" label={t("sub.freeTitle")}>
      <div className="offer-head">
        <h2>{offer.name}</h2>
        <span className="gift" aria-hidden>
          🎁
        </span>
      </div>
      <div className="offer-body">{offer.description || t("sub.freeAgain")}</div>
      <div className="offer-foot stack" style={{ marginTop: 0 }}>
        <Button variant="primary" loading={busy} onClick={() => void take()}>
          {t("sub.freeTake")}
        </Button>
        {offer.channel ? (
          <Button variant="glass" onClick={() => openOutside(offer.channel!)}>
            {t("sub.freeJoin")}
          </Button>
        ) : null}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Announce({ info }: { info: Info }) {
  if (!info.announce) return null;
  const href = safeHref(info.announce_url, { tg: true });
  return (
    <Card className="card-pad" label={t("sub.announceMore")}>
      <p className="note">{info.announce}</p>
      {href ? (
        <div className="stack">
          <a className="btn btn-glass" href={href} target="_blank" rel="noreferrer noopener" {...outside(href)}>
            {t("sub.announceMore")}
          </a>
        </div>
      ) : null}
    </Card>
  );
}

export function Home() {
  const info = useInfo();
  const { page } = useStore();
  return (
    <main className="screen home">
      <UserHeader />
      <SubsSwitch />
      <StatusCard />
      <Announce info={info} />
      <DevicesCard />
      <Extras forNew={false} />
      <PromoCard />
      <HelpCard />
      <Footnote>{page.brand || info.brand}</Footnote>
    </main>
  );
}

/** An account without a subscription: the free plan, the trial, the plans on sale. */
export function NoSub() {
  const { shop, info, page } = useStore();
  const support = safeHref(info?.support_url, { tg: true });
  const selling = !!(shop?.free || shop?.trial || (shop?.allow_new && shop.offers.length));
  return (
    <main className="screen home">
      <UserHeader />
      <Title top={t("sub.app.noSubTop")} bottom={t("sub.app.noSubBottom")} />
      {selling ? null : (
        <Card className="card-pad">
          <h2 className="h-display sm">{t("sub.tgNoSubTitle")}</h2>
          <p className="muted-text">{t("sub.tgNoSubText")}</p>
          {support ? (
            <div className="stack">
              <a className="btn btn-primary" href={support} target="_blank" rel="noreferrer noopener" {...outside(support)}>
                {t("sub.support")}
              </a>
            </div>
          ) : null}
        </Card>
      )}
      {shop?.free ? <FreeCard offer={shop.free} /> : null}
      <Extras forNew />
      <PromoCard />
      <HelpCard />
      <Footnote>{page.brand}</Footnote>
    </main>
  );
}
