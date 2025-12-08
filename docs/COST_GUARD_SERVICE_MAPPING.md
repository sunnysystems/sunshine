# Datadog Cost Guard Service Mapping

Este documento descreve como cada serviço da quote do Datadog é mapeado para as APIs do Datadog e como o Cost Guard rastreia o uso de cada serviço.

## Visão Geral

O Cost Guard rastreia serviços individuais negociados em contratos Datadog. Cada serviço é mapeado para:
- Um `product_family` da API v2 do Datadog
- Um `usage_type` específico (quando aplicável)
- Uma função de extração de uso que processa a resposta da API
- Uma unidade de medida (hosts, GB, milhões, etc.)

## Modelo de Cobrança e Agregação

**IMPORTANTE**: O Datadog sempre cobra o mês completo, do dia 1 ao último dia do mês. O commit é sempre mensal.

### Período de Agregação

- **Sempre agregar do dia 1 do mês atual até o dia atual** (ou último dia do mês se já passou)
- O uso mostrado reflete o consumo acumulado do mês atual (dia 1 até hoje)
- A projeção considera o uso do mês atual e projeta para o resto do mês

### Métricas de Capacidade vs Volume

A API `/api/v2/usage/hourly_usage` retorna valores **por hora** para cada métrica. Dependendo do tipo de métrica, usamos diferentes estratégias de agregação:

#### Métricas de Capacidade (usar MÁXIMO)
Para métricas que representam capacidade simultânea (containers, hosts, functions), usamos o **valor máximo** encontrado em todas as horas do período, não a soma. Isso porque:
- Se temos 100 containers rodando continuamente, a API retorna 100 para cada hora
- Somar todas as horas resultaria em 100 * 720 horas = 72,000 (incorreto)
- O correto é usar o máximo: 100 containers

**Métricas que usam MÁXIMO:**
- Containers
- Infra Host (Enterprise)
- Database Monitoring
- Serverless Workload Monitoring (Functions)
- APM Enterprise
- Code Security (já usa máximo por design)

#### Métricas de Volume (usar SOMA)
Para métricas que representam volume processado (logs, spans, invocations, sessions), usamos a **soma** de todas as horas do período. Isso porque:
- Se processamos 1 milhão de logs em uma hora, a API retorna 1,000,000 para aquela hora
- Somar todas as horas nos dá o total de logs processados no período (correto)

**Métricas que usam SOMA:**
- Log Events (indexed logs)
- Log Ingestion
- Indexed Spans
- Ingested Spans
- LLM Observability
- Browser Tests
- API Tests
- RUM Session Replay
- RUM Browser Sessions
- Cloud SIEM

## API Endpoint Principal

Todos os serviços usam o endpoint `/api/v2/usage/hourly_usage` da API Datadog v2, com filtros específicos por `product_family` e `usage_type`.

## Serviços por Categoria

### Infrastructure

#### Infra Host (Enterprise)
- **Service Key**: `infra_host_enterprise`
- **Product Family**: `infra_hosts`
- **Usage Type**: `infra_host_enterprise` ou `infra_host_enterprise_usage`
- **Unit**: `hosts`
- **API Response**: Busca measurements com `usage_type` contendo "enterprise" e "host"
- **Extraction**: **MÁXIMO** valor encontrado em todas as horas (métrica de capacidade)

#### Containers
- **Service Key**: `containers`
- **Product Family**: `infra_hosts`
- **Usage Type**: `containers` ou `container_usage`
- **Unit**: `containers`
- **API Response**: Busca measurements com `usage_type` contendo "container"
- **Extraction**: **MÁXIMO** valor encontrado em todas as horas (métrica de capacidade)
- **Exemplo**: Se temos 683 containers rodando continuamente, retorna 683 (não 683 * horas)

#### Database Monitoring
- **Service Key**: `database_monitoring`
- **Product Family**: `infra_hosts`
- **Usage Type**: `database_monitoring` ou `dbm_hosts`
- **Unit**: `hosts`
- **API Response**: Busca measurements com `usage_type` relacionado a database monitoring
- **Extraction**: **MÁXIMO** valor encontrado em todas as horas (métrica de capacidade)

#### Serverless Workload Monitoring (Functions)
- **Service Key**: `serverless_workload_monitoring`
- **Product Family**: `serverless`
- **Usage Type**: `serverless_functions` ou `functions_invocations`
- **Unit**: `functions`
- **API Response**: Busca measurements com `usage_type` contendo "serverless" ou "function"
- **Extraction**: **MÁXIMO** valor encontrado em todas as horas (métrica de capacidade)

