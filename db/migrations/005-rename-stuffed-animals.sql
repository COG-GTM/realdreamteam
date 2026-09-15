-- Rename the "Stuffed Animals" category to "Toys and Clothes" everywhere it is
-- stored: the categories table, lots.category, and preferences.categories.
-- Idempotent: every statement is a plain UPDATE that no-ops when nothing matches.

BEGIN;

UPDATE categories SET name = 'Toys and Clothes' WHERE lower(name) = 'stuffed animals';

UPDATE lots SET category = 'Toys and Clothes' WHERE category = 'Stuffed Animals';

UPDATE preferences
   SET categories = array_replace(categories, 'Stuffed Animals', 'Toys and Clothes')
 WHERE 'Stuffed Animals' = ANY (categories);

COMMIT;
