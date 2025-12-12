# Análise do Tratamento de Rate Limit - Datadog API

## Comportamento Esperado

### 1. Quando um 429 (Too Many Requests) é recebido:

**Logs esperados:**
```
[DEBUG] [API] Datadog API Error (429) {
  "endpoint": "...",
  "status": 429,
  ...
}
[DEBUG] [API] Rate limit hit - blocking all requests until reset {
  "rateLimitName": "usage_metering",
  "remaining": 0,
  "limit": 10,
  "reset": 30,
  ...
}
[DEBUG] [API] Datadog API 429 Rate Limit - All requests will be blocked {
  ...
  "message": "Rate limit exceeded. All requests will be stopped until reset."
}
```

**Ações tomadas:**
1. `datadogRequest` atualiza Redis com `remaining = 0`
2. Lança `DatadogRateLimitError`
3. O erro é propagado através do processamento paralelo

### 2. Durante o Processamento Paralelo:

**Logs esperados quando rate limit é detectado:**
```
[DEBUG] [API] Rate limit error while processing dimension <dimensionId> - stopping all requests {
  "dimensionId": "...",
  "retryAfter": 30,
  ...
}
```

**OU para serviços:**
```
[DEBUG] [API] Rate limit error while processing service <serviceKey> - stopping all requests {
  "serviceKey": "...",
  "dimensionId": "...",
  "retryAfter": 30,
  ...
}
```

**Ações tomadas:**
- `processDimensionsInParallel` ou `processServicesInParallel` detecta o erro
- Limpa todas as promises ativas (`activePromises.clear()`)
- Lança o erro para parar o processamento

### 3. Para Requisições Subsequentes (Após 429):

**Logs esperados quando uma nova requisição tenta ser feita:**
```
[DEBUG] [API] Checking rate limit before request (proactive check) {
  "rateLimitName": "usage_metering",
  ...
}
[DEBUG] [API] Rate limit hit (remaining = 0) - blocking all requests until reset {
  "rateLimitName": "usage_metering",
  "remaining": 0,
  "limit": 10,
  "reset": 30,
  ...
}
[DEBUG] [API] Waiting for rate limit reset (Redis) {
  "rateLimitName": "usage_metering",
  "remaining": 0,
  "waitTimeMs": 30000,
  "waitTimeSeconds": 30,
  ...
}
```

**Ações tomadas:**
- `checkAndWaitForRateLimit` é chamado ANTES de cada requisição
- Verifica Redis e encontra `remaining = 0`
- Calcula o tempo de espera baseado em `reset` ou `period`
- Aguarda o tempo necessário antes de permitir a requisição

### 4. Resposta Final do Endpoint:

**Quando rate limit é detectado:**
```json
{
  "message": "Rate limit exceeded. Please wait before retrying.",
  "rateLimit": true,
  "retryAfter": 30,
  "error": "Datadog API rate limit exceeded: ..."
}
```
Status HTTP: `429`

## Pontos Críticos para Verificar nos Logs

### ✅ Comportamento Correto:

1. **Após um 429:**
   - Deve haver log: `"Rate limit hit - blocking all requests until reset"`
   - Redis deve ser atualizado com `remaining = 0`
   - Deve haver log: `"Rate limit error while processing ... - stopping all requests"`

2. **Requisições subsequentes:**
   - Deve haver log: `"Checking rate limit before request (proactive check)"`
   - Deve haver log: `"Rate limit hit (remaining = 0) - blocking all requests until reset"`
   - Deve haver log: `"Waiting for rate limit reset (Redis)"`
   - **NÃO deve haver novos logs de `"Datadog API Request"` até que o reset aconteça**

3. **Após o reset:**
   - Deve haver novos logs de `"Datadog API Request"` quando o tempo de espera terminar
   - Redis deve ser atualizado com `remaining > 0` (quando a próxima requisição bem-sucedida retornar)

### ⚠️ Possíveis Problemas:

