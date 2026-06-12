import { z } from 'zod';

/**
 * Response schemas for the Party Service endpoints. Each schema is the
 * contract for what the upstream API returns; tool `execute` functions parse
 * responses through these before handing data to the model. Schemas are
 * `.passthrough()` so fields the API adds are kept, not stripped.
 */

// ---- Party ----

export const PartyV2Schema = z
  .object({
    entityNumber: z.string(),
    partyType: z.string().nullish(),
    title: z.string().nullish(),
    initials: z.string().nullish(),
    name: z.string().nullish(),
    surname: z.string().nullish(),
    dateOfBirth: z.string().nullish(),
    idNumber: z.string().nullish(),
    registrationNumber: z.string().nullish(),
    email: z.string().nullish(),
    mobileNumber: z.string().nullish(),
    status: z.string().nullish(),
  })
  .passthrough();
export type PartyV2 = z.infer<typeof PartyV2Schema>;

export const RelatedPartySchema = z
  .object({
    entityNumber: z.string(),
    partyType: z.string().nullish(),
    name: z.string().nullish(),
    surname: z.string().nullish(),
    relationshipPath: z.string().nullish(),
    relationshipType: z.string().nullish(),
    depth: z.number().nullish(),
  })
  .passthrough();
export type RelatedParty = z.infer<typeof RelatedPartySchema>;

// ---- Subscriptions ----

export const SubscriptionSchema = z
  .object({
    policyNumber: z.string().nullish(),
    productName: z.string().nullish(),
    role: z.string().nullish(),
    status: z.string().nullish(),
    startDate: z.string().nullish(),
  })
  .passthrough();
export type Subscription = z.infer<typeof SubscriptionSchema>;

// ---- Broker ----

export const BrokerDetailsSchema = z
  .object({
    entityNumber: z.string(),
    brokerCode: z.string().nullish(),
    name: z.string().nullish(),
    surname: z.string().nullish(),
    email: z.string().nullish(),
    officeName: z.string().nullish(),
    status: z.string().nullish(),
  })
  .passthrough();
export type BrokerDetails = z.infer<typeof BrokerDetailsSchema>;

export const AumSummarySchema = z
  .object({
    entityNumber: z.string().nullish(),
    totalAum: z.number().nullish(),
    currency: z.string().nullish(),
    asAtDate: z.string().nullish(),
    breakdown: z
      .array(
        z
          .object({
            category: z.string().nullish(),
            amount: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();
export type AumSummary = z.infer<typeof AumSummarySchema>;

export const CommissionSummarySchema = z
  .object({
    entityNumber: z.string().nullish(),
    totalCommission: z.number().nullish(),
    currency: z.string().nullish(),
    fromDate: z.string().nullish(),
    toDate: z.string().nullish(),
    items: z
      .array(
        z
          .object({
            policyNumber: z.string().nullish(),
            amount: z.number().nullish(),
            date: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();
export type CommissionSummary = z.infer<typeof CommissionSummarySchema>;

export const ClientSearchSchema = z
  .object({
    items: z.array(
      z
        .object({
          entityNumber: z.string(),
          name: z.string().nullish(),
          surname: z.string().nullish(),
          idNumber: z.string().nullish(),
          email: z.string().nullish(),
        })
        .passthrough(),
    ),
    page: z.number().nullish(),
    pageSize: z.number().nullish(),
    totalCount: z.number().nullish(),
  })
  .passthrough();
export type ClientSearch = z.infer<typeof ClientSearchSchema>;

export const ClientCountSchema = z
  .object({
    count: z.number(),
  })
  .passthrough();
export type ClientCount = z.infer<typeof ClientCountSchema>;

// ---- Relationships ----

export const RelationshipSchema = z
  .object({
    entityNumber: z.string().nullish(),
    relatedEntityNumber: z.string().nullish(),
    relationshipType: z.string().nullish(),
    role: z.string().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
  })
  .passthrough();
export type Relationship = z.infer<typeof RelationshipSchema>;

export const RelationshipPathValidationItemSchema = z
  .object({
    fromEntityNumber: z.string().nullish(),
    toEntityNumber: z.string().nullish(),
    relationshipPath: z.string().nullish(),
    valid: z.boolean(),
    reason: z.string().nullish(),
  })
  .passthrough();
export type RelationshipPathValidationItem = z.infer<
  typeof RelationshipPathValidationItemSchema
>;

export const RelationshipPathValidationResponseSchema = z
  .object({
    valid: z.boolean().nullish(),
    results: z.array(RelationshipPathValidationItemSchema).nullish(),
  })
  .passthrough();
export type RelationshipPathValidationResponse = z.infer<
  typeof RelationshipPathValidationResponseSchema
>;
