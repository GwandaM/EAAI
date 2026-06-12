# Knowledge Base Integration Plan

## Overview

The structure contains an application layer with existing domain endpoints and a separate knowledge-base query path. The knowledge-base path sends user or system questions to AWS Bedrock Knowledge Base, which retrieves relevant context from a vector store.

## Main Components

- Application/API layer
- Policy-related API group
- Party, broker, and relationship API group
- `queryKnowledgeBase`
- AWS Bedrock Knowledge Base
- Knowledge Base Vector Store

## Policy API Group

This group covers policy lookup, policy values, benefits, subscriptions, and related servicing workflows.

- `getPolicy`
- `getPolicyPerformanceValues`
- `getPolicyValues`
- `getMrDetails`
- `getMoneyCategories`
- `getWithdrawals`
- `getBenefits`
- `getSpecialOffers`
- `getOutstandingBills`
- `searchPolicies`
- `pagedSearchPolicies`
- `getPolicySubscriptions`

## Party, Broker, and Relationship API Group

This group covers party details, broker details, broker clients, subscriptions, and relationship validation.

- `getParty`
- `getRelatedParties`
- `getSubscriptions`
- `getBrokerDetails`
- `getAumSummary`
- `getCommissionSummary`
- `searchBrokerClients`
- `getGriffinCandidateFor`
- `getPartyRelationships`
- `getOrganisationRelationships`
- `validateRelationshipPath`
- `validateRelationshipPaths`

## Knowledge Base Query Flow

1. The application receives a request that needs knowledge-base context.
2. The application calls `queryKnowledgeBase`.
3. `queryKnowledgeBase` sends the query to AWS Bedrock Knowledge Base.
4. AWS Bedrock Knowledge Base retrieves matching context from the Knowledge Base Vector Store.
5. The retrieved context is returned to the application.
6. The application combines the knowledge-base response with existing domain data where needed.

## Intended Structure

- Keep existing policy, party, broker, and relationship endpoints as the source of structured business data.
- Use `queryKnowledgeBase` only for unstructured or semantic retrieval.
- Treat AWS Bedrock Knowledge Base as the retrieval layer.
- Treat the Knowledge Base Vector Store as the indexed document and embedding store.
- Keep the knowledge-base path separate from transactional policy and party endpoints.

## Implementation Plan

1. Define the request and response contract for `queryKnowledgeBase`.
2. Add the AWS Bedrock Knowledge Base client integration.
3. Configure the Knowledge Base Vector Store and ingestion pipeline.
4. Connect `queryKnowledgeBase` to the Bedrock retrieval API.
5. Add error handling for unavailable knowledge-base responses.
6. Add logging for query text, retrieval status, and returned source metadata.
7. Add tests for successful retrieval, empty results, and provider failures.
8. Document when to use domain APIs versus `queryKnowledgeBase`.

## Notes

- The endpoint names above are transcribed from the supplied diagram.
- `queryKnowledgeBase` should not replace the structured API endpoints.
- The knowledge-base integration should enrich responses with retrieved context, not become the source of record for policy or party data.
