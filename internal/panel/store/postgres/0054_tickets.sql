-- +goose Up
-- Support tickets: a Telegram account writes to support in the bot or the Mini App, the admin
-- answers in the panel. A ticket is open while it waits for the admin, answered when the admin
-- spoke last, closed when either side closed it (a new message opens it again).
CREATE TABLE tickets (
  id           BIGSERIAL PRIMARY KEY,
  tg_id        BIGINT NOT NULL,
  subject      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  source       TEXT NOT NULL DEFAULT 'bot' CHECK (source IN ('bot', 'miniapp')),
  admin_unread BOOLEAN NOT NULL DEFAULT TRUE,  -- the account wrote since the admin looked
  user_unread  BOOLEAN NOT NULL DEFAULT FALSE, -- the admin answered since the account looked
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX tickets_tg ON tickets (tg_id, id DESC);
CREATE INDEX tickets_status ON tickets (status, updated_at DESC);
-- The messages of a ticket: the account's or an admin's; photo is a Telegram file id.
CREATE TABLE ticket_messages (
  id         BIGSERIAL PRIMARY KEY,
  ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_admin BOOLEAN NOT NULL DEFAULT FALSE,
  admin_id   BIGINT,
  body       TEXT NOT NULL DEFAULT '',
  photo      TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE INDEX ticket_messages_ticket ON ticket_messages (ticket_id, id);
-- What the bot's chat is writing now: the next message goes to this ticket (0: a new one).
CREATE TABLE ticket_compose (
  tg_id      BIGINT PRIMARY KEY,
  ticket_id  BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

-- +goose Down
DROP TABLE ticket_compose;
DROP TABLE ticket_messages;
DROP TABLE tickets;
