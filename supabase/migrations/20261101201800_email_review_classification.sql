alter table email_intakes drop constraint if exists email_intakes_classification_check;
alter table email_intakes add constraint email_intakes_classification_check
 check (classification in ('INVOICE','POSSIBLE_INVOICE','NON_INVOICE','UNSUPPORTED','REVIEW_REQUIRED'));
