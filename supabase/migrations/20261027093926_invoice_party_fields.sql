alter table invoices
  add column bill_to jsonb,
  add column ship_to jsonb,
  add constraint invoices_bill_to_object check (bill_to is null or jsonb_typeof(bill_to) = 'object'),
  add constraint invoices_ship_to_object check (ship_to is null or jsonb_typeof(ship_to) = 'object');
