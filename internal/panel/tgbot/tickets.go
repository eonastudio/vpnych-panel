package tgbot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"mikan/internal/panel/events"
	"mikan/internal/panel/model"
	"mikan/internal/tgapi"
)

// Support by tickets, when the admin turned it on: the support button opens the account's
// tickets instead of the support link. Callback data: k the tickets, kt:<id> one ticket, kn
// write a new one, kr:<id> answer in one, kw[:<id>] the chat writes now (its next message
// goes to support), kc:<id> close one, kx stop writing. The admin answers in the panel;
// events.TicketReply brings the answer here.

// threadChars: how much of a ticket's last messages its screen shows.
const threadChars = 3000

// maxOpenTickets is the panel's limit of an account's tickets not closed (tickets.MaxOpen).
const maxOpenTickets = 5

// supportButton is the menu's support entry: the tickets while they are on (with how many
// answers wait), else the admin's support link; false for neither.
func (b *Bot) supportButton(ctx context.Context, cfg Config, w *words, chat int64, label string) (tgapi.Button, bool) {
	if label == "" {
		label = labelOf(cfg, "support", w.support)
	}
	if b.d.Backend.TicketsOn(ctx) {
		if ts, err := b.d.Backend.Tickets(ctx, chat); err == nil {
			n := 0
			for _, t := range ts {
				if t.Unread {
					n++
				}
			}
			if n > 0 {
				label = fmt.Sprintf("%s · %d", label, n)
			}
		}
		return tgapi.Button{Text: label, CallbackData: "k"}, true
	}
	if sup := b.supportURL(ctx); sup != "" {
		return tgapi.Button{Text: label, URL: sup}, true
	}
	return tgapi.Button{}, false
}

// ticketScreen draws k, kt and kw.
func (b *Bot) ticketScreen(ctx context.Context, w *words, chat int64, cmd, arg, notice string) (string, *tgapi.Keyboard) {
	home := []tgapi.Button{{Text: w.back, CallbackData: "m"}}
	if !b.d.Backend.TicketsOn(ctx) {
		return html.EscapeString(w.ticketsOff), &tgapi.Keyboard{InlineKeyboard: [][]tgapi.Button{home}}
	}
	var lines []string
	if notice != "" {
		lines = append(lines, html.EscapeString(notice), "")
	}
	id, _ := strconv.ParseInt(arg, 10, 64)
	switch cmd {
	case "kw":
		ask := w.ticketsWrite
		if id != 0 {
			if t, _, err := b.d.Backend.TicketThread(ctx, chat, id); err == nil {
				ask = fmt.Sprintf(w.ticketsWriteTo, t.Subject)
			}
		}
		lines = append(lines, html.EscapeString(ask))
		return strings.Join(lines, "\n"), &tgapi.Keyboard{InlineKeyboard: [][]tgapi.Button{{{Text: w.cancel, CallbackData: "kx"}}}}
	case "kt":
		t, msgs, err := b.d.Backend.TicketThread(ctx, chat, id)
		if err != nil {
			break
		}
		lines = append(lines, "<b>"+html.EscapeString(t.Subject)+"</b> · "+html.EscapeString(w.ticketStatus(t.Status)), "")
		lines = append(lines, b.thread(w, msgs)...)
		k := strconv.FormatInt(id, 10)
		rows := [][]tgapi.Button{{{Text: w.ticketsReply, CallbackData: "kr:" + k}}}
		if t.Status != model.TicketClosed {
			rows = append(rows, []tgapi.Button{{Text: w.ticketsClose, CallbackData: "kc:" + k}})
		}
		rows = append(rows, []tgapi.Button{{Text: w.back, CallbackData: "k"}})
		return strings.Join(lines, "\n"), &tgapi.Keyboard{InlineKeyboard: rows}
	}
	ts, _ := b.d.Backend.Tickets(ctx, chat)
	lines = append(lines, "<b>"+html.EscapeString(w.ticketsTitle)+"</b>", "")
	if len(ts) == 0 {
		lines = append(lines, html.EscapeString(w.ticketsEmpty))
	} else {
		lines = append(lines, html.EscapeString(w.ticketsPick))
	}
	rows := [][]tgapi.Button{{{Text: w.ticketsNew, CallbackData: "kn"}}}
	for _, t := range ts {
		mark := "💬 "
		switch {
		case t.Unread:
			mark = "🔔 "
		case t.Status == model.TicketClosed:
			mark = "✔️ "
		case t.Status == model.TicketOpen:
			mark = "🕓 "
		}
		rows = append(rows, []tgapi.Button{{Text: mark + t.Subject, CallbackData: "kt:" + strconv.FormatInt(t.ID, 10)}})
	}
	return strings.Join(lines, "\n"), &tgapi.Keyboard{InlineKeyboard: append(rows, home)}
}

