-- This is where the guide's offline answer set becomes a content type, so it goes through two-person approval.

ALTER TABLE content_versions DROP CONSTRAINT content_versions_type_check;
ALTER TABLE content_versions ADD CONSTRAINT content_versions_type_check
  CHECK (type IN ('questionnaire', 'ruleset', 'recommendation', 'referral_list', 'consent_doc', 'feedback_form',
                  'guide_chips', 'guide_answers', 'band_labels', 'safety', 'general'));
