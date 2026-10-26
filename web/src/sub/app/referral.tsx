// The Mini App's referral screen, while the admin has the program on: the account's link to
// the bot, to copy, share or show as a QR code, and the friends who came by it. The same as
// the bot's "Invite a friend".
import { useEffect, useState } from "react";
import { QR } from "../../components/ui";
import { t } from "../../i18n";
import { initData, openOutside, postJSON, subRoot } from "../net";
import { IconCopy, IconGift, IconLoader } from "./icons";
import { useStore } from "./store";
import { Button, Card, Footnote, haptic, Title, TopBar } from "./ui";

type Referral = { Enabled: boolean; Link: string; Days: number; Invited: number; Paid: number; Earned: number; Waiting: number };

let known: Referral | null = null;

/** The account's program, asked once per visit; null until it comes or without Telegram. */
export function useReferral(): Referral | null {
  const [ref, setRef] = useState(known);
  useEffect(() => {
    if (known || !initData) return;
    postJSON<Referral>(subRoot + "/tg/referral", { init_data: initData })
      .then((r) => {
        if (!r.ok) return;
        known = r.data as Referral;
        setRef(known);
      })
      .catch(() => undefined);
  }, []);
  return ref;
}

export function Referral() {
  const { toast } = useStore();
  const [ref, setRef] = useState<Referral | null>(known);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Fresh numbers on every visit: a friend may have paid since.
    postJSON<Referral>(subRoot + "/tg/referral", { init_data: initData })
      .then((r) => {
        if (!r.ok) return setFailed(true);
        known = r.data as Referral;
        setRef(known);
      })
      .catch(() => setFailed(true));
  }, []);
  const copy = () => {
    if (!ref?.Link) return;
    navigator.clipboard.writeText(ref.Link).then(
      () => {
        haptic();
        toast(t("common.linkCopied"));
      },
      () => toast(t("common.copyFailed"), "err"),
    );
  };
  const share = () => {
    if (!ref?.Link) return;
    haptic();
    openOutside(`https://t.me/share/url?url=${encodeURIComponent(ref.Link)}&text=${encodeURIComponent(t("sub.app.refShareText"))}`);
  };
  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.refTop")} bottom={t("sub.app.refBottom")} bg={<IconGift size={280} strokeWidth={2.2} />} />
      {failed && !ref ? (
        <Card className="card-pad">
          <p className="muted-text">{t("sub.app.refFailed")}</p>
        </Card>
      ) : !ref ? (
        <Card className="card-pad">
          <IconLoader className="spin" aria-label={t("sub.app.refLoading")} />
        </Card>
      ) : !ref.Enabled ? (
        <Card className="card-pad">
          <p className="muted-text">{t("sub.app.refOff")}</p>
        </Card>
      ) : (
        <>
          <Card className="card-pad">
            <p className="muted-text">{t("sub.app.refHint", { n: ref.Days })}</p>
            {ref.Link ? (
              <>
                <label className="label mt">{t("sub.app.refLink")}</label>
                <div className="mono-box">{ref.Link}</div>
                <div className="ref-actions">
                  <Button variant="primary" onClick={share}>
                    {t("sub.app.refShare")}
                  </Button>
                  <Button onClick={copy}>
                    <IconCopy size={20} aria-hidden /> {t("sub.app.refCopy")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="muted-text">{t("sub.app.refNoLink")}</p>
            )}
          </Card>
          <Card className="card-pad">
            <label className="label">{t("sub.app.refStats")}</label>
            <dl className="ref-stats">
              <div>
                <dt>{t("sub.app.refInvited")}</dt>
                <dd>{ref.Invited}</dd>
              </div>
              <div>
                <dt>{t("sub.app.refPaid")}</dt>
                <dd>{ref.Paid}</dd>
              </div>
              <div>
                <dt>{t("sub.app.refEarned")}</dt>
                <dd>{t("sub.app.refDays", { n: ref.Earned })}</dd>
              </div>
            </dl>
            {ref.Waiting > 0 ? <p className="muted-text">{t("sub.app.refWaiting", { n: ref.Waiting })}</p> : null}
          </Card>
          {ref.Link ? (
            <Card>
              <div className="card-pad wizard-qr">
                <label className="label">{t("sub.app.refQR")}</label>
                <QR value={ref.Link} size={240} label={t("sub.app.refQR")} />
              </div>
            </Card>
          ) : null}
          <Footnote>{t("sub.app.refNote")}</Footnote>
        </>
      )}
    </div>
  );
}
