package botpanel

import (
	"context"

	"mikan/internal/panel/model"
)

// The referral program in the bot: the account's link and its friends (referral.Service).

func (l *Local) Referral(ctx context.Context, tgID int64) (model.Referral, error) {
	if l.Referrals == nil {
		return model.Referral{}, nil
	}
	return l.Referrals.Of(ctx, tgID)
}

func (l *Local) TagReferral(ctx context.Context, tgID int64, code string) (bool, error) {
	if l.Referrals == nil {
		return false, nil
	}
	return l.Referrals.Tag(ctx, tgID, code)
}
