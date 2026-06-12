import {
    BedrockAgentRuntimeClient,
    RetrieveCommand,
    RetrievalResultLocation,
    KnowledgeBaseRetrievalResult,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { tool } from "ai";
import { z } from "zod";

function extractSourceUrl(
    location: RetrievalResultLocation | undefined,
): string | null {
    if (!location) return null;

    return (
        location.s3Location?.uri ??
        location.webLocation?.url ??
        location.confluenceLocation?.url ??
        location.salesforceLocation?.url ??
        location.sharePointLocation?.url ??
        location.kendraDocumentLocation?.uri ??
        null
    );
}

function mapResult(r: KnowledgeBaseRetrievalResult) {
    const contentText = r.content?.text ?? "";
    const rows = r.content?.row?.map((col) => ({
        columnName: col.columnName ?? "",
        value: col.columnValue ?? "",
        type: col.type,
    }));

    return {
        contentText,
        ...(rows?.length ? { rows } : {}),
        score: r.score ?? 0,
        sourceType: r.location?.type ?? null,
        sourceUrl: extractSourceUrl(r.location),
        metadata: r.metadata ?? null,
    };
}

export function createKnowledgeBaseTool(
    knowledgeBaseId: string,
    region: string,
) {
    const client = new BedrockAgentRuntimeClient({ region });

    return {
        queryKnowledgeBase: tool({
            description:
                "Query the investment product knowledge base for information about funds, policies, " +
                "product rules, fees, fund fact sheets, and other reference documentation. " +
                "Use this tool when the user asks general questions about investment products, fund details, " +
                "charges, or anything that would be found in official product documentation.",
            inputSchema: z.object({
                query: z
                    .string()
                    .describe(
                        "The natural-language question or search query to run against the knowledge base.",
                    ),
                numberOfResults: z
                    .number()
                    .default(5)
                    .describe("Number of relevant passages to retrieve (1-10)."),
            }),
            execute: async ({ query, numberOfResults }) => {
                try {
                    const command = new RetrieveCommand({
                        knowledgeBaseId,
                        retrievalQuery: { text: query },
                        retrievalConfiguration: {
                            vectorSearchConfiguration: {
                                numberOfResults: Math.min(Math.max(numberOfResults, 1), 10),
                            },
                        },
                    });

                    const response = await client.send(command);
                    const results = (response.retrievalResults ?? []).map(mapResult);

                    return {
                        query,
                        retrievalStatus: "available",
                        resultsCount: results.length,
                        results,
                    };
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    return {
                        query,
                        retrievalStatus: "unavailable",
                        resultsCount: 0,
                        results: [],
                        error: {
                            message,
                        },
                    };
                }
            },
        }),
    };
}