1. **Requisições continuam após 429:**
   - Se você ver logs de `"Datadog API Request"` imediatamente após um 429, sem logs de `"Waiting for rate limit reset"`, significa que `checkAndWaitForRateLimit` não está bloqueando corretamente
   - **Causa possível:** Redis não está sendo atualizado corretamente, ou `checkAndWaitForRateLimit` não está sendo chamado antes de cada requisição

2. **Múltiplos 429s em sequência:**
   - Se você ver múltiplos 429s sem espera entre eles, significa que as requisições não estão sendo bloqueadas
   - **Causa possível:** Múltiplas requisições iniciadas em paralelo antes do primeiro 429 ser detectado

3. **Tempo de espera incorreto:**
   - Se o tempo de espera parece muito curto ou muito longo, verifique:
     - O valor de `reset` nos headers da resposta 429
     - O cálculo de `adjustedWaitTime` em `checkAndWaitForRateLimit`

4. **Processamento paralelo não para:**
   - Se você ver logs de processamento de múltiplas dimensões/serviços após um 429, significa que o erro não está sendo propagado corretamente
   - **Causa possível:** O erro está sendo capturado e convertido em um resultado de erro ao invés de ser lançado

## Limitações Conhecidas

1. **Requisições já em voo:**
   - Quando um 429 é recebido, requisições que já foram iniciadas (já passaram por `checkAndWaitForRateLimit`) continuarão até completar ou falhar
   - Isso é esperado e não é um bug - o importante é que **novas** requisições sejam bloqueadas

2. **Race condition inicial:**
   - Se múltiplas requisições chamam `checkAndWaitForRateLimit` simultaneamente antes de qualquer 429, todas podem passar e então uma recebe 429
   - Isso é uma limitação aceitável - o importante é que após o primeiro 429, todas as subsequentes sejam bloqueadas

## Checklist de Verificação nos Logs

Ao analisar os logs, verifique:

- [ ] Após um 429, há log de `"Rate limit hit - blocking all requests until reset"` com `remaining: 0`
- [ ] Após um 429, há log de `"Rate limit error while processing ... - stopping all requests"`
- [ ] Após um 429, **NÃO** há novos logs de `"Datadog API Request"` até que o reset aconteça
- [ ] Antes de cada nova requisição (após 429), há log de `"Checking rate limit before request"`
- [ ] Antes de cada nova requisição (após 429), há log de `"Waiting for rate limit reset (Redis)"` com tempo de espera apropriado
- [ ] O endpoint retorna status 429 com mensagem apropriada quando rate limit é detectado
- [ ] Após o tempo de espera, novas requisições são permitidas e há logs de `"Datadog API Request"` novamente

## Exemplo de Sequência de Logs Correta

```
[DEBUG] [API] Datadog API Request { "endpoint": "/api/v2/usage/hourly_usage?..." }
[DEBUG] [API] Datadog API Error (429) { "status": 429, ... }
[DEBUG] [API] Rate limit hit - blocking all requests until reset { "remaining": 0, "reset": 30 }
[DEBUG] [API] Datadog API 429 Rate Limit - All requests will be blocked { ... }
[DEBUG] [API] Rate limit error while processing dimension apm_hosts - stopping all requests { ... }

// ... tempo passa, nova requisição tenta ser feita ...

[DEBUG] [API] Checking rate limit before request (proactive check) { "rateLimitName": "usage_metering" }
[DEBUG] [API] Rate limit hit (remaining = 0) - blocking all requests until reset { ... }
[DEBUG] [API] Waiting for rate limit reset (Redis) { "waitTimeSeconds": 25, ... }

// ... aguarda 25 segundos ...

// Após o reset, nova requisição é permitida:
[DEBUG] [API] Checking rate limit before request (proactive check) { ... }
[DEBUG] [API] Rate limit check passed, proceeding with request { "remaining": 10, ... }
[DEBUG] [API] Datadog API Request { "endpoint": "/api/v2/usage/hourly_usage?..." }
```

