-- name: CreateTicket :one
INSERT INTO tickets (tg_id, subject, source, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING *;

-- name: GetTicket :one
SELECT * FROM tickets WHERE id = $1;

-- name: TicketsOf :many
SELECT * FROM tickets WHERE tg_id = $1 ORDER BY (status <> 'closed') DESC, updated_at DESC, id DESC LIMIT $2;

-- name: CountOpenTicketsOf :one
SELECT count(*) FROM tickets WHERE tg_id = $1 AND status <> 'closed';

-- name: ListTickets :many
-- The admin's list: by status ('' all), newest change first; before is the updated_at and id
-- of the last one shown (0: the first page).
SELECT * FROM tickets
WHERE (sqlc.arg(status)::text = '' OR status = sqlc.arg(status)::text)
  AND (sqlc.arg(before_at)::bigint = 0 OR (updated_at, id) < (sqlc.arg(before_at)::bigint, sqlc.arg(before_id)::bigint))
ORDER BY updated_at DESC, id DESC LIMIT sqlc.arg(lim);

-- name: CountTicketsByStatus :many
SELECT status, count(*) AS n, count(*) FILTER (WHERE admin_unread) AS unread FROM tickets GROUP BY status;

-- name: TouchTicketByUser :execrows
UPDATE tickets SET status = 'open', admin_unread = TRUE, updated_at = $1 WHERE id = $2 AND tg_id = $3;

-- name: TouchTicketByAdmin :execrows
UPDATE tickets SET status = 'answered', user_unread = TRUE, updated_at = $1 WHERE id = $2;

-- name: SetTicketStatus :execrows
UPDATE tickets SET status = $1, updated_at = $2 WHERE id = $3;

-- name: CloseTicketOf :execrows
UPDATE tickets SET status = 'closed', updated_at = $1 WHERE id = $2 AND tg_id = $3 AND status <> 'closed';

-- name: MarkTicketReadByAdmin :exec
UPDATE tickets SET admin_unread = FALSE WHERE id = $1;

-- name: MarkTicketReadByUser :exec
UPDATE tickets SET user_unread = FALSE WHERE id = $1 AND tg_id = $2;

-- name: DeleteTicket :execrows
DELETE FROM tickets WHERE id = $1;

-- name: AddTicketMessage :one
INSERT INTO ticket_messages (ticket_id, from_admin, admin_id, body, photo, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: TicketMessages :many
SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY id;

-- name: GetTicketMessage :one
SELECT * FROM ticket_messages WHERE id = $1;

-- name: LastTicketMessage :one
SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY id DESC LIMIT 1;

-- name: SetTicketCompose :exec
INSERT INTO ticket_compose (tg_id, ticket_id, created_at) VALUES ($1, $2, $3)
ON CONFLICT (tg_id) DO UPDATE SET ticket_id = EXCLUDED.ticket_id, created_at = EXCLUDED.created_at;

-- name: GetTicketCompose :one
SELECT * FROM ticket_compose WHERE tg_id = $1;

-- name: DropTicketCompose :exec
DELETE FROM ticket_compose WHERE tg_id = $1;
