// Package tickets is support by tickets: a Telegram account writes to support in the bot or
// the Mini App, the admin answers in the panel. A ticket is open while it waits for the admin,
// answered once the admin spoke last and closed when either side closed it; the account's next
// message opens it again. The admin's answers reach the account through the feed of events
// (events.TicketReply), which the bot addon tells in the chat. Package support is another
// thing: the support access the admin grants to the panel's developers.
package tickets

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"mikan/internal/panel/events"
	"mikan/internal/panel/events/feed"
	"mikan/internal/panel/model"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store"
	"mikan/internal/panel/store/db"
)

// Key is the setting that turns the tickets on (Config).
const Key = "tickets"

// Limits.
const (
	MaxOpen    = 5    // an account's tickets not closed at once
	MaxBody    = 4000 // runes of one message
	subjectLen = 80   // runes of a subject made of the first message
	listLen    = 30   // an account's tickets shown
	// composeTTL: how long the bot's chat counts as writing to support after the button.
	composeTTL = time.Hour
)

// Sources of a ticket.
const (
	SourceBot     = "bot"
	SourceMiniApp = "miniapp"
)

var (
	ErrGone  = model.ErrTicketGone
	ErrMany  = model.ErrTicketMany
	ErrEmpty = model.ErrTicketEmpty
	ErrOff   = model.ErrTicketOff
)

// Config is the admin's setup of the tickets.
type Config struct {
	Enabled bool `json:"enabled"`
}

// Service keeps the tickets.
type Service struct {
	st  *store.Store
	set *settings.Settings
	now func() time.Time
	hub *events.Hub
	// waiting tells the admin of a message that waits for them; nil: nobody is told.
	waiting func(ctx context.Context, t db.Ticket, m db.TicketMessage)
}

func New(st *store.Store, set *settings.Settings, now func() time.Time, hub *events.Hub) *Service {
	return &Service{st: st, set: set, now: now, hub: hub}
}

// SetNotifier makes fn tell the admin of each message of an account.
func (s *Service) SetNotifier(fn func(ctx context.Context, t db.Ticket, m db.TicketMessage)) {
	s.waiting = fn
}

// Config is the admin's setup; off when never saved.
func (s *Service) Config(ctx context.Context) Config {
	c, _, _ := settings.Get[Config](ctx, s.set, Key)
	return c
}

func (s *Service) SetConfig(ctx context.Context, c Config) error {
	return settings.Set(ctx, s.set, Key, c)
}

// On: the accounts may write to support.
func (s *Service) On(ctx context.Context) bool { return s.Config(ctx).Enabled }

