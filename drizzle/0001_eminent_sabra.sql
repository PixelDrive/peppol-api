DROP INDEX "enterprise_endpoints_identity_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_endpoints_identity_unique" ON "enterprise_endpoints" USING btree ("scheme","value");