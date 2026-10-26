-- name: GetReferralCode :one
SELECT code FROM referral_codes WHERE tg_id = $1;

-- name: CreateReferralCode :execrows
INSERT INTO referral_codes (tg_id, code, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: ReferrerOfCode :one
SELECT tg_id FROM referral_codes WHERE code = $1;

-- name: TagReferral :execrows
-- A friend is the referrer's from its first /start by the link, while it has neither a
-- subscription nor a payment: a customer is nobody's friend.
INSERT INTO referrals (tg_id, referrer, created_at)
SELECT sqlc.arg(tg_id)::bigint, sqlc.arg(referrer)::bigint, sqlc.arg(now)::bigint
WHERE sqlc.arg(tg_id)::bigint <> sqlc.arg(referrer)::bigint
  AND NOT EXISTS (SELECT 1 FROM tg_links WHERE tg_links.tg_id = sqlc.arg(tg_id)::bigint)
  AND NOT EXISTS (SELECT 1 FROM payments WHERE payments.tg_id = sqlc.arg(tg_id)::bigint AND payments.status = 'applied')
ON CONFLICT (tg_id) DO NOTHING;

-- name: GetReferral :one
SELECT * FROM referrals WHERE tg_id = $1;

-- name: EarnReferral :one
-- The friend's first paid tariff: once.
UPDATE referrals SET payment_id = sqlc.arg(payment_id), paid_at = sqlc.arg(now), days = sqlc.arg(days)
WHERE tg_id = sqlc.arg(tg_id) AND payment_id IS NULL RETURNING *;

-- name: RewardReferral :exec
UPDATE referrals SET user_id = sqlc.arg(user_id), rewarded_at = sqlc.arg(now) WHERE tg_id = sqlc.arg(tg_id);

-- name: WaitingReferrals :many
-- The rewards of a referrer that wait for a subscription of its.
SELECT * FROM referrals WHERE referrer = $1 AND payment_id IS NOT NULL AND rewarded_at IS NULL
ORDER BY paid_at, tg_id FOR UPDATE;

-- name: ReferrerSubscription :one
-- The subscription a referrer's reward goes to: the one its bot chat shows, else its newest.
SELECT l.user_id FROM tg_links l LEFT JOIN tg_chats c ON c.tg_id = l.tg_id
WHERE l.tg_id = $1
ORDER BY (c.current = l.user_id) DESC NULLS LAST, l.created_at DESC, l.user_id DESC LIMIT 1;

-- name: ReferralStatsOf :one
SELECT count(*)::bigint AS invited, count(paid_at)::bigint AS paid,
  coalesce(sum(days) FILTER (WHERE rewarded_at IS NOT NULL), 0)::bigint AS earned,
  coalesce(sum(days) FILTER (WHERE paid_at IS NOT NULL AND rewarded_at IS NULL), 0)::bigint AS waiting
FROM referrals WHERE referrer = $1;

-- name: ReferralTotals :one
SELECT count(*)::bigint AS invited, count(paid_at)::bigint AS paid,
  coalesce(sum(days) FILTER (WHERE rewarded_at IS NOT NULL), 0)::bigint AS earned,
  coalesce(sum(days) FILTER (WHERE paid_at IS NOT NULL AND rewarded_at IS NULL), 0)::bigint AS waiting,
  count(DISTINCT referrer)::bigint AS referrers
FROM referrals;

-- name: TopReferrers :many
SELECT r.referrer, count(*)::bigint AS invited, count(r.paid_at)::bigint AS paid,
  coalesce(sum(r.days) FILTER (WHERE r.rewarded_at IS NOT NULL), 0)::bigint AS earned,
  coalesce(max(c.username), '')::text AS username, coalesce(max(c.first_name), '')::text AS first_name
FROM referrals r LEFT JOIN tg_chats c ON c.tg_id = r.referrer
GROUP BY r.referrer ORDER BY paid DESC, invited DESC, r.referrer LIMIT $1;

-- name: RecentReferrals :many
SELECT r.tg_id, r.referrer, r.created_at, r.paid_at, r.days, r.rewarded_at,
  coalesce(f.username, '')::text AS username, coalesce(f.first_name, '')::text AS first_name,
  coalesce(c.username, '')::text AS referrer_username, coalesce(c.first_name, '')::text AS referrer_first_name
FROM referrals r LEFT JOIN tg_chats f ON f.tg_id = r.tg_id LEFT JOIN tg_chats c ON c.tg_id = r.referrer
ORDER BY r.created_at DESC, r.tg_id DESC LIMIT $1;
