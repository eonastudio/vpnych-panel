// The Mini App's home: who is signed in, then the template's blocks in its order (the
// subscription's term, its devices, the shop, the promo code, the help, the admin's own
// texts and links) and its banners; for an account without a subscription, the ways to get one.
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { t, tMaybe } from "../../i18n";
import { Markdown } from "../../lib/markdown";
import { DEVICE_NAME_MAX, desktopOS, deviceDetails, deviceLabel, reportedName } from "../../lib/devices";
import { ago, bytes, dateLong, dateShort, expiryText, period, time } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { initData, openOutside, outside, postJSON, subRoot, tgEvent } from "../net";
import { bannersAt, type PageBanner, type PageBlock, type Template } from "../page";
import { FREE_FAIL, groupText, listPrice, type Offer, type ShopData } from "../shop";
import type { Device, Info } from "../types";
import { PaperPlane, RubleTags } from "./art";
import {
  IconArrowRight,
  IconBook,
  IconCheck,
  IconChevronDown,
  IconDevices,
  IconDots,
  IconHeadphones,
  IconHelp,
  IconLayers,
  IconLogout,
  IconPlus,
  IconRefresh,
  IconSliders,
  IconTicket,
  IconTrash,
  IconX,
  PlatformIcon,
} from "./icons";
import { usePromo } from "./promo";
import { useInfo, useStore, type ShopKind } from "./store";
import { Avatar, Button, Card, Footnote, haptic, Sheet, Title } from "./ui";

type TgUser = { first_name?: string; last_name?: string; username?: string; photo_url?: string };

/** The account Telegram signed the launch data for. */
export const tgUser: TgUser = (() => {
  try {
    return (JSON.parse(new URLSearchParams(initData).get("user") ?? "{}") as TgUser) ?? {};
  } catch {
    return {};
  }
})();

export const tgFullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");

/** A pause in hours, whole days as days. */
function pause(hours: number): string {
  return hours % 24 === 0 ? t("sub.periodDays", { n: hours / 24 }) : t("sub.pauseHours", { n: hours });
}

function deviceName(d: Device): string {
  return d.shared && !d.name ? t("sub.sharedPlace") : deviceLabel(d, t("sub.device"));
}

/** The platform of a device's icon, from the system its app reports. */
function platformOf(os: string): string {
  if (/ios|iphone|ipad/i.test(os)) return "ios";
  if (/tv/i.test(os)) return "tv";
  if (/android/i.test(os)) return "android";
  if (/windows/i.test(os)) return "windows";
  if (/mac|darwin/i.test(os) || desktopOS.test(os)) return "macos";
  return "";
}

function TrafficRing({ used, total }: { used: number; total: number }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  const p = total > 0 ? Math.min(used / total, 1) : 1;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="ring" aria-hidden>
      <circle cx="17" cy="17" r={r} style={{ stroke: "var(--line)" }} strokeWidth="3" fill="none" />
      <circle cx="17" cy="17" r={r} stroke="#e8c547" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={`${c * Math.max(p, 0.04)} ${c}`} transform="rotate(-90 17 17)" />
    </svg>
  );
}

const bannerKey = (url: string) => "mikan-tg-banner:" + url;

