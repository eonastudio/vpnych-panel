package botpanel

import (
	"context"

	"mikan/internal/panel/model"
	"mikan/internal/panel/tickets"
)

// Support by tickets in the bot: the account's own tickets (tickets.Service).

func (l *Local) TicketsOn(ctx context.Context) bool {
	return l.Desk != nil && l.Desk.On(ctx)
}

func (l *Local) Tickets(ctx context.Context, tgID int64) ([]model.Ticket, error) {
	if l.Desk == nil {
		return nil, nil
	}
	return l.Desk.Of(ctx, tgID)
}

func (l *Local) TicketThread(ctx context.Context, tgID, id int64) (model.Ticket, []model.TicketMessage, error) {
	if l.Desk == nil {
		return model.Ticket{}, nil, model.ErrTicketGone
	}
	return l.Desk.Thread(ctx, tgID, id)
}

func (l *Local) TicketCompose(ctx context.Context, tgID int64) (int64, bool) {
	if !l.TicketsOn(ctx) {
		return 0, false
	}
	return l.Desk.Composing(ctx, tgID)
}

func (l *Local) SetTicketCompose(ctx context.Context, tgID, id int64, on bool) error {
	if l.Desk == nil {
		return model.ErrTicketOff
	}
	if !on {
		return l.Desk.StopComposing(ctx, tgID)
	}
	return l.Desk.Compose(ctx, tgID, id)
}

func (l *Local) PostTicket(ctx context.Context, tgID, id int64, text, photo string) (model.Ticket, error) {
	if l.Desk == nil {
		return model.Ticket{}, model.ErrTicketOff
	}
	return l.Desk.Post(ctx, tgID, id, tickets.SourceBot, text, photo)
}

func (l *Local) CloseTicket(ctx context.Context, tgID, id int64) error {
	if l.Desk == nil {
		return model.ErrTicketGone
	}
	return l.Desk.Close(ctx, tgID, id)
}
