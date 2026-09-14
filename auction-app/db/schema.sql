CREATE TABLE IF NOT EXISTS users       (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id),
                          categories TEXT,   -- JSON array of strings
                          artists    TEXT,   -- JSON array of strings
                          keywords   TEXT,   -- JSON array of strings
                          min_price  INTEGER, max_price INTEGER);
CREATE TABLE IF NOT EXISTS events      (id TEXT PRIMARY KEY, title TEXT, location TEXT, starts_at TEXT);
CREATE TABLE IF NOT EXISTS items       (id TEXT PRIMARY KEY, event_id TEXT REFERENCES events(id),
                          title TEXT, artist TEXT, category TEXT,
                          estimate_low INTEGER, estimate_high INTEGER,
                          image_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes       (user_id INTEGER REFERENCES users(id), item_id TEXT REFERENCES items(id),
                          PRIMARY KEY (user_id, item_id));
CREATE TABLE IF NOT EXISTS tickets     (user_id INTEGER REFERENCES users(id), event_id TEXT REFERENCES events(id),
                          PRIMARY KEY (user_id, event_id));
CREATE TABLE IF NOT EXISTS bids        (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id),
                          item_id TEXT REFERENCES items(id),
                          amount INTEGER, placed_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications (user_id INTEGER REFERENCES users(id), item_id TEXT REFERENCES items(id),
                          sent_at TEXT, PRIMARY KEY (user_id, item_id));
