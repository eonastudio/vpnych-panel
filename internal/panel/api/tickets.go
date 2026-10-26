package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"mikan/internal/panel/model"
	"mikan/internal/panel/store/db"
	"mikan/internal/panel/tickets"
)

// Support by tickets: the clients write in the bot or the Mini App, the admin reads the
// threads here and answers; the answer reaches the client in the bot.

type TicketView struct {
	ID         int64     `json:"id"`
	TgID       int64     `json:"tg_id"`
	TgUsername string    `json:"tg_username,omitempty"`
	TgName     string    `json:"tg_name,omitempty"`
	Subject    string    `json:"subject"`
	Status     string    `json:"status" enum:"open,answered,closed"`
	Source     string    `json:"source" enum:"bot,miniapp"`
	Unread     bool      `json:"unread" doc:"Есть сообщения клиента, которых админ не читал"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type TicketMessageView struct {
	ID        int64     `json:"id"`
	FromAdmin bool      `json:"from_admin"`
	Body      string    `json:"body"`
	Photo     bool      `json:"photo" doc:"Есть картинка: GET /api/v1/tickets/{id}/messages/{message_id}/photo"`
	CreatedAt time.Time `json:"created_at"`
}

type TicketCountView struct {
	All    int64 `json:"all"`
	Unread int64 `json:"unread"`
}

type TicketSettingsView struct {
	Enabled bool `json:"enabled" doc:"Кнопка поддержки открывает обращения в боте и Mini App вместо ссылки"`
}

type listTicketsInput struct {
	Status   string `query:"status" enum:"open,answered,closed,"`
	BeforeAt int64  `query:"before_at" minimum:"0" doc:"Следующая страница: updated_at последнего показанного (unix)"`
	BeforeID int64  `query:"before_id" minimum:"0" doc:"Следующая страница: id последнего показанного"`
	Limit    int32  `query:"limit" minimum:"1" maximum:"200" default:"50"`
}

type ticketsOutput struct {
	Body struct {
		Items   []TicketView               `json:"items"`
		Counts  map[string]TicketCountView `json:"counts" doc:"По статусам: open, answered, closed"`
		Enabled bool                       `json:"enabled"`
	}
}

type ticketIDInput struct {
	ID int64 `path:"id" minimum:"1"`
}

type ticketThreadOutput struct {
	Body struct {
		Ticket   TicketView          `json:"ticket"`
		Messages []TicketMessageView `json:"messages"`
	}
}

type replyTicketInput struct {
	ID   int64 `path:"id" minimum:"1"`
	Body struct {
		Text string `json:"text" minLength:"1" maxLength:"4000" doc:"Ответ: придёт клиенту в бота"`
	}
}

type ticketStatusInput struct {
	ID   int64 `path:"id" minimum:"1"`
	Body struct {
		Closed bool `json:"closed" doc:"true — закрыть, false — открыть снова"`
	}
}

type ticketPhotoInput struct {
	ID        int64 `path:"id" minimum:"1"`
	MessageID int64 `path:"message_id" minimum:"1"`
}

type ticketSettingsOutput struct{ Body TicketSettingsView }

type ticketSettingsInput struct{ Body TicketSettingsView }

func (h *handlers) registerTickets() {
	tags := []string{"users"}
	op := sessionOps("users")
	huma.Register(h.api, huma.Operation{OperationID: "list-tickets", Method: http.MethodGet, Path: "/api/v1/tickets", Summary: "Обращения в поддержку", Tags: tags}, h.listTickets)
	huma.Register(h.api, huma.Operation{OperationID: "get-ticket-settings", Method: http.MethodGet, Path: "/api/v1/tickets/settings", Summary: "Настройки обращений", Tags: tags}, h.getTicketSettings)
	huma.Register(h.api, op("update-ticket-settings", http.MethodPut, "/api/v1/tickets/settings", "Включить или выключить обращения", 0), h.putTicketSettings)
	huma.Register(h.api, huma.Operation{OperationID: "get-ticket", Method: http.MethodGet, Path: "/api/v1/tickets/{id}", Summary: "Переписка по обращению", Tags: tags}, h.getTicket)
	huma.Register(h.api, op("reply-ticket", http.MethodPost, "/api/v1/tickets/{id}/reply", "Ответить клиенту", 0), h.replyTicket)
	huma.Register(h.api, op("set-ticket-status", http.MethodPost, "/api/v1/tickets/{id}/status", "Закрыть или открыть обращение", 0), h.setTicketStatus)
	huma.Register(h.api, op("delete-ticket", http.MethodDelete, "/api/v1/tickets/{id}", "Удалить обращение", http.StatusNoContent), h.deleteTicket)
	huma.Register(h.api, huma.Operation{OperationID: "get-ticket-photo", Method: http.MethodGet, Path: "/api/v1/tickets/{id}/messages/{message_id}/photo", Summary: "Картинка из обращения",
		Tags: tags, Responses: map[string]*huma.Response{"200": {Description: "Картинка", Content: map[string]*huma.MediaType{"image/*": {}}}}}, h.ticketPhoto)
}

func (h *handlers) viewTicket(ctx context.Context, t db.Ticket) TicketView {
	v := TicketView{ID: t.ID, TgID: t.TgID, Subject: t.Subject, Status: t.Status, Source: t.Source, Unread: t.AdminUnread,
		CreatedAt: time.Unix(t.CreatedAt, 0).UTC(), UpdatedAt: time.Unix(t.UpdatedAt, 0).UTC()}
	if c, err := h.d.Store.Q.GetTgChat(ctx, t.TgID); err == nil {
		v.TgUsername = c.Username
		v.TgName = c.FirstName
	}
	return v
}

func ticketRefusal(err error) error {
	switch {
	case errors.Is(err, model.ErrTicketGone):
		return huma.Error404NotFound("not_found")
	case errors.Is(err, model.ErrTicketEmpty):
		return fieldErr("body.text", "required")
	}
	return err
}

func (h *handlers) listTickets(ctx context.Context, in *listTicketsInput) (*ticketsOutput, error) {
	if hidesPeople(ctx) {
		return nil, huma.Error403Forbidden("support_denied")
	}
	rows, err := h.d.Tickets.List(ctx, in.Status, in.BeforeAt, in.BeforeID, in.Limit)
	if err != nil {
		return nil, err
	}
	out := &ticketsOutput{}
	out.Body.Items = make([]TicketView, 0, len(rows))
	for _, t := range rows {
		out.Body.Items = append(out.Body.Items, h.viewTicket(ctx, t))
	}
	counts, err := h.d.Tickets.Counts(ctx)
	if err != nil {
		return nil, err
	}
	out.Body.Counts = map[string]TicketCountView{}
	for _, s := range []string{model.TicketOpen, model.TicketAnswered, model.TicketClosed} {
		c := counts[s]
		out.Body.Counts[s] = TicketCountView{All: c.All, Unread: c.Unread}
	}
	out.Body.Enabled = h.d.Tickets.On(ctx)
	return out, nil
}

func (h *handlers) threadOutput(ctx context.Context, t db.Ticket, msgs []db.TicketMessage) *ticketThreadOutput {
	out := &ticketThreadOutput{}
	out.Body.Ticket = h.viewTicket(ctx, t)
	out.Body.Messages = make([]TicketMessageView, 0, len(msgs))
	for _, m := range msgs {
		out.Body.Messages = append(out.Body.Messages, TicketMessageView{ID: m.ID, FromAdmin: m.FromAdmin, Body: m.Body, Photo: m.Photo != "",
			CreatedAt: time.Unix(m.CreatedAt, 0).UTC()})
	}
	return out
}

func (h *handlers) getTicket(ctx context.Context, in *ticketIDInput) (*ticketThreadOutput, error) {
	if hidesPeople(ctx) {
		return nil, huma.Error403Forbidden("support_denied")
	}
	t, msgs, err := h.d.Tickets.AdminThread(ctx, in.ID)
	if err != nil {
		return nil, ticketRefusal(err)
	}
	return h.threadOutput(ctx, t, msgs), nil
}

func (h *handlers) replyTicket(ctx context.Context, in *replyTicketInput) (*ticketThreadOutput, error) {
	admin := sessionOf(ctx).AdminID
	m, err := h.d.Tickets.Reply(ctx, in.ID, admin, in.Body.Text)
	if err != nil {
		return nil, ticketRefusal(err)
	}
	h.audit(ctx, admin, "ticket.reply", "ticket", strconv.FormatInt(in.ID, 10), map[string]any{"message": m.ID})
	t, msgs, err := h.d.Tickets.AdminThread(ctx, in.ID)
	if err != nil {
		return nil, ticketRefusal(err)
	}
	return h.threadOutput(ctx, t, msgs), nil
}

func (h *handlers) setTicketStatus(ctx context.Context, in *ticketStatusInput) (*ticketThreadOutput, error) {
	admin := sessionOf(ctx).AdminID
	t, err := h.d.Tickets.SetStatus(ctx, in.ID, in.Body.Closed)
	if err != nil {
		return nil, ticketRefusal(err)
	}
	h.audit(ctx, admin, "ticket.status", "ticket", strconv.FormatInt(in.ID, 10), map[string]any{"status": t.Status})
	t, msgs, err := h.d.Tickets.AdminThread(ctx, in.ID)
	if err != nil {
		return nil, ticketRefusal(err)
	}
	return h.threadOutput(ctx, t, msgs), nil
}

func (h *handlers) deleteTicket(ctx context.Context, in *ticketIDInput) (*struct{}, error) {
	admin := sessionOf(ctx).AdminID
	if err := h.d.Tickets.Delete(ctx, in.ID); err != nil {
		return nil, ticketRefusal(err)
	}
	h.audit(ctx, admin, "ticket.delete", "ticket", strconv.FormatInt(in.ID, 10), nil)
	return nil, nil
}

func (h *handlers) getTicketSettings(ctx context.Context, _ *struct{}) (*ticketSettingsOutput, error) {
	return &ticketSettingsOutput{Body: TicketSettingsView{Enabled: h.d.Tickets.On(ctx)}}, nil
}

func (h *handlers) putTicketSettings(ctx context.Context, in *ticketSettingsInput) (*ticketSettingsOutput, error) {
	admin := sessionOf(ctx).AdminID
	if err := h.d.Tickets.SetConfig(ctx, tickets.Config{Enabled: in.Body.Enabled}); err != nil {
		return nil, err
	}
	h.audit(ctx, admin, "ticket.settings", "settings", tickets.Key, map[string]any{"enabled": in.Body.Enabled})
	return &ticketSettingsOutput{Body: TicketSettingsView{Enabled: h.d.Tickets.On(ctx)}}, nil
}

// ticketPhoto is a picture the client sent, as Telegram keeps it.
func (h *handlers) ticketPhoto(ctx context.Context, in *ticketPhotoInput) (*subImageBytes, error) {
	if hidesPeople(ctx) {
		return nil, huma.Error403Forbidden("support_denied")
	}
	m, err := h.d.Tickets.Message(ctx, in.ID, in.MessageID)
	if err != nil || m.Photo == "" {
		return nil, huma.Error404NotFound("not_found")
	}
	if h.d.Gateway == nil || h.d.Gateway.Client() == nil {
		return nil, huma.Error409Conflict("bot_off")
	}
	raw, err := h.d.Gateway.Client().File(ctx, m.Photo)
	if err != nil {
		h.d.Log.Warn("ticket photo", "ticket", in.ID, "message", in.MessageID, "err", err)
		return nil, huma.Error502BadGateway("telegram_unavailable")
	}
	ct := http.DetectContentType(raw)
	if !strings.HasPrefix(ct, "image/") {
		return nil, huma.Error502BadGateway("not_a_picture")
	}
	return &subImageBytes{ContentType: ct, CacheControl: "private, max-age=3600", Nosniff: "nosniff", Body: raw}, nil
}