#### Serverless Functions APM
- **Service Key**: `serverless_functions_apm`
- **Product Family**: `serverless`
- **Usage Type**: `serverless_apm_invocations`
- **Unit**: `M invocations`
- **API Response**: Busca measurements de invocações APM serverless
- **Extraction**: Soma valores e converte para milhões (divide por 1,000,000)

### APM & Tracing

#### APM Enterprise
- **Service Key**: `apm_enterprise`
- **Product Family**: `indexed_spans`
- **Usage Type**: `apm_host_enterprise` ou `apm_enterprise_hosts`
- **Unit**: `hosts`
- **API Response**: Busca measurements com `usage_type` contendo "apm" e "enterprise"
- **Extraction**: Soma valores de measurements de APM enterprise hosts

#### Indexed Spans (15 Day Retention Period)
- **Service Key**: `indexed_spans`
- **Product Family**: `indexed_spans`
- **Usage Type**: `indexed_spans` ou `analyzed_spans`
- **Unit**: `M Analyzed Spans`
- **API Response**: Busca measurements com `usage_type` contendo "indexed" ou "analyzed"
- **Extraction**: Soma valores e converte para milhões (divide por 1,000,000)

#### Ingested Spans
- **Service Key**: `ingested_spans`
- **Product Family**: `indexed_spans`
- **Usage Type**: `ingested_spans` ou `span_ingestion`
- **Unit**: `GB`
- **API Response**: Busca measurements com `usage_type` contendo "ingested" e "span"
- **Extraction**: Soma valores em bytes e converte para GB (divide por 1024³)

### Logs

#### Log Events (7 Day Retention Period)
- **Service Key**: `log_events`
- **Product Family**: `indexed_logs`
- **Usage Type**: `indexed_logs` ou `log_events`
- **Unit**: `M`
- **API Response**: Busca measurements com `usage_type` contendo "indexed" e "log"
- **Extraction**: **SOMA** valores de todas as horas e converte para milhões (divide por 1,000,000) - métrica de volume

#### Log Ingestion
- **Service Key**: `log_ingestion`
- **Product Family**: `indexed_logs`
- **Usage Type**: `ingested_logs` ou `log_ingestion`
- **Unit**: `GB`
- **API Response**: Busca measurements com `usage_type` contendo "ingested" e "log"
- **Extraction**: Soma valores em bytes e converte para GB (divide por 1024³)

### Observability & Testing

#### LLM Observability
- **Service Key**: `llm_observability`
- **Product Family**: `llm_observability`
- **Usage Type**: `llm_requests` ou `llm_observability`
- **Unit**: `10K LLM Requests`
- **API Response**: Busca measurements com `usage_type` contendo "llm"
- **Extraction**: Soma valores e converte para unidades de 10K (divide por 10,000)

#### Browser Tests
- **Service Key**: `browser_tests`
- **Product Family**: `synthetics_api`
- **Usage Type**: `browser_tests` ou `synthetics_browser`
- **Unit**: `1K`
- **API Response**: Busca measurements com `usage_type` contendo "browser"
- **Extraction**: Soma valores e converte para unidades de 1K (divide por 1,000)

#### API Tests
- **Service Key**: `api_tests`
- **Product Family**: `synthetics_api`
- **Usage Type**: `api_tests` ou `synthetics_api`
- **Unit**: `10K`
- **API Response**: Busca measurements com `usage_type` contendo "api" e "test"
- **Extraction**: Soma valores e converte para unidades de 10K (divide por 10,000)

#### RUM Session Replay
- **Service Key**: `rum_session_replay`
- **Product Family**: `rum`
- **Usage Type**: `rum_session_replay` ou `session_replay`
- **Unit**: `1K Sessions`
- **API Response**: Busca measurements com `usage_type` contendo "replay"
- **Extraction**: Soma valores e converte para unidades de 1K (divide por 1,000)

#### RUM Browser or Mobile Sessions
- **Service Key**: `rum_browser_sessions`
- **Product Family**: `rum`
- **Usage Type**: `rum_sessions`, `browser_sessions`, ou `mobile_sessions`
- **Unit**: `1K Sessions`
- **API Response**: Busca measurements com `usage_type` contendo "rum" mas não "replay"
- **Extraction**: Soma valores e converte para unidades de 1K (divide por 1,000)

### Security & Compliance

