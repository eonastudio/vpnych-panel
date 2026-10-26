package subs

import (
	"encoding/json"
	"errors"
	"net/http"

	"mikan/internal/panel/model"
	"mikan/internal/panel/tickets"
)

// The Mini App's support: the account's tickets, one's messages, a new message and closing
// one. The same tickets as in the bot; the admin answers them in the panel. Pictures come
// from the bot only, the Mini App writes text.

// SetTickets turns on the Mini App's support by tickets.
func (h *Handler) SetTickets(s *tickets.Service) { h.tickets = s }

// ticketRequest is the body of "tickets": Action is list, thread, post or close.
type ticketRequest struct {
	miniAuth
	Action string `json:"action"`
	ID     int64  `json:"id"`
	Text   string `json:"text"`
}

func (in *ticketRequest) valid() bool {
	switch in.Action {
	case "list":
		return true
	case "thread", "close":
		return in.ID > 0
	case "post":
		return in.ID >= 0 && len(in.Text) <= 4*tickets.MaxBody
	}
	return false
}

// miniAppTickets answers the Mini App's support screen.
func (h *Handler) miniAppTickets(w http.ResponseWriter, r *http.Request) {
	var in ticketRequest
	tgID, _, fail, ok := h.mini(w, r, &in)
	if !ok {
		return
	}
	ctx := r.Context()
	if in.Action == "list" {
		on := h.tickets.On(ctx)
		ts := []model.Ticket{}
		if on {
			var err error
			if ts, err = h.tickets.Of(ctx, tgID); err != nil {
				fail(http.StatusInternalServerError, "internal")
				return
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"enabled": on, "tickets": ts, "max_open": tickets.MaxOpen, "max_body": tickets.MaxBody})
		return
	}
	if !h.tickets.On(ctx) {
		fail(http.StatusConflict, model.ErrTicketOff.Error())
		return
	}
	var err error
	switch in.Action {
	case "thread":
		var t model.Ticket
		var msgs []model.TicketMessage
		if t, msgs, err = h.tickets.Thread(ctx, tgID, in.ID); err == nil {
			_ = json.NewEncoder(w).Encode(map[string]any{"ticket": t, "messages": msgs})
			return
		}
	case "post":
		var t model.Ticket
		if t, err = h.tickets.Post(ctx, tgID, in.ID, tickets.SourceMiniApp, in.Text, ""); err == nil {
			_ = json.NewEncoder(w).Encode(map[string]any{"ticket": t})
			return
		}
	case "close":
		if err = h.tickets.Close(ctx, tgID, in.ID); err == nil {
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
			return
		}
	}
	for _, refusal := range []error{model.ErrTicketGone, model.ErrTicketMany, model.ErrTicketEmpty, model.ErrTicketOff} {
		if errors.Is(err, refusal) {
			fail(http.StatusConflict, refusal.Error())
			return
		}
	}
	fail(http.StatusInternalServerError, "internal")
}
