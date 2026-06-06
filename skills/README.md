# ACP commerce skills for Claude

These are **Claude Agent Skills** that teach Claude how to set up and run each feature of the
platform **through the [ACP MCP connector](../README.md#mcp-connector--build--launch-a-store-with-claude)**.
Each skill is a `SKILL.md` with frontmatter (`name`, `description`) that Claude matches against the
user's request, plus a short, tool-driven recipe.

When a Claude user has the connector installed and says, e.g., *"set up a loyalty program"* or
*"launch my store"*, the matching skill loads and walks Claude through the exact connector tools.

## Skills

| Skill | Sets up | Key connector tools |
|-------|---------|---------------------|
| `acp-launch-store` | Create & launch a store from zero | `create_account`, `launch_store` |
| `acp-payments` | Payments & checkout (Razorpay/GoKwik) | `configure_payment_provider`, `checkout` |
| `acp-reviews` | Customer reviews & moderation | `list_reviews`, `moderate_review` |
| `acp-bundles` | Bundles / frequently bought together | `create_bundle`, `list_bundles` |
| `acp-loyalty` | Loyalty / rewards program | `set_loyalty_program`, `adjust_loyalty_points` |
| `acp-subscriptions` | "Subscribe & save" recurring orders | `set_subscription_settings`, `create_subscription` |
| `acp-store-design` | Storefront pages + theme (page builder) | `create_page`, `publish_page`, `set_store_theme` |
| `acp-seo` | SEO audit, meta, image optimization | `seo_audit`, `set_seo_settings`, `optimize_images` |
| `acp-pricing` | Competitor tracking + repricing + margins | `set_pricing_rule`, `add_competitor_price`, `analyze_pricing`, `run_repricing` |
| `acp-returns` | Returns / RMA / refunds | `list_returns`, `update_return` |
| `acp-marketing` | Email marketing (Klaviyo/Mailchimp/Brevo) | `configure_marketing`, `sync_marketing` |
| `acp-support-chatbot` | Storefront AI sales & support chatbot | `configure_support_bot` |
| `acp-shipping` | Shipping / fulfillment (Delhivery) | `configure_shipping`, `create_shipment` |
| `acp-notifications` | Email / SMS / WhatsApp notifications | `configure_email/sms/whatsapp`, `set_notification_preference` |
| `acp-partner` | Partner: dashboard + build for client stores | `partner_dashboard`, `list_clients`, `use_client` |

## Install

1. **Connect the MCP connector** first (see the repo README → *MCP connector*). The credential decides
   the mode: none → onboarding, `sk_…` → merchant, `pts_…` → partner.
2. **Add the skills** so Claude can discover them. Copy the folders to your personal skills directory:

   ```bash
   cp -r skills/* ~/.claude/skills/
   ```

   (Or bundle this `skills/` directory inside a Claude plugin's `skills/` folder for distribution.)

3. Ask naturally — *"launch a tea store with three products"*, *"set up subscriptions at 15% off
   monthly"*, *"track my competitors and reprice with a 20% margin floor"* — and the matching skill
   loads and drives the connector.

## Notes

- Every skill operates over the same `@acp/core` service layer the REST API and dashboards use, so the
  agent and a human get identical results.
- A good starting point for any new user is **`acp-launch-store`**; partners should start with
  **`acp-partner`** to pick a client, after which every other skill applies to that client's store
  (subject to the access level the client granted).
