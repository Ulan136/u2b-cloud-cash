import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  comment: text("comment"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const firms = pgTable("firms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Справочник работников (для Зарплаты)
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phone: text("phone"),
  comment: text("comment"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Справочник поставщиков / фирм (для КОНС)
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phone: text("phone"),
  comment: text("comment"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cashDays = pgTable("cash_days", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  klaudObshch: numeric("klaud_obshch").default("0"),
  sebestoimost: numeric("sebestoimost").default("0"),
  nalichnye: numeric("nalichnye").default("0"),
  kaspi: numeric("kaspi").default("0"),
  halyk: numeric("halyk").default("0"),
  inkasNalichka: numeric("inkas_nalichka").default("0"),
  vozvrat: numeric("vozvrat").default("0"),
  zakupTovar: numeric("zakup_tovar").default("0"),
  comment: text("comment"),
  closed: boolean("closed").default(false),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"), // 'manual' | 'auto'
});

export const cashExpenses = pgTable("cash_expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount").notNull(),
  comment: text("comment"),
});

export const debts = pgTable("debts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  clientId: integer("client_id").references(() => clients.id),
  debtAmount: numeric("debt_amount").default("0"),
  paymentAmount: numeric("payment_amount").default("0"),
  comment: text("comment"),
  returnDate: date("return_date"),
});

export const incassation = pgTable("incassation", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  operation: text("operation").notNull(),
  cash: numeric("cash").default("0"),
  kaspi: numeric("kaspi").default("0"),
  halyk: numeric("halyk").default("0"),
  comment: text("comment"),
});

export const salary = pgTable("salary", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  employee: text("employee").notNull(),
  amount: numeric("amount").notNull(),
  comment: text("comment"),
});

export const kons = pgTable("kons", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  supplier: text("supplier").notNull(),
  prihod: numeric("prihod").default("0"),
  rashod: numeric("rashod").default("0"),
  comment: text("comment"),
});

// ── Финансовый модуль ──
export const finCategories = pgTable("fin_categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
});

export const finAccounts = pgTable("fin_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  categoryId: integer("category_id").references(() => finCategories.id),
  icon: text("icon"),
  initialBalance: numeric("initial_balance").default("0"),
  archived: boolean("archived").default(false),
});

export const finOps = pgTable("fin_ops", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  name: text("name"),
  accountId: integer("account_id")
    .notNull()
    .references(() => finAccounts.id),
  type: text("type").notNull(), // Приход / Расход / Перевод
  amount: numeric("amount").notNull(),
  comment: text("comment"),
  toAccountId: integer("to_account_id").references(() => finAccounts.id),
});

// Себестоимость помесячно (для годового отчёта). Отдельно от cash_days.sebestoimost.
export const monthlyCosts = pgTable(
  "monthly_costs",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    sebestoimost: numeric("sebestoimost").default("0"),
  },
  (t) => ({
    ym: unique("monthly_costs_year_month_unique").on(t.year, t.month),
  })
);

export const finFavs = pgTable("fin_favs", {
  id: serial("id").primaryKey(),
  name: text("name"),
  accountId: integer("account_id").references(() => finAccounts.id),
  type: text("type"),
  amount: numeric("amount"),
});
