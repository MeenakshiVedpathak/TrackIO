-- Sub-BU codes are "<parentCode>-<n>"; a 20-char parent code plus suffix
-- needs more room. User-supplied codes stay capped at 20 by Joi.
ALTER TABLE companies ALTER COLUMN company_code TYPE VARCHAR(30);
