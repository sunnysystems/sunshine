# Sunshine Datadog Co-Pilot

**English · Português**

Sunshine evolved from a multi-tenant SaaS template into a bilingual product accelerator focused on extracting more value from Datadog. The goal is to offer a unified cockpit where platform teams can:

- Configure Datadog API + Application Keys once and unlock tailored workflows.
- Prototype observability, FinOps, and automation ideas before wiring real data.
- Test MCP-powered assistants that bring Datadog insights to GitHub and Slack.

> Sunshine started as an open scaffolding. We forked it to keep the strong base (Next.js 15, Supabase, shadcn/ui) and layered new Datadog-centric experiences on top.

---

## 🎯 Value Proposition

| English | Português |
| --- | --- |
| Centralize Datadog usage insights, tune costs, and automate improvements with guided UX flows. | Centralize insights do Datadog, otimize custos e automatize melhorias com fluxos guiados. |

Key capabilities:

- **Datadog Credential Guard** (Owner/Admin only) – store API/App keys securely (mock today, Supabase tomorrow).
- **Bilingual UI** – all new modules ship with `en-US` and `pt-BR` copy by default.
- **Feature Flagged Modules** – `datadogSuite` flag controls visibility and keeps iteration safe.
- **Mock-first Workflows** – dashboards, tables, and cards simulate the data we expect once backend wiring lands.

---

## 🧱 Architecture Snapshot

- **Frameworks**: Next.js 15 App Router, React 19, TypeScript 5.
- **Design System**: Tailwind CSS 4 + shadcn/ui.
- **Authentication**: NextAuth.js + Supabase Auth (RLS already configured).
- **Data Layer (futuro)**: Supabase tables storing Datadog credentials, forecasts, and playbooks.
- **Feature Flags**: `config/features.config.ts` with server/client toggles (`FEATURES__*`, `NEXT_PUBLIC_FEATURES__*`).

Legacy modules (billing, analytics, notifications, etc.) remain available but stay disabled unless you enable their flags.

---

## 🚀 Getting Started

```bash
git clone https://github.com/sunnysystems/sunshine.git
cd sunshine
npm install
cp env.example .env.local
npm run dev
```

### Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project for auth & storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Needed once we persist Datadog credentials |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth session handling |
| `JWT_SECRET` | Internal microservice communication |
| `FEATURES__DATADOG_SUITE`, `NEXT_PUBLIC_FEATURES__DATADOG_SUITE` | Optional override (defaults to `true`) |

Optional integrations (Stripe, Resend, Google OAuth) remain documented inside `env.example`.

---

## 🧭 Module Overview

| Area | Description (EN) | Descrição (PT) | Status |
| --- | --- | --- | --- |
| **Datadog API Credentials** | Owner/Admin configure API + App keys, unlocking downstream pages. | Proprietário/Admin configuram API + App keys e liberam as demais páginas. | Mock save (local) |
| **Observability Workspace** | Cost Guard, Status Pages, Synthetic Runs, Log Filters, Business KPIs, Correlation Stories, Maturity Heatmap. | Guardião de Custos, Status Pages, Sintéticos, Filtros de Logs, KPIs de Negócio, Histórias de Correlação, Mapa de Maturidade. | Mock data |
| **Automation Lab (MCP)** | Natural language queries, profiler analysis → PRs, error auto-fixes, AI cost insights. | Perguntas em linguagem natural, profiler → PRs, correções automáticas, insights de custo via IA. | Mock flows |
| **Integrations & FinOps** | Slack funnel, webhook orchestration, predictive budgets and alerts. | Hub Slack, orquestração via webhooks, previsões de budget e alertas. | Mock data |

All pages rely on `useTranslation` to read from `lib/translations.ts`, guaranteeing parity between English and Portuguese.

---

## 📂 Key Folders

```
src/
├── app/
│   └── [tenant]/
│       ├── datadog/
│       │   ├── api-credentials/          # Credential onboarding
│       │   ├── automation/               # MCP mock workflows
│       │   ├── finops/                   # FinOps forecasts
│       │   ├── integrations/             # Communication channels
│       │   └── observability/            # Dashboards & stories
├── components/
│   └── datadog/                          # Shared UI primitives for new pages
├── lib/
│   └── translations.ts                   # i18n dictionary (en-US + pt-BR)
└── config/
    └── features.config.ts                # Feature flag registry
```

We keep the original scaffolding (auth, organizations, billing, etc.) untouched for reuse.

---

## 🔐 Roles & Access

- **Owner & Admin**
  - Can open Datadog API Credential page.
  - Once credentials are stored, they access Observability, Automation, Integrations, FinOps pages.
- **Member**
  - Read-only for dashboards once enabled.
  - No access to credential configuration.

Page routing is enforced via tenant-aware middleware plus role checks inside the new pages.

---

## 🗺️ Roadmap

| Milestone | English Summary | Resumo em Português | ETA |
| --- | --- | --- | --- |
| 🏁 Mock UX Delivery | All Datadog pages with mock data + translations. | Todas as páginas Datadog com dados mock + traduções. | ✅ |
| 🔒 Supabase Persistence | Persist API/App keys and FinOps signals with RLS. | Persistir API/App keys e projeções FinOps com RLS. | Q1 |
| 🔗 Datadog API Wiring | Call usage, billing, SLO, incidents APIs. | Conectar APIs de uso, billing, SLO, incidentes. | Q1 |
| 🤖 MCP Automation | Connect Datadog MCP + GitHub PR flows. | Integrar MCP do Datadog + automação de PRs. | Q2 |
| 📣 Slack/Webhook Orchestration | Slash commands, webhook delivery of insights. | Comandos Slack, entrega de insights via webhook. | Q2 |

---

## 🤝 Contributing

1. Fork and branch (`feat/datadog-<feature>`).
2. Keep translations mirrored (`en-US` + `pt-BR`).
3. Run `npm run lint` and `npm test`.
4. Describe which Datadog workflow your PR touches.

---

## 📞 Support

- Open an issue describing the observability scenario you want to cover.
- Share screenshots or copy for English + Portuguese to speed things up.
- For roadmap or partnership talks, reach the Sunny Systems platform team.