/** The account, its menu, and a limited plan's traffic under them. */
export function UserHeader({ showBanner = true }: { showBanner?: boolean }) {
  const { info, subs, subURL, setSubURL, push, page } = useStore();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(bannerKey(subURL)) === "1";
    } catch {
      return false;
    }
  });
  const name = tgFullName || t("sub.app.guest");
  const support = safeHref(info?.support_url, { tg: true });
  const go = (f: () => void) => () => {
    setOpen(false);
    f();
  };

  const used = info ? info.used_up + info.used_down : 0;
  const total = info?.limit != null ? info.limit + (info.extra ?? 0) : 0;
  const banner = showBanner && !hidden && info?.limit != null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(bannerKey(subURL), "1");
    } catch {
      // the banner comes back next time
    }
  };

  return (
    <div className="user-header-wrap">
      <div className={`user-header glass ${open ? "open" : ""}`}>
        <div className="user-row">
          <Avatar url={tgUser.photo_url} name={name} size={60} />
          <div className="user-names">
            <div className="user-name">{name}</div>
            {tgUser.username ? <div className="user-nick">@{tgUser.username}</div> : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              haptic();
              setOpen((o) => !o);
            }}
            aria-label={t("sub.app.menu")}
            aria-expanded={open}
          >
            <IconDots size={26} />
          </button>
        </div>

        {banner && info ? (
          <div className="trial-banner">
            <div>
              <b>{t("sub.app.trafficLeft", { used: bytes(used), total: bytes(total) })}</b>
              <span>{info.resets_at ? t("sub.app.resets", { date: dateShort(info.resets_at) }) : used >= total ? t("sub.app.trafficOut") : t("sub.app.trafficNote")}</span>
            </div>
            <button type="button" className="ring-btn" aria-label={t("common.close")} onClick={hide}>
              <TrafficRing used={used} total={total} />
              <IconX size={12} />
            </button>
          </div>
        ) : null}

        {open ? (
          <nav className="user-menu">
            {subs.length > 1
              ? subs.map((s) => {
                  const url = subRoot + "/" + s.token;
                  return (
                    <button key={s.token} type="button" aria-pressed={url === subURL} onClick={go(() => setSubURL(url))}>
                      {url === subURL ? <IconCheck /> : <IconLayers />}
                      {s.name}
                    </button>
                  );
                })
              : null}
            {subs.length > 1 ? <hr /> : null}
            {page.docs.length && subURL ? (
              <button type="button" onClick={go(() => push({ name: "docs" }))}>
                <IconBook />
                {t("sub.docs")}
              </button>
            ) : null}
            <button type="button" onClick={go(() => push({ name: "promo" }))}>
              <IconTicket />
              {t("sub.promoTitle")}
            </button>
            {info?.reissue ? (
              <button type="button" onClick={go(() => push({ name: "reissue" }))}>
                <IconRefresh />
                {t("sub.reissueTitle")}
              </button>
            ) : null}
            {support ? (
              <button type="button" onClick={go(() => openOutside(support))}>
                <IconHeadphones />
                {t("sub.support")}
              </button>
            ) : null}
            <hr />
            <button type="button" className="danger" onClick={go(() => tgEvent("web_app_close"))}>
              <IconLogout />
              {t("common.close")}
            </button>
          </nav>
        ) : null}
      </div>
      {open ? <div className="menu-dim" onClick={() => setOpen(false)} /> : null}
    </div>
  );
}

/** The subscription's term, and the way to renew it. */
function BalanceCard() {
  const info = useInfo();
  const { shop, push } = useStore();
  const left = info.expires_at ? expiryText(info.expires_at) : null;
  const support = safeHref(info.support_url, { tg: true });
  const ended = info.state === "expired" || info.state === "limited" || info.state === "disabled";
  const firstName = info.name.split(/\s+/)[0] ?? "";
  // "47 дней" as a big number and its unit; "завтра" or "истёк 2 дня назад" stays whole.
  const count = left && !ended ? /^([\d\s  ]+)\s(.+)$/.exec(left.text) : null;
  const tone = ended ? "bad" : (left?.tone ?? "");
  const state = ended ? info.state : tone === "warn" ? "expiring" : "active";
  return (
    <Card className={`balance-card ${tone ? `tone-${tone}` : ""}`}>
      <div className="balance-head">
        <span className="label">{t("sub.app.subLabel")}</span>
        <span className="balance-chip">
          <i aria-hidden />
          {t(`sub.app.state.${state}`)}
        </span>
      </div>
      <div className="balance-main">
        {count ? (
          <b className="balance-num">
            {count[1]}
            <small>{count[2]}</small>
          </b>
        ) : (
          <b className={`balance-num ${left ? "balance-word" : ""}`}>{left ? left.text : "∞"}</b>
        )}
        <span className="balance-date">{info.expires_at ? t("sub.app.until", { date: dateLong(info.expires_at) }) : t("sub.app.noEnd")}</span>
      </div>
      {shop?.offers.length ? (
        <Button variant="primary" className="topup-btn" onClick={() => push({ name: "shop", kind: "renew" })}>
          {t("sub.shop")}
        </Button>
      ) : support ? (
        <Button variant="primary" className="topup-btn" onClick={() => openOutside(support)}>
          {t("sub.renew")}
        </Button>
      ) : null}
      {ended ? <div className="warn">{t(`sub.status.${info.state}`, { name: firstName })}</div> : null}
      {info.pools?.map((pool) =>
        pool.limit != null && pool.used >= pool.limit && !pool.extra ? (
          <div key={pool.name} className="warn">
            {pool.name}: {t("sub.poolOut")}
          </div>
        ) : null,
      )}
    </Card>
  );
}

