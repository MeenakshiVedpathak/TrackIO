-- Fails if any company_code is longer than 20 chars (e.g. long Sub-BU codes).
ALTER TABLE companies ALTER COLUMN company_code TYPE VARCHAR(20);
