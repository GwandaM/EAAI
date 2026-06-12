import { z } from 'zod';

/**
 * Response schemas for the Policy Service endpoints. Same role as
 * party-schemas.ts: the parse contract for upstream responses, kept
 * `.passthrough()` so extra API fields survive.
 */

// ---- Policy ----

export const PolicySchema = z
  .object({
    policyNumber: z.string(),
    productCode: z.string().nullish(),
    productName: z.string().nullish(),
    status: z.string().nullish(),
    startDate: z.string().nullish(),
    ownerEntityNumber: z.string().nullish(),
    currency: z.string().nullish(),
    premium: z.number().nullish(),
  })
  .passthrough();
export type Policy = z.infer<typeof PolicySchema>;

// ---- Values & performance ----

export const PolicyPerformanceValuesSchema = z
  .object({
    policyNumber: z.string().nullish(),
    asAtDate: z.string().nullish(),
    performanceValues: z
      .array(
        z
          .object({
            date: z.string().nullish(),
            value: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();
export type PolicyPerformanceValues = z.infer<
  typeof PolicyPerformanceValuesSchema
>;

export const PolicyValuesSchema = z
  .object({
    policyNumber: z.string().nullish(),
    asAtDate: z.string().nullish(),
    marketValue: z.number().nullish(),
    surrenderValue: z.number().nullish(),
    currency: z.string().nullish(),
  })
  .passthrough();
export type PolicyValues = z.infer<typeof PolicyValuesSchema>;

export const MrDetailsSchema = z
  .object({
    policyNumber: z.string().nullish(),
    fromDate: z.string().nullish(),
    toDate: z.string().nullish(),
  })
  .passthrough();
export type MrDetails = z.infer<typeof MrDetailsSchema>;

export const MoneyCategorySchema = z
  .object({
    category: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
  })
  .passthrough();
export type MoneyCategory = z.infer<typeof MoneyCategorySchema>;

// ---- Transactions & benefits ----

export const WithdrawalSchema = z
  .object({
    date: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
    type: z.string().nullish(),
    status: z.string().nullish(),
  })
  .passthrough();
export type Withdrawal = z.infer<typeof WithdrawalSchema>;

export const BenefitSchema = z
  .object({
    benefitType: z.string().nullish(),
    description: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
    startDate: z.string().nullish(),
  })
  .passthrough();
export type Benefit = z.infer<typeof BenefitSchema>;

export const SpecialOfferSchema = z
  .object({
    offerCode: z.string().nullish(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    validFrom: z.string().nullish(),
    validTo: z.string().nullish(),
  })
  .passthrough();
export type SpecialOffer = z.infer<typeof SpecialOfferSchema>;

export const OutstandingBillSchema = z
  .object({
    policyNumber: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
    dueDate: z.string().nullish(),
    status: z.string().nullish(),
  })
  .passthrough();
export type OutstandingBill = z.infer<typeof OutstandingBillSchema>;

// ---- Search ----

export const PolicySearchResultSchema = z
  .object({
    policyNumber: z.string(),
    productName: z.string().nullish(),
    status: z.string().nullish(),
    ownerEntityNumber: z.string().nullish(),
    ownerName: z.string().nullish(),
  })
  .passthrough();
export type PolicySearchResult = z.infer<typeof PolicySearchResultSchema>;

export const PagedPolicySearchSchema = z
  .object({
    items: z.array(PolicySearchResultSchema),
    page: z.number().nullish(),
    pageSize: z.number().nullish(),
    totalCount: z.number().nullish(),
  })
  .passthrough();
export type PagedPolicySearch = z.infer<typeof PagedPolicySearchSchema>;

// ---- Subscriptions ----

export const PolicySubscriptionSchema = z
  .object({
    entityNumber: z.string().nullish(),
    role: z.string().nullish(),
    status: z.string().nullish(),
    startDate: z.string().nullish(),
  })
  .passthrough();
export type PolicySubscription = z.infer<typeof PolicySubscriptionSchema>;
