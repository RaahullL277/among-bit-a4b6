import { getAssistant } from '../assistant/registry.js';
import type { AssistantProvider, AssistantTools, ChatMessage } from '../assistant/types.js';
import type { PlatformService } from './platform.service.js';
import type { PlatformAnalyticsService } from './platform-analytics.service.js';

/**
 * Support chatbot for platform operators. Wires the read-only platform data
 * services in as assistant "tools" and delegates to the configured provider
 * (Claude or stub). Mutating actions are intentionally not exposed.
 */
export class SupportAssistantService {
  private readonly provider: AssistantProvider;

  constructor(
    private readonly platform: PlatformService,
    private readonly analytics: PlatformAnalyticsService,
    provider: AssistantProvider = getAssistant(),
  ) {
    this.provider = provider;
  }

  get providerName() {
    return this.provider.name;
  }

  async chat(messages: ChatMessage[]) {
    const tools: AssistantTools = {
      overview: () => this.analytics.overview({}),
      topMerchants: (limit) => this.analytics.topMerchants({ limit }),
      listTenants: (opts) => this.platform.listTenants(opts ?? {}),
      recentAudit: (limit) => this.platform.listAudit({ limit }),
    };
    return this.provider.chat(messages ?? [], tools);
  }
}
