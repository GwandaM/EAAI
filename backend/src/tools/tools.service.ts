import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ToolSet } from "ai";

import {
  buildScopeHeaders,
  createTools,
  type ToolScope,
  type ToolsConfig,
} from "../agent-tools";
import type { AppConfig } from "../config/configuration";

/**
 * The only NestJS-aware piece of the tool layer: binds validated AppConfig to
 * the framework-free composition root in `agent-tools/`, adding the shared
 * bearer token plus per-user scope headers.
 */
@Injectable()
export class ToolsService {
  private readonly base: Omit<ToolsConfig, "headers">;
  private readonly authHeaders: Record<string, string>;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    const aws = config.get("aws", { infer: true });
    const bedrock = config.get("bedrock", { infer: true });
    const companyApi = config.get("companyApi", { infer: true });

    this.base = {
      partyBaseUrl: companyApi.partyBaseUrl,
      policyBaseUrl: companyApi.policyBaseUrl,
      knowledgeBaseId: bedrock.knowledgeBaseId,
      awsRegion: aws.region,
    };
    this.authHeaders = companyApi.token
      ? { Authorization: `Bearer ${companyApi.token}` }
      : {};
  }

  createTools(scope?: ToolScope): ToolSet {
    return createTools({
      ...this.base,
      headers: { ...this.authHeaders, ...buildScopeHeaders(scope) },
    });
  }
}
