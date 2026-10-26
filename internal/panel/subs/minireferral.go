package subs

import (
	"encoding/json"
	"net/http"

	"mikan/internal/panel/referral"
)

// The Mini App's referral screen: the account's link and its friends, as in the bot.

// SetReferral turns on the Mini App's referral screen.
func (h *Handler) SetReferral(s *referral.Service) { h.referral = s }

// miniAppReferral answers the referral screen: model.Referral of the account.
func (h *Handler) miniAppReferral(w http.ResponseWriter, r *http.Request) {
	var in miniAuth
	tgID, _, fail, ok := h.mini(w, r, &in)
	if !ok {
		return
	}
	ref, err := h.referral.Of(r.Context(), tgID)
	if err != nil {
		fail(http.StatusInternalServerError, "internal")
		return
	}
	_ = json.NewEncoder(w).Encode(ref)
}