#### Cloud SIEM Indexed (15 months)
- **Service Key**: `cloud_siem_indexed`
- **Product Family**: `cloud_siem` (corrigido de `siem` - conforme documentação API v2)
- **Usage Type**: `siem_indexed` ou `cloud_siem`
- **Unit**: `M`
- **API Response**: Busca measurements com `usage_type` contendo "siem"
- **Extraction**: Soma valores e converte para milhões (divide por 1,000,000)

#### Code Security Bundle
- **Service Key**: `code_security_bundle`
- **Product Family**: `code_security`
- **Usage Type**: `code_security_committers`
- **Unit**: `Committer`
- **API Response**: 
  - API v2 retorna erro 400 "Taxonomy error" (não suportado)
  - API v1 fallback: usa endpoint `/api/v1/usage/ci-app`
  - Formato da resposta: `{ usage: [{ hour: "...", ci_visibility_itr_committers: 5, ci_visibility_pipeline_committers: 7, ci_visibility_test_committers: 9, ... }] }`
- **Extraction**: 
  - Para cada item no array `usage`, pega o maior valor entre `ci_visibility_itr_committers`, `ci_visibility_pipeline_committers` e `ci_visibility_test_committers`
  - Retorna o maior valor geral de todo o período (não soma, pois Code Security cobra por committers únicos)
  - O endpoint `ci-app` tem limitação de 24 horas por requisição, então períodos maiores são divididos em chunks automaticamente

## Formato da Resposta da API

A API v2 do Datadog retorna dados no seguinte formato:

```json
{
  "data": [
    {
      "attributes": {
        "timestamp": "2024-01-01T00:00:00Z",
        "measurements": [
          {
            "usage_type": "infra_host_enterprise",
            "value": 120
          },
          {
            "usage_type": "containers",
            "value": 1300
          }
        ]
      }
    }
  ]
}
```

## Funções de Extração

Cada serviço tem uma função de extração personalizada que:
1. Itera sobre `data[].attributes.measurements[]`
2. Filtra measurements pelo `usage_type` correto
3. **Para métricas de capacidade**: Retorna o **MÁXIMO** valor encontrado em todas as horas
4. **Para métricas de volume**: **SOMA** os valores de todas as horas
5. Aplica conversões de unidade quando necessário (bytes → GB, valores → milhões, etc.)

## Fallback para Product Families Genéricos

Se um contrato não tiver serviços individuais configurados, o sistema usa product families genéricos como fallback:
- `logs` → Log Ingestion
- `apm` → APM Traces
- `hosts` → Infrastructure Hosts
- `containers` → Containers
- `rum` → RUM Sessions
- `synthetics` → Synthetics Tests
- `custom_metrics` → Custom Metrics
- `ci_visibility` → CI Visibility

## Notas Importantes

1. **LIST PRICE vs SALES PRICE**: O sistema sempre usa LIST PRICE. Sales price é interno do revendedor e não deve ser usado.

2. **Unidades**: Prestar atenção às unidades:
   - GB vs bytes (conversão necessária)
   - M (milhões) vs valores brutos
   - K (milhares) vs valores brutos
   - 10K units vs valores brutos

3. **Usage Types**: Os `usage_type` exatos podem variar entre contas Datadog. As funções de extração tentam múltiplas variações de nomes.

4. **Cálculo de Custos**: Para serviços baseados em uso, o custo é calculado como `usage × list_price`. Para serviços baseados em hosts/functions, o custo é `number_of_hosts_used × list_price`.

5. **Thresholds**: Por padrão, thresholds são 90% do valor committed, mas podem ser configurados individualmente por serviço.

## Exemplos de Queries

### Buscar uso de Infra Host Enterprise
```typescript
const usageData = await getUsageData(
  credentials,
  'infra_hosts', // product_family
  startHr,
  endHr,
  organizationId
);

// A função extractInfraHostEnterprise filtra por usage_type
const usage = extractInfraHostEnterprise(usageData);
```

### Buscar uso de Log Ingestion
```typescript
const usageData = await getUsageData(
  credentials,
  'indexed_logs', // product_family
  startHr,
  endHr,
  organizationId
);

// A função extractLogIngestion converte bytes para GB
const usage = extractLogIngestion(usageData);
```

## Troubleshooting

Se um serviço não estiver retornando dados:
1. Verificar se o `usage_type` está correto na resposta da API
2. Verificar se o `product_family` está correto
3. Verificar se a conta Datadog tem acesso ao serviço
4. Verificar logs de debug para ver a estrutura exata da resposta

