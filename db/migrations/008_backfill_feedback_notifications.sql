BEGIN;

INSERT INTO notifications (recipient_id, feedback_id)
SELECT recipients.recipient_id, recipients.feedback_id
FROM (
  SELECT admin.user_id AS recipient_id, feedback.feedback_id
  FROM feedback
  CROSS JOIN users admin
  WHERE admin.role = 'admin'
    AND admin.auth_account_id IS NOT NULL
    AND admin.is_active = true

  UNION

  SELECT assignment.officer_id AS recipient_id, feedback.feedback_id
  FROM feedback
  JOIN assignments assignment
    ON assignment.incident_id = feedback.incident_id
) recipients
ON CONFLICT (recipient_id, feedback_id) DO NOTHING;

COMMIT;
