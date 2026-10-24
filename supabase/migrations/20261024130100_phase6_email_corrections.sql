-- Email intake must not assert a currency before extraction has found one.
alter table invoices alter column currency drop not null;
