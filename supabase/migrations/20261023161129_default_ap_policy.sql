-- Safe starting policy. Historical versions stay in the existing policies table.
insert into policies(name,version,status,configuration,effective_from)
select 'Default AP Policy','1','ACTIVE','{
 "autoApproval":{"requiresPo":true,"maxQuantityVariancePercent":0,"maxPriceVariancePercent":2,"maxTotalVariancePercent":2,"maxAbsoluteAmountVariance":100,"minExtractionConfidence":0.9,"requireVendorMatch":true,"requireCurrencyMatch":true,"requireLineMatch":true,"requireSubtotalMatch":true,"requireTaxMatch":true,"requireTotalMatch":true,"rejectDuplicates":true,"requireTwoWayMatch":true,"requireThreeWayMatch":false},
 "review":{"missingPo":true,"ambiguousVendor":true,"ambiguousPo":true,"lowConfidence":true,"priceVarianceAboveLimit":true,"quantityVarianceAboveLimit":true,"totalVarianceAboveLimit":true,"threeWayMismatch":true,"currencyMismatch":true,"calculationMismatch":true,"unmatchedLine":true},
 "rejection":{"confirmedDuplicate":true,"blockedVendor":true,"invalidCurrency":false,"invalidInvoice":false,"alreadyProcessed":false}
}'::jsonb,now()
where not exists(select 1 from policies where status='ACTIVE');