// View is t as the account sees it.
func View(t db.Ticket) model.Ticket {
	return model.Ticket{ID: t.ID, TgID: t.TgID, Subject: t.Subject, Status: t.Status, Unread: t.UserUnread, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
}

// MessageView is m as the account sees it.
func MessageView(m db.TicketMessage) model.TicketMessage {
	return model.TicketMessage{ID: m.ID, FromAdmin: m.FromAdmin, Body: m.Body, Photo: m.Photo, CreatedAt: m.CreatedAt}
}

// Of are the account's tickets: the ones not closed first, then by their last change.
func (s *Service) Of(ctx context.Context, tgID int64) ([]model.Ticket, error) {
	rows, err := s.st.Q.TicketsOf(ctx, db.TicketsOfParams{TgID: tgID, Limit: listLen})
	if err != nil {
		return nil, err
	}
	out := make([]model.Ticket, 0, len(rows))
	for _, t := range rows {
		out = append(out, View(t))
	}
	return out, nil
}

// Unread is how many of the account's tickets have an answer it has not seen.
func (s *Service) Unread(ctx context.Context, tgID int64) int {
	ts, err := s.Of(ctx, tgID)
	if err != nil {
		return 0
	}
	n := 0
	for _, t := range ts {
		if t.Unread {
			n++
		}
	}
	return n
}

// mine is the account's ticket id, ErrGone when it is not there or someone else's.
func (s *Service) mine(ctx context.Context, tgID, id int64) (db.Ticket, error) {
	t, err := s.st.Q.GetTicket(ctx, id)
	if errors.Is(err, sql.ErrNoRows) || err == nil && t.TgID != tgID {
		return db.Ticket{}, ErrGone
	}
	return t, err
}

// Thread is one ticket of the account with its messages; the answers count as read then.
func (s *Service) Thread(ctx context.Context, tgID, id int64) (model.Ticket, []model.TicketMessage, error) {
	t, err := s.mine(ctx, tgID, id)
	if err != nil {
		return model.Ticket{}, nil, err
	}
	rows, err := s.st.Q.TicketMessages(ctx, id)
	if err != nil {
		return model.Ticket{}, nil, err
	}
	if t.UserUnread {
		if err := s.st.Q.MarkTicketReadByUser(ctx, db.MarkTicketReadByUserParams{ID: id, TgID: tgID}); err != nil {
			return model.Ticket{}, nil, err
		}
		t.UserUnread = false
	}
	msgs := make([]model.TicketMessage, 0, len(rows))
	for _, m := range rows {
		msgs = append(msgs, MessageView(m))
	}
	return View(t), msgs, nil
}

// clean is a message's text trimmed and cut to MaxBody runes.
func clean(body string) string {
	body = strings.TrimSpace(strings.ToValidUTF8(body, ""))
	if utf8.RuneCountInString(body) > MaxBody {
		body = string([]rune(body)[:MaxBody])
	}
	return body
}

// subjectOf is the subject a ticket gets from its first message: its first line, cut.
func subjectOf(body string) string {
	line, _, _ := strings.Cut(body, "\n")
	line = strings.TrimSpace(line)
	if utf8.RuneCountInString(line) > subjectLen {
		line = strings.TrimSpace(string([]rune(line)[:subjectLen-1])) + "…"
	}
	return line
}

// Post is the account's message: to ticket id, or a new ticket when id is 0. A closed ticket
// opens again. ErrOff while the tickets are off, ErrMany when a new one would be past MaxOpen,
// ErrEmpty for a message of nothing.
func (s *Service) Post(ctx context.Context, tgID, id int64, source, body, photo string) (model.Ticket, error) {
	if !s.On(ctx) {
		return model.Ticket{}, ErrOff
	}
	body = clean(body)
	if body == "" && photo == "" {
		return model.Ticket{}, ErrEmpty
	}
	if source != SourceMiniApp {
		source = SourceBot
	}
	now := s.now().Unix()
	var t db.Ticket
	var m db.TicketMessage
	err := s.st.Tx(ctx, func(q *db.Queries) error {
		var err error
		if id == 0 {
			n, err := q.CountOpenTicketsOf(ctx, tgID)
			if err != nil {
				return err
			}
			if n >= MaxOpen {
				return ErrMany
			}
			subject := subjectOf(body)
			if subject == "" {
				subject = "📷"
			}
			if t, err = q.CreateTicket(ctx, db.CreateTicketParams{TgID: tgID, Subject: subject, Source: source, CreatedAt: now}); err != nil {
				return err
			}
		} else {
			n, err := q.TouchTicketByUser(ctx, db.TouchTicketByUserParams{UpdatedAt: now, ID: id, TgID: tgID})
			if err != nil {
				return err
			}
			if n == 0 {
				return ErrGone
			}
			if t, err = q.GetTicket(ctx, id); err != nil {
				return err
			}
		}
		if m, err = q.AddTicketMessage(ctx, db.AddTicketMessageParams{TicketID: t.ID, Body: body, Photo: photo, CreatedAt: now}); err != nil {
			return err
		}
		return q.DropTicketCompose(ctx, tgID)
	})
	if err != nil {
		return model.Ticket{}, err
	}
	if s.waiting != nil {
		s.waiting(ctx, t, m)
	}
	return View(t), nil
}

// Close is the account closing its ticket.
func (s *Service) Close(ctx context.Context, tgID, id int64) error {
	n, err := s.st.Q.CloseTicketOf(ctx, db.CloseTicketOfParams{UpdatedAt: s.now().Unix(), ID: id, TgID: tgID})
	if err != nil {
		return err
	}
	if n == 0 {
		if _, err := s.mine(ctx, tgID, id); err != nil {
			return err
		}
	}
	return nil
}

// Compose makes the bot's chat write to support: its next message goes to ticket id (0: a
// new one).
func (s *Service) Compose(ctx context.Context, tgID, id int64) error {
	if !s.On(ctx) {
		return ErrOff
	}
	if id != 0 {
		if _, err := s.mine(ctx, tgID, id); err != nil {
			return err
		}
	}
	return s.st.Q.SetTicketCompose(ctx, db.SetTicketComposeParams{TgID: tgID, TicketID: id, CreatedAt: s.now().Unix()})
}

// Composing is the ticket the bot's chat writes to (0: a new one); ok is false when it writes
// to none, or stopped an hour ago.
func (s *Service) Composing(ctx context.Context, tgID int64) (id int64, ok bool) {
	c, err := s.st.Q.GetTicketCompose(ctx, tgID)
	if err != nil || s.now().Unix()-c.CreatedAt > int64(composeTTL/time.Second) {
		return 0, false
	}
	return c.TicketID, true
}

// StopComposing: the chat's next message is not for support.
func (s *Service) StopComposing(ctx context.Context, tgID int64) error {
	return s.st.Q.DropTicketCompose(ctx, tgID)
}

// The admin's side.

// Count is how many tickets are in one state, and how many of them the admin has not read.
type Count struct {
	All    int64
	Unread int64
}

// List is the admin's list of tickets in a state ("" all), newest change first.
func (s *Service) List(ctx context.Context, status string, beforeAt, beforeID int64, limit int32) ([]db.Ticket, error) {
	return s.st.Q.ListTickets(ctx, db.ListTicketsParams{Status: status, BeforeAt: beforeAt, BeforeID: beforeID, Lim: limit})
}

// Counts are the tickets by their state.
func (s *Service) Counts(ctx context.Context) (map[string]Count, error) {
	rows, err := s.st.Q.CountTicketsByStatus(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]Count{}
	for _, r := range rows {
		out[r.Status] = Count{All: r.N, Unread: r.Unread}
	}
	return out, nil
}

// AdminThread is a ticket with its messages for the admin, who has read it then.
func (s *Service) AdminThread(ctx context.Context, id int64) (db.Ticket, []db.TicketMessage, error) {
	t, err := s.st.Q.GetTicket(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil, ErrGone
	}
	if err != nil {
		return t, nil, err
	}
	msgs, err := s.st.Q.TicketMessages(ctx, id)
	if err != nil {
		return t, nil, err
	}
	if t.AdminUnread {
		if err := s.st.Q.MarkTicketReadByAdmin(ctx, id); err != nil {
			return t, nil, err
		}
		t.AdminUnread = false
	}
	return t, msgs, nil
}

// Message is one message of a ticket, for its photo.
func (s *Service) Message(ctx context.Context, ticketID, id int64) (db.TicketMessage, error) {
	m, err := s.st.Q.GetTicketMessage(ctx, id)
	if errors.Is(err, sql.ErrNoRows) || err == nil && m.TicketID != ticketID {
		return m, ErrGone
	}
	return m, err
}

// Reply is the admin's answer: the ticket is answered, and the account is told
// (events.TicketReply) on the same transaction.
func (s *Service) Reply(ctx context.Context, id, adminID int64, body string) (db.TicketMessage, error) {
	body = clean(body)
	if body == "" {
		return db.TicketMessage{}, ErrEmpty
	}
	now := s.now()
	var m db.TicketMessage
	err := s.st.Tx(ctx, func(q *db.Queries) error {
		n, err := q.TouchTicketByAdmin(ctx, db.TouchTicketByAdminParams{UpdatedAt: now.Unix(), ID: id})
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrGone
		}
		t, err := q.GetTicket(ctx, id)
		if err != nil {
			return err
		}
		if m, err = q.AddTicketMessage(ctx, db.AddTicketMessageParams{TicketID: id, FromAdmin: true,
			AdminID: sql.NullInt64{Int64: adminID, Valid: adminID != 0}, Body: body, CreatedAt: now.Unix()}); err != nil {
			return err
		}
		return feed.Emit(ctx, q, now, events.TicketReply, 0, t.TgID, events.Ticket{TicketID: id, Subject: t.Subject, Text: body},
			events.TicketReply+":"+strconv.FormatInt(m.ID, 10))
	})
	if err == nil {
		s.hub.Kick()
	}
	return m, err
}