// thread is a ticket's messages as lines, the last ones that fit threadChars.
func (b *Bot) thread(w *words, msgs []model.TicketMessage) []string {
	var parts []string
	size := 0
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		who := w.ticketsYou
		if m.FromAdmin {
			who = w.ticketsSupport
		}
		body := m.Body
		if m.Photo != "" {
			body = strings.TrimSpace(w.ticketsPhoto + " " + body)
		}
		if utf8.RuneCountInString(body) > threadChars/2 {
			body = string([]rune(body)[:threadChars/2]) + "…"
		}
		part := "<b>" + html.EscapeString(who) + "</b> · " + html.EscapeString(b.when(w, time.Unix(m.CreatedAt, 0).UTC())) + "\n" + html.EscapeString(body)
		size += utf8.RuneCountInString(part)
		if size > threadChars && len(parts) > 0 {
			parts = append(parts, "…")
			break
		}
		parts = append(parts, "", part)
	}
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	return parts
}

// ticketAct does what kn, kr, kc and kx change, before their screen is drawn.
func (b *Bot) ticketAct(ctx context.Context, chat int64, cmd, arg string) (screen, notice string) {
	w := wordsFor(b.config(ctx).Lang)
	id, _ := strconv.ParseInt(arg, 10, 64)
	switch cmd {
	case "kn", "kr":
		if cmd == "kn" {
			id = 0
		}
		if err := b.d.Backend.SetTicketCompose(ctx, chat, id, true); err != nil {
			return "k", w.ticketError(err)
		}
		if id == 0 {
			return "kw", ""
		}
		return "kw:" + arg, ""
	case "kc":
		if err := b.d.Backend.CloseTicket(ctx, chat, id); err != nil {
			return "k", w.ticketError(err)
		}
		return "kt:" + arg, w.ticketsClosed
	case "kx":
		_ = b.d.Backend.SetTicketCompose(ctx, chat, 0, false)
	}
	return "k", ""
}

// ticketMessage takes the chat's message for support after the button: its text, or a
// picture with its caption. ok is false when the chat is not writing to support; a command
// stops the writing and goes on as usual.
func (b *Bot) ticketMessage(ctx context.Context, w *words, m *tgapi.Message) (ok bool) {
	chat := m.Chat.ID
	id, writing := b.d.Backend.TicketCompose(ctx, chat)
	if !writing {
		return false
	}
	text := m.Text
	if text == "" {
		text = m.Caption
	}
	if strings.HasPrefix(strings.TrimSpace(text), "/") {
		_ = b.d.Backend.SetTicketCompose(ctx, chat, 0, false)
		return false
	}
	t, err := b.d.Backend.PostTicket(ctx, chat, id, text, m.Picture())
	if err != nil {
		b.freshScreen(chat, "k", w.ticketError(err))
		return true
	}
	b.freshScreen(chat, "kt:"+strconv.FormatInt(t.ID, 10), w.ticketsSent)
	return true
}

// ticketEvent is what ticket.reply and ticket.closed say: the admin's answer, with buttons
// to answer back and to open the ticket.
func (b *Bot) ticketEvent(ctx context.Context, chat int64, typ string, t events.Ticket) {
	w := wordsFor(b.lang(ctx))
	k := strconv.FormatInt(t.TicketID, 10)
	var text string
	var rows [][]tgapi.Button
	if typ == events.TicketReply {
		text = "<b>" + html.EscapeString(fmt.Sprintf(w.ticketsAnswer, t.Subject)) + "</b>\n\n" + html.EscapeString(t.Text)
		rows = append(rows, []tgapi.Button{{Text: w.ticketsReply, CallbackData: "kr:" + k}})
	} else {
		text = html.EscapeString(fmt.Sprintf(w.ticketsClosedBy, t.Subject))
	}
	rows = append(rows, []tgapi.Button{{Text: w.ticketsOpen, CallbackData: "kt:" + k}})
	kb := &tgapi.Keyboard{InlineKeyboard: rows}
	b.d.Outbox.Notice(chat, func(ctx context.Context, c *tgapi.Client) error {
		_, err := c.Send(ctx, chat, text, kb, false)
		return err
	}, nil)
}

// ticketOf is the ticket an event is about; false for one that says nothing.
func ticketOf(e events.Event) (events.Ticket, bool) {
	var t events.Ticket
	if err := json.Unmarshal(e.Data, &t); err != nil || e.TgID == 0 || t.TicketID == 0 {
		return t, false
	}
	return t, true
}

func (w *words) ticketStatus(s string) string {
	switch s {
	case model.TicketAnswered:
		return w.ticketAnswered
	case model.TicketClosed:
		return w.ticketClosedState
	}
	return w.ticketWaiting
}

// ticketError is what the account is told for a refusal about its tickets.
func (w *words) ticketError(err error) string {
	switch {
	case errors.Is(err, model.ErrTicketMany):
		return fmt.Sprintf(w.ticketsMany, maxOpenTickets)
	case errors.Is(err, model.ErrTicketEmpty):
		return w.ticketsEmptyMsg
	case errors.Is(err, model.ErrTicketOff):
		return w.ticketsOff
	case errors.Is(err, model.ErrTicketGone):
		return w.ticketsGone
	}
	return w.ticketsFailed
}
