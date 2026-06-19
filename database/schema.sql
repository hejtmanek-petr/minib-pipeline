-- MINIB Project Pipeline schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'DEALER',        -- 'HQ' | 'DEALER'
  preferred_language TEXT DEFAULT 'en',
  countries TEXT,                    -- JSON array, e.g. '["TR","AZ"]'
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT UNIQUE,
  sheet TEXT NOT NULL,               -- 'TR' or 'CIS'
  country TEXT,
  region TEXT,
  project_name TEXT,
  company TEXT,
  client_name TEXT,
  investor TEXT,
  general_contractor TEXT,
  installation_company TEXT,
  building_type TEXT,

  minib_price_eur REAL,
  project_value_eur REAL,
  currency TEXT DEFAULT 'EUR',
  project_value_local REAL,
  exchange_rate REAL,

  products_and_quantity TEXT,
  competition TEXT,

  estimated_decision_date TEXT,
  estimated_delivery_date TEXT,
  actual_order_date TEXT,

  status TEXT DEFAULT 'active',      -- lead | active | won | lost | on_hold
  phase TEXT,                        -- project_stage | tender | order | delivery
  current_status_note TEXT,

  owner TEXT,
  dealer_user_id INTEGER REFERENCES users(id),

  win_prob_manual_min INTEGER,
  win_prob_manual_max INTEGER,
  win_prob_ai INTEGER,
  win_prob_ai_min INTEGER,
  win_prob_ai_max INTEGER,
  win_prob_ai_reasoning TEXT,
  win_prob_ai_updated_at TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  source TEXT DEFAULT 'text',        -- 'text' | 'voice'
  original_language TEXT,            -- 'cs' | 'en' | 'de' | 'tr'
  raw_transcript TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  model TEXT,
  quantity REAL,
  unit_price_eur REAL,
  total_price_eur REAL,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_sheet ON projects(sheet);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_history_project ON project_history(project_id);
CREATE INDEX IF NOT EXISTS idx_product_lines_project ON product_lines(project_id);
