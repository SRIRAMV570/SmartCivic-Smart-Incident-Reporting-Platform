BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id    BIGINT NOT NULL
                    REFERENCES users(user_id) ON DELETE CASCADE,
  feedback_id     BIGINT NOT NULL
                    REFERENCES feedback(feedback_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         TIMESTAMPTZ,
  CONSTRAINT notifications_once_per_recipient_feedback
    UNIQUE (recipient_id, feedback_id)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON notifications (recipient_id, created_at DESC);

COMMIT;