function Announce({ info, title }: { info: Info; title?: string }) {
  if (!info.announce) return null;
  const href = safeHref(info.announce_url, { tg: true });
  return (
    <Card className="card-pad">
      {title ? <div className="label">{title}</div> : null}
      <p className="muted-text" style={{ margin: 0 }}>
        {info.announce}
      </p>
      {href ? (
        <Button className="mt" onClick={() => openOutside(href)}>
          {t("sub.announceMore")}
        </Button>
      ) : null}
    </Card>
  );
}

/** The devices the card lists before "show all". */
const DEVICES_SHOWN = 3;

function DevicesCard({ onOpen }: { onOpen: (d: Device) => void }) {
  const info = useInfo();
  const { push, toast } = useStore();
  const [all, setAll] = useState(false);
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
  const hint =
    info.device_limit > 0
      ? online
        ? t("sub.devicesOnline", { limit: info.device_limit })
        : t("sub.devicesCount", { n: list.length, limit: info.device_limit })
      : t("sub.app.howItWorks");
  return (
    <Card className="devices-card">
      <div className="devices-head">
        <div>
          <h2 className="h-display">
            {t("sub.app.devices")} <em>{list.length}</em>
          </h2>
          <button type="button" className="hint" onClick={() => toast(note)}>
            {hint} <IconHelp size={16} />
          </button>
        </div>
        <button type="button" className="fab" onClick={() => push({ name: "wizard" })} aria-label={t("sub.app.addDevice")}>
          <IconPlus size={34} strokeWidth={2.4} />
        </button>
      </div>
      {full ? (
        <div className="warn" style={{ margin: "16px 36px 0" }}>
          {t("sub.devicesFull")}
        </div>
      ) : null}
      {wait && list.length ? (
        <div className="warn" style={{ margin: "16px 36px 0" }} role="status">
          {t("sub.unbindLimitTitle")}. {t("sub.unbindAfter", { date: dateShort(wait), time: time(wait) })}
        </div>
      ) : null}
      {list.length === 0 ? <div className="empty-devices">{t("sub.app.devicesEmpty")}</div> : null}
      {(all ? list : list.slice(0, DEVICES_SHOWN)).map((d) => {
        const meta = deviceDetails(d, !d.shared);
        const platform = platformOf(d.os);
        return (
          <button
            key={d.id}
            type="button"
            className="device-row"
            onClick={() => {
              haptic();
              onOpen(d);
            }}
          >
            <span className="device-icon">{d.shared ? <IconLayers size={30} /> : platform ? <PlatformIcon platform={platform} /> : <IconDevices size={30} />}</span>
            <span className="device-text">
              <b>{deviceName(d)}</b>
              <small>
                {meta ? `${meta} · ` : ""}
                {d.used ? `${bytes(d.used)} · ` : ""}
                {ago(d.last_seen)}
              </small>
            </span>
            <IconSliders className="muted" size={28} />
          </button>
        );
      })}
      {list.length > DEVICES_SHOWN ? (
        <button
          type="button"
          className="devices-more"
          aria-expanded={all}
          onClick={() => {
            haptic();
            setAll((a) => !a);
          }}
        >
          {all ? t("sub.app.devicesLess") : t("sub.app.devicesMore", { n: list.length })}
          <IconChevronDown size={22} className={all ? "flip" : ""} aria-hidden />
        </button>
      ) : null}
    </Card>
  );
}

