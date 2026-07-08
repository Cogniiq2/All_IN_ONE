
-- emails table
CREATE TABLE IF NOT EXISTS emails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email         text NOT NULL,
  account_display_name  text NOT NULL,
  account_color         text NOT NULL DEFAULT '#6B7280',
  message_id            text NOT NULL,
  from_email            text NOT NULL,
  from_name             text NOT NULL,
  subject               text NOT NULL,
  body_text             text NOT NULL DEFAULT '',
  body_preview          text NOT NULL DEFAULT '',
  received_at           timestamptz NOT NULL DEFAULT now(),
  has_attachments       boolean NOT NULL DEFAULT false,
  attachment_count      integer NOT NULL DEFAULT 0,
  is_processed          boolean NOT NULL DEFAULT false,
  is_read               boolean NOT NULL DEFAULT false,
  invoice_id            uuid REFERENCES invoices(id) ON DELETE SET NULL,
  supplier_name         text,
  property_id           uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS emails_message_id_idx ON emails (message_id);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_emails" ON emails FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_emails" ON emails FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_emails" ON emails FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_emails" ON emails FOR DELETE TO anon, authenticated USING (true);

-- email_attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id          uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  file_name         text NOT NULL,
  file_path         text NOT NULL DEFAULT '',
  mime_type         text NOT NULL DEFAULT 'application/pdf',
  file_size_bytes   integer NOT NULL DEFAULT 0,
  is_invoice        boolean NOT NULL DEFAULT false,
  invoice_id        uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_attachments_email_id_idx ON email_attachments (email_id);

ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_email_attachments" ON email_attachments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_email_attachments" ON email_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_email_attachments" ON email_attachments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_email_attachments" ON email_attachments FOR DELETE TO anon, authenticated USING (true);
