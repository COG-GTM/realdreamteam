BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_idx
  ON categories (lower(name));

COMMENT ON TABLE categories IS 'Admin-managed lot categories. Names remain denormalized in lots and preferences.';
COMMENT ON COLUMN categories.id IS 'Surrogate integer key.';
COMMENT ON COLUMN categories.name IS 'Display spelling used in lot and preference text values. Case-insensitively unique.';
COMMENT ON COLUMN categories.position IS 'Display order, starting at 1.';
COMMENT ON COLUMN categories.active IS 'Whether this category can be selected for new preferences and lots.';
COMMENT ON COLUMN categories.created_at IS 'When the category was created.';

INSERT INTO categories (name, position)
VALUES
  ('Contemporary Art', 1),
  ('Modern British Art', 2),
  ('Photography', 3),
  ('Watches', 4),
  ('Cars', 5),
  ('Jewellery', 6),
  ('Wine & Spirits', 7),
  ('Design', 8),
  ('Books & Manuscripts', 9),
  ('Toys and Clothes', 10),
  ('Miscellaneous IT Items', 11)
ON CONFLICT ((lower(name))) DO NOTHING;

COMMIT;
