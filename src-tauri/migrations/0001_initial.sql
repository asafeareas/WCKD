-- WCKD — schema inicial (versão 1)
-- Valores monetários: INTEGER em centavos. Datas: TEXT ISO 'YYYY-MM-DD'. Meses: 'YYYY-MM'.

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
    kind       TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
    color      TEXT    NOT NULL,
    icon       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (name COLLATE NOCASE, kind)
);

CREATE TABLE recurring_expenses (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    frequency    TEXT    NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    start_date   TEXT    NOT NULL, -- primeiro vencimento; define o dia de vencimento
    end_date     TEXT,             -- último vencimento possível (opcional)
    notes        TEXT,
    active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE installment_plans (
    id                INTEGER PRIMARY KEY,
    description       TEXT    NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 120),
    total_cents       INTEGER NOT NULL CHECK (total_cents > 0),
    installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 2 AND 420),
    first_date        TEXT    NOT NULL,
    category_id       INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    notes             TEXT,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (total_cents >= installment_count)
);

CREATE TABLE transactions (
    id                  INTEGER PRIMARY KEY,
    description         TEXT    NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 120),
    amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
    kind                TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
    category_id         INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    date                TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    notes               TEXT,
    recurring_id        INTEGER REFERENCES recurring_expenses (id) ON DELETE SET NULL,
    recurring_due_date  TEXT,
    installment_plan_id INTEGER REFERENCES installment_plans (id) ON DELETE CASCADE,
    installment_number  INTEGER,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK ((installment_plan_id IS NULL) = (installment_number IS NULL))
);

CREATE INDEX idx_transactions_date          ON transactions (date);
CREATE INDEX idx_transactions_kind_date     ON transactions (kind, date);
CREATE INDEX idx_transactions_category_date ON transactions (category_id, date);
-- Impede registrar duas vezes o pagamento do mesmo vencimento de uma conta recorrente.
CREATE UNIQUE INDEX idx_transactions_recurring_occurrence
    ON transactions (recurring_id, recurring_due_date) WHERE recurring_id IS NOT NULL;
CREATE UNIQUE INDEX idx_transactions_installment
    ON transactions (installment_plan_id, installment_number) WHERE installment_plan_id IS NOT NULL;

CREATE TABLE budgets (
    id          INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    month       TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
    UNIQUE (category_id, month)
);
CREATE INDEX idx_budgets_month ON budgets (month);

-- O tipo da transação precisa coincidir com o tipo da categoria.
CREATE TRIGGER trg_transactions_kind_insert BEFORE INSERT ON transactions
WHEN (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NEW.kind
BEGIN
    SELECT RAISE(ABORT, 'CATEGORY_KIND_MISMATCH');
END;

CREATE TRIGGER trg_transactions_kind_update BEFORE UPDATE OF category_id, kind ON transactions
WHEN (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NEW.kind
BEGIN
    SELECT RAISE(ABORT, 'CATEGORY_KIND_MISMATCH');
END;

-- Categorias iniciais
INSERT INTO categories (name, kind, color, icon) VALUES
    ('Alimentação', 'expense', '#F59E0B', 'utensils'),
    ('Transporte',  'expense', '#3B82F6', 'car'),
    ('Moradia',     'expense', '#8B5CF6', 'home'),
    ('Saúde',       'expense', '#EF4444', 'heart-pulse'),
    ('Educação',    'expense', '#06B6D4', 'graduation-cap'),
    ('Tecnologia',  'expense', '#6366F1', 'laptop'),
    ('Lazer',       'expense', '#EC4899', 'gamepad'),
    ('Assinaturas', 'expense', '#14B8A6', 'repeat'),
    ('Compras',     'expense', '#F97316', 'shopping-bag'),
    ('Vestuário',   'expense', '#A855F7', 'shirt'),
    ('Contas',      'expense', '#EAB308', 'receipt'),
    ('Outros',      'expense', '#71717A', 'circle-dot'),
    ('Salário',       'income', '#22C55E', 'briefcase'),
    ('Freelance',     'income', '#10B981', 'pen-tool'),
    ('Monetização',   'income', '#84CC16', 'play'),
    ('Afiliados',     'income', '#2DD4BF', 'link'),
    ('Investimentos', 'income', '#0EA5E9', 'trending-up'),
    ('Outros',        'income', '#71717A', 'circle-dot');
