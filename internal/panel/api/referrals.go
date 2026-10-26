package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"mikan/internal/panel/referral"
)

// The referral program: the admin turns it on, sets the days for a friend who paid and sees
// who brings friends.

type ReferralSettingsView struct {
	Enabled bool  `json:"enabled" doc:"У клиентов есть ссылка-приглашение в боте и Mini App"`
	Days    int64 `json:"days" minimum:"1" maximum:"365" doc:"Дней к подписке пригласившего за первую оплату друга"`
}

type ReferralTotalsView struct {
	Invited   int64 `json:"invited" doc:"Пришли по ссылкам"`
	Paid      int64 `json:"paid" doc:"Из них оплатили"`
	Earned    int64 `json:"earned" doc:"Дней начислено пригласившим"`
	Waiting   int64 `json:"waiting" doc:"Дней ждут, пока у пригласившего появится подписка"`
	Referrers int64 `json:"referrers" doc:"Сколько клиентов приглашали"`
}

type ReferrerView struct {
	TgID       int64  `json:"tg_id"`
	TgUsername string `json:"tg_username,omitempty"`
	TgName     string `json:"tg_name,omitempty"`
	Invited    int64  `json:"invited"`
	Paid       int64  `json:"paid"`
	Earned     int64  `json:"earned"`
}

type ReferralView struct {
	TgID             int64      `json:"tg_id"`
	TgUsername       string     `json:"tg_username,omitempty"`
	TgName           string     `json:"tg_name,omitempty"`
	ReferrerID       int64      `json:"referrer_id"`
	ReferrerUsername string     `json:"referrer_username,omitempty"`
	ReferrerName     string     `json:"referrer_name,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	PaidAt           *time.Time `json:"paid_at,omitempty"`
	Days             int64      `json:"days" doc:"Начислено или ждёт пригласившего; 0 — друг ещё не платил"`
	RewardedAt       *time.Time `json:"rewarded_at,omitempty"`
}

type referralsOutput struct {
	Body struct {
		Settings ReferralSettingsView `json:"settings"`
		Totals   ReferralTotalsView   `json:"totals"`
		Top      []ReferrerView       `json:"top"`
		Recent   []ReferralView       `json:"recent"`
	}
}

type referralSettingsOutput struct{ Body ReferralSettingsView }

type referralSettingsInput struct{ Body ReferralSettingsView }

func (h *handlers) registerReferrals() {
	tags := []string{"users"}
	op := sessionOps("users")
	huma.Register(h.api, huma.Operation{OperationID: "list-referrals", Method: http.MethodGet, Path: "/api/v1/referrals", Summary: "Реферальная программа: итоги и приглашения", Tags: tags}, h.listReferrals)
	huma.Register(h.api, huma.Operation{OperationID: "get-referral-settings", Method: http.MethodGet, Path: "/api/v1/referrals/settings", Summary: "Настройки реферальной программы", Tags: tags}, h.getReferralSettings)
	huma.Register(h.api, op("update-referral-settings", http.MethodPut, "/api/v1/referrals/settings", "Изменить реферальную программу", 0), h.putReferralSettings)
}

func (h *handlers) referralSettings(ctx context.Context) ReferralSettingsView {
	c := h.d.Referral.Config(ctx)
	return ReferralSettingsView{Enabled: c.Enabled, Days: c.Days}
}

func unixPtr(v int64, valid bool) *time.Time {
	if !valid {
		return nil
	}
	t := time.Unix(v, 0).UTC()
	return &t
}

func (h *handlers) listReferrals(ctx context.Context, _ *struct{}) (*referralsOutput, error) {
	if hidesPeople(ctx) {
		return nil, huma.Error403Forbidden("support_denied")
	}
	out := &referralsOutput{}
	out.Body.Settings = h.referralSettings(ctx)
	tot, err := h.d.Referral.Totals(ctx)
	if err != nil {
		return nil, err
	}
	out.Body.Totals = ReferralTotalsView{Invited: tot.Invited, Paid: tot.Paid, Earned: tot.Earned, Waiting: tot.Waiting, Referrers: tot.Referrers}
	top, err := h.d.Referral.Top(ctx, 20)
	if err != nil {
		return nil, err
	}
	out.Body.Top = make([]ReferrerView, 0, len(top))
	for _, r := range top {
		out.Body.Top = append(out.Body.Top, ReferrerView{TgID: r.Referrer, TgUsername: r.Username, TgName: r.FirstName, Invited: r.Invited, Paid: r.Paid, Earned: r.Earned})
	}
	recent, err := h.d.Referral.Recent(ctx, 50)
	if err != nil {
		return nil, err
	}
	out.Body.Recent = make([]ReferralView, 0, len(recent))
	for _, r := range recent {
		out.Body.Recent = append(out.Body.Recent, ReferralView{TgID: r.TgID, TgUsername: r.Username, TgName: r.FirstName,
			ReferrerID: r.Referrer, ReferrerUsername: r.ReferrerUsername, ReferrerName: r.ReferrerFirstName,
			CreatedAt: time.Unix(r.CreatedAt, 0).UTC(), PaidAt: unixPtr(r.PaidAt.Int64, r.PaidAt.Valid), Days: int64(r.Days),
			RewardedAt: unixPtr(r.RewardedAt.Int64, r.RewardedAt.Valid)})
	}
	return out, nil
}

func (h *handlers) getReferralSettings(ctx context.Context, _ *struct{}) (*referralSettingsOutput, error) {
	return &referralSettingsOutput{Body: h.referralSettings(ctx)}, nil
}

func (h *handlers) putReferralSettings(ctx context.Context, in *referralSettingsInput) (*referralSettingsOutput, error) {
	admin := sessionOf(ctx).AdminID
	err := h.d.Referral.SetConfig(ctx, referral.Config{Enabled: in.Body.Enabled, Days: in.Body.Days})
	if errors.Is(err, referral.ErrBadDays) {
		return nil, fieldErr("body.days", "bad_referral_days")
	}
	if err != nil {
		return nil, err
	}
	h.audit(ctx, admin, "referral.settings", "settings", referral.Key, map[string]any{"enabled": in.Body.Enabled, "days": in.Body.Days})
	return &referralSettingsOutput{Body: h.referralSettings(ctx)}, nil
}