/** One device: its own name, and the unbinding that frees its place. */
function DeviceSheet({ d, onClose }: { d: Device; onClose: () => void }) {
  const info = useInfo();
  const { subURL, reload, toast } = useStore();
  const id = useId();
  const [name, setName] = useState(d.name);
  const [busy, setBusy] = useState<"" | "save" | "unbind">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const clean = name.trim();
  const label = deviceName(d);
  const wait = !!info.unbind_after && new Date(info.unbind_after).getTime() > Date.now();
  const canUnbind = !info.unbind_off && !wait;
  const returnHours = info.return_hours ?? 0;

  const save = async () => {
    if (busy) return;
    if (clean === d.name) {
      onClose();
      return;
    }
    setBusy("save");
    setError("");
    try {
      const r = await postJSON<{ code: string }>(`${subURL}/devices/${d.id}/name`, { name: clean });
      if (r.ok) {
        await reload();
        toast(t("sub.app.saved"));
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
      toast(t("sub.app.unbound"));
      onClose();
    } catch {
      setError(t("sub.unbindFailed"));
    } finally {
      setBusy("");
    }
  };

  return (
    <Sheet onClose={onClose} label={label}>
      <h3 className="sheet-title">{t("sub.app.deviceSettings")}</h3>
      {wait && info.unbind_after ? <div className="warn">{t("sub.unbindAfter", { date: dateShort(info.unbind_after), time: time(info.unbind_after) })}</div> : null}

      <label htmlFor={id} className="label">
        {t("sub.app.deviceName")}
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
        onKeyDown={(e) => e.key === "Enter" && void save()}
      />

      {confirm ? (
        <>
          <div className="warn">
            {t("sub.unbindWarn")}
            {returnHours !== 0 && !d.shared ? " " + (returnHours < 0 ? t("sub.unbindWarnNever") : t("sub.unbindWarnReturn", { pause: pause(returnHours) })) : ""}
          </div>
          <div className="row-half">
            <Button disabled={!!busy} onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="danger-btn" loading={busy === "unbind"} onClick={() => void unbind()}>
              {t("sub.unbindYes")}
            </Button>
          </div>
        </>
      ) : canUnbind ? (
        <div className="row-2 mt">
          <Button loading={busy === "save"} onClick={() => void save()}>
            {t("common.save")}
          </Button>
          <Button className="danger-btn square" disabled={!!busy} onClick={() => setConfirm(true)} aria-label={t("sub.unbindLabel", { name: label })}>
            <IconTrash />
          </Button>
        </div>
      ) : (
        <Button className="mt" loading={busy === "save"} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      )}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function PromoCard() {
  const { push, promoCode, toast } = useStore();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const promo = usePromo(() => {
    setEditing(false);
    setCode("");
  });

  const activate = async () => {
    if (!code.trim()) {
      input.current?.focus();
      return;
    }
    const why = await promo.apply(code);
    if (why) {
      tgEvent("web_app_trigger_haptic_feedback", { type: "notification", notification_type: "error" });
      toast(why, "err");
    }
  };

  return (
    <Card className="promo-card art-card">
      <RubleTags className="art art-right" />
      {editing ? (
        <input
          ref={input}
          className="promo-input h-display"
          placeholder={t("sub.promoCode")}
          value={code}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void activate()}
          onBlur={() => !code && setEditing(false)}
        />
      ) : (
        <h2 className="h-display">{promoCode || t("sub.promoCode")}</h2>
      )}
      <div className="art-actions">
        {editing ? (
          <Button variant="primary" loading={promo.busy} onMouseDown={(e) => e.preventDefault()} onClick={() => void activate()}>
            {t("sub.app.activate")}
          </Button>
        ) : (
          <>
            <Button onClick={() => setEditing(true)}>{t("sub.app.promoOpen")}</Button>
            <Button className="square" aria-label={t("sub.promoTitle")} onClick={() => push({ name: "promo" })}>
              <IconTicket size={26} style={{ color: "#fff" }} />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function HelpCard() {
  const { info, page, push, subURL } = useStore();
  const docs = page.docs.length > 0 && !!subURL;
  const support = safeHref(info?.support_url, { tg: true });
  if (!support && !docs) return null;
  const rows = [
    docs ? { key: "docs", icon: <IconBook size={28} />, title: t("sub.docs"), text: t("sub.app.helpDocsText"), go: () => push({ name: "docs" }) } : null,
    support ? { key: "support", icon: <IconHeadphones size={28} />, title: t("sub.support"), text: t("sub.app.helpSupportText"), go: () => openOutside(support) } : null,
    info?.reissue ? { key: "reissue", icon: <IconRefresh size={28} />, title: t("sub.reissueTitle"), text: t("sub.app.helpReissueText"), go: () => push({ name: "reissue" }) } : null,
  ].filter((r) => r !== null);
  return (
    <Card className="help-card">
      <div className="help-head">
        <PaperPlane className="art help-art" />
        <h2 className="h-display">
          {t("sub.app.helpTop")} <em>{t("sub.app.helpBottom")}</em>
        </h2>
        <p className="muted-text">{t("sub.app.helpText")}</p>
      </div>
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          className="device-row help-row"
          onClick={() => {
            haptic();
            r.go();
          }}
        >
          <span className="device-icon">{r.icon}</span>
          <span className="device-text">
            <b>{r.title}</b>
            <small>{r.text}</small>
          </span>
          <IconArrowRight className="muted" size={24} />
        </button>
      ))}
    </Card>
  );
}

/** What else is on sale: traffic and a device for the subscription, the trial, a new one. A
 *  subscriber gets connecting one more device at the top instead of buying a new subscription. */
function Extras({ forNew, skipTrial }: { forNew: boolean; skipTrial?: boolean }) {
  const { shop, packages, push } = useStore();
  const rows: { key: string; title: string; text: string; go: () => void }[] = [];
  const buy = (kind: ShopKind) => () => push({ name: "shop", kind });
  if (!forNew) rows.push({ key: "wizard", title: t("sub.app.addDevice"), text: t("sub.app.addDeviceText"), go: () => push({ name: "wizard" }) });
  if (!forNew && packages?.packages?.length) rows.push({ key: "packages", title: t("sub.packages"), text: t("sub.packagesPick"), go: buy("packages") });
  if (!forNew && packages?.device) rows.push({ key: "device", title: t("sub.device"), text: packages.device.description || t("sub.devicePick"), go: buy("device") });
  if (shop?.trial && !skipTrial) rows.push({ key: "trial", title: t("sub.trialTitle"), text: shop.trial.description || t("sub.trialPick"), go: buy("trial") });
  if (forNew && shop?.allow_new && shop.offers.length) rows.push({ key: "new", title: t("sub.shop"), text: t("sub.shopPick"), go: buy("new") });
  if (!rows.length) return null;
  return (
    <Card className="list-card">
      {rows.map((r) => (
        <button key={r.key} type="button" className="list-row" onClick={r.go}>
          <span className="app-text">
            <b>{r.title}</b>
            <small>{r.text}</small>
          </span>
          <IconArrowRight className="muted" size={24} />
        </button>
      ))}
    </Card>
  );
}

/** A banner of the template: its picture, title, text and button. */
export function Banner({ banner: b }: { banner: PageBanner }) {
  const href = safeHref(b.button.url, { tg: true });
  const body = b.title || b.text || (href && b.button.label);
  return (
    <section className="card banner" data-tone={b.tone} role="note">
      {/* The picture's link is relative: the page's <base> is the subscription path. */}
      {b.image ? <img src={b.image} alt="" loading="lazy" decoding="async" /> : null}
      {body ? (
        <div className="banner-body">
          {b.title ? <b>{b.title}</b> : null}
          {b.text ? <p>{b.text}</p> : null}
          {href && b.button.label ? (
            <Button variant={b.tone === "accent" ? "glass" : "primary"} onClick={() => openOutside(href)}>
              {b.button.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The template's banners at a place of the home screen. */
export function Banners({ template, place, after }: { template: Template; place: PageBanner["place"]; after?: string }) {
  return (
    <>
      {bannersAt(template, "miniapp", place, after).map((b) => (
        <Banner key={b.id} banner={b} />
      ))}
    </>
  );
}

/** The admin's own text. */
function TextCard({ block: b }: { block: PageBlock }) {
  if (!b.text) return null;
  return (
    <Card className="card-pad">
      {b.title ? <h2 className="h-italic" style={{ marginBottom: 14 }}>{b.title}</h2> : null}
      <Markdown text={b.text} link={(href) => outside(href)} />
    </Card>
  );
}

/** The admin's own buttons. */
function LinksCard({ block: b }: { block: PageBlock }) {
  const links = (b.links ?? []).flatMap((l) => {
    const href = safeHref(l.url, { tg: true });
    return href ? [{ ...l, href }] : [];
  });
  if (!links.length) return null;
  return (
    <Card className="card-pad">
      {b.title ? <div className="label">{b.title}</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {links.map((l, i) => (
          <Button key={i} onClick={() => openOutside(l.href)}>
            {l.emoji ? <span aria-hidden>{l.emoji}</span> : null}
            {l.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export function Home() {
  const info = useInfo();
  const { page } = useStore();
  const [device, setDevice] = useState<Device | null>(null);
  const shown = device ? (info.devices ?? []).find((d) => d.id === device.id) : undefined;
  const template = page.template;
  // The help card stands for both the support and the instructions: at the first of them.
  let help = false;
  const section = (b: PageBlock): ReactNode => {
    switch (b.type) {
      case "status":
        return <BalanceCard />;
      case "announce":
        return <Announce info={info} title={b.title} />;
      case "devices":
        return <DevicesCard onOpen={setDevice} />;
      case "shop":
        return <Extras forNew={false} />;
      case "promo":
        return <PromoCard />;
      case "support":
      case "instructions":
        if (help) return null;
        help = true;
        return <HelpCard />;
      case "text":
        return <TextCard block={b} />;
      case "links":
        return <LinksCard block={b} />;
    }
    // The rest (the apps, the guide, the link, the locations) are on the setup's screens.
    return null;
  };
  return (
    <div className="screen home">
      <UserHeader />
      <Banners template={template} place="top" />
      {template.blocks.map((b) =>
        b.on ? (
          <Fragment key={b.id}>
            {section(b)}
            <Banners template={template} place="after" after={b.id} />
          </Fragment>
        ) : null,
      )}
      <Banners template={template} place="bottom" />
      {shown ? <DeviceSheet key={shown.id} d={shown} onClose={() => setDevice(null)} /> : null}
    </div>
  );
}

/** The free plan: one tap gives the subscription. */
function FreeOffer({ offer }: { offer: NonNullable<ShopData["free"]> }) {
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
    <Card className="offer">
      <div className="offer-head">
        <h2>{offer.name}</h2>
        <div className="gift" aria-hidden>
          🎁
        </div>
      </div>
      <dl className="rows">
        <div>
          <dt>{offer.description || t("sub.freeAgain")}</dt>
        </div>
      </dl>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="primary" loading={busy} onClick={() => void take()}>
        {t("sub.freeTake")}
      </Button>
      {offer.channel ? (
        <Button className="mt" onClick={() => openOutside(offer.channel!)}>
          {t("sub.freeJoin")}
        </Button>
      ) : null}
    </Card>
  );
}

/** The trial on sale, laid out like a gift. */
function TrialOffer({ offer }: { offer: Offer }) {
  const { push } = useStore();
  return (
    <Card className="offer">
      <div className="offer-head">
        <h2>{offer.name}</h2>
        <div className="gift" aria-hidden>
          🎁
        </div>
      </div>
      <dl className="rows">
        {offer.groups?.map((g) => (
          <div key={g.name}>
            <dt>{groupText(g)}</dt>
            <dd>{g.name}</dd>
          </div>
        ))}
        {offer.description ? (
          <div>
            <dt>{offer.description}</dt>
          </div>
        ) : null}
        <div>
          <dt>{listPrice(offer)}</dt>
          <dd>{t("sub.app.price")}</dd>
        </div>
      </dl>
      <Button variant="primary" onClick={() => push({ name: "shop", kind: "trial" })}>
        {t("sub.app.try")}
      </Button>
    </Card>
  );
}

/** An account without a subscription: the free plan, the trial, the plans on sale. */
export function NoSub() {
  const { shop, info } = useStore();
  const support = safeHref(info?.support_url, { tg: true });
  const selling = !!(shop?.free || shop?.trial || (shop?.allow_new && shop.offers.length));
  const top = shop?.free ? "sub.app.freeTop" : shop?.trial ? "sub.app.trialTop" : "sub.app.noSubTop";
  const bottom = shop?.free ? "sub.app.freeBottom" : shop?.trial ? "sub.app.trialBottom" : "sub.app.noSubBottom";
  return (
    <div className="screen">
      <UserHeader showBanner={false} />
      <Title top={t(top)} bottom={t(bottom)} />
      {shop?.free ? <FreeOffer offer={shop.free} /> : shop?.trial ? <TrialOffer offer={shop.trial} /> : null}
      {selling ? null : (
        <Card className="card-pad">
          <p className="muted-text" style={{ margin: 0 }}>
            {t("sub.tgNoSubText")}
          </p>
          {support ? (
            <Button variant="primary" className="mt" onClick={() => openOutside(support)}>
              <IconHeadphones />
              {t("sub.support")}
            </Button>
          ) : null}
        </Card>
      )}
      <Extras forNew skipTrial={!shop?.free && !!shop?.trial} />
      <PromoCard />
      <HelpCard />
      {shop?.trial && !shop.free ? <Footnote>{t("sub.trialPick")}</Footnote> : null}
    </div>
  );
}