// SetStatus is the admin closing a ticket or opening it again; a ticket closed is told to its
// account (events.TicketClosed).
func (s *Service) SetStatus(ctx context.Context, id int64, closed bool) (db.Ticket, error) {
	now := s.now()
	var t db.Ticket
	err := s.st.Tx(ctx, func(q *db.Queries) error {
		var err error
		if t, err = q.GetTicket(ctx, id); errors.Is(err, sql.ErrNoRows) {
			return ErrGone
		} else if err != nil {
			return err
		}
		status := model.TicketOpen
		if closed {
			status = model.TicketClosed
		} else if last, err := q.LastTicketMessage(ctx, id); err == nil && last.FromAdmin {
			status = model.TicketAnswered
		}
		if status == t.Status {
			return nil
		}
		if _, err := q.SetTicketStatus(ctx, db.SetTicketStatusParams{Status: status, UpdatedAt: now.Unix(), ID: id}); err != nil {
			return err
		}
		t.Status, t.UpdatedAt = status, now.Unix()
		if !closed {
			return nil
		}
		return feed.Emit(ctx, q, now, events.TicketClosed, 0, t.TgID, events.Ticket{TicketID: id, Subject: t.Subject},
			events.TicketClosed+":"+strconv.FormatInt(id, 10)+":"+strconv.FormatInt(now.Unix(), 10))
	})
	if err == nil && closed {
		s.hub.Kick()
	}
	return t, err
}

// Delete drops a ticket with its messages.
func (s *Service) Delete(ctx context.Context, id int64) error {
	n, err := s.st.Q.DeleteTicket(ctx, id)
	if err == nil && n == 0 {
		return ErrGone
	}
	return err
}
