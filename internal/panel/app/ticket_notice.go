package app

import (
	"context"
	"fmt"
	"html"
	"strconv"
	"unicode/utf8"

	"mikan/internal/panel/store/db"
)

// ticketNoticeChars: how much of a support message the admin's notice quotes.
const ticketNoticeChars = 600

// tellAdminOfTicket tells the admin, in the chat connected for the panel's alerts, that a
// client wrote to support: who, the ticket and the message. The answer is in the panel
// (Support → Tickets). Without the bot or the chat nobody is told; the page has it anyway.
func (p *Panel) tellAdminOfTicket(ctx context.Context, t db.Ticket, m db.TicketMessage) {
	g := p.Gateway
	if g == nil {
		return
	}
	ctx = context.WithoutCancel(ctx)
	g.Go(func() {
		ctx, cancel := context.WithTimeout(ctx, supportNoticeTimeout)
		defer cancel()
		if !g.InfrastructureEnabled(ctx) {
			return
		}
		chat, ok, err := g.InfrastructureAdminChat(ctx)
		if err != nil || !ok {
			return
		}
		client, err := g.InfrastructureClient(ctx)
		if err != nil {
			return
		}
		who := "tg " + strconv.FormatInt(t.TgID, 10)
		if c, err := p.st.Q.GetTgChat(ctx, t.TgID); err == nil && c.Username != "" {
			who = "@" + c.Username
		}
		body := m.Body
		if utf8.RuneCountInString(body) > ticketNoticeChars {
			body = string([]rune(body)[:ticketNoticeChars]) + "…"
		}
		text := fmt.Sprintf("💬 <b>Support message</b> #%d\n%s · %s\n\n%s\n\nAnswer it: Support, Tickets.", t.ID, html.EscapeString(who), html.EscapeString(t.Subject), html.EscapeString(body))
		if g.Lang(ctx) != "en" {
			text = fmt.Sprintf("💬 <b>Обращение в поддержку</b> #%d\n%s · %s\n\n%s\n\nОтветить: Поддержка, Обращения.", t.ID, html.EscapeString(who), html.EscapeString(t.Subject), html.EscapeString(body))
		}
		key := "ticket/" + strconv.FormatInt(m.ID, 10)
		// The picture is the bot's file, which the infrastructure bot may not be able to send:
		// the text goes alone then, through the alerts' queue.
		if m.Photo != "" {
			if _, err := client.SendPhoto(ctx, chat, m.Photo, text); err == nil {
				return
			}
		}
		if p.Alerts != nil {
			p.Alerts.Notify(ctx, key, text)
		}
	})
}
