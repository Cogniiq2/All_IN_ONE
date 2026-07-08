/*
# Invoice Upload: Table + Storage Bucket + Policies

## Summary
Sets up the backend for the invoice upload feature in the admin app.

## Changes

### 1. New Table: `invoices`
Stores metadata for every uploaded invoice file. This is separate from the mock data — each uploaded file creates one row here, which the n8n webhook then enriches with extracted fields.

Columns:
- `id` (uuid, PK) — auto-generated, used as the invoice_id in the webhook payload
- `file_path` (text, not null) — storage path: raw/{year}/{month}/{uuid}.{ext}
- `file_name` (text, not null) — original filename uploaded by the user
- `mime_type` (text, not null) — MIME type of the uploaded file
- `status` (text, default 'pending') — processing status
- `review_status` (text, default 'pending_review') — human review status
- `created_at` (timestamptz, default now())

### 2. Storage Bucket: `invoices`
Private bucket for raw invoice files. Files uploaded at path raw/{year}/{month}/{uuid}.{ext}.

### 3. Security
RLS enabled on `invoices` table. Single-tenant admin app — anon + authenticated can read and write (the anon key is the admin session key).

Storage object policies allow anon + authenticated to upload and read within the `invoices` bucket.
*/

-- Table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  review_status text NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_invoices" ON invoices;
CREATE POLICY "anon_select_invoices" ON invoices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_invoices" ON invoices;
CREATE POLICY "anon_insert_invoices" ON invoices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_invoices" ON invoices;
CREATE POLICY "anon_update_invoices" ON invoices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_invoices" ON invoices;
CREATE POLICY "anon_delete_invoices" ON invoices FOR DELETE
  TO anon, authenticated USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "invoices_upload" ON storage.objects;
CREATE POLICY "invoices_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_read" ON storage.objects;
CREATE POLICY "invoices_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_delete" ON storage.objects;
CREATE POLICY "invoices_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'invoices');
