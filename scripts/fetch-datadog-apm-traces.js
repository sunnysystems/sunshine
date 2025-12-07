#!/usr/bin/env node

/**
 * Script para buscar dados de APM traces do Datadog usando as credenciais salvas no sistema
 * 
 * Uso: node scripts/fetch-datadog-apm-traces.js [tenant]
 * Exemplo: node scripts/fetch-datadog-apm-traces.js clickbus
 */

// Carregar variáveis de ambiente do .env.local
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Função para buscar credenciais do vault
async function getCredentialFromVault(organizationId, type) {
  const secretName = `datadog_${type}_${organizationId}`;
  
  try {
    const { data, error } = await supabaseAdmin.rpc('vault_get_secret', {
      secret_name: secretName,
    });

    if (error) {
      if (
        error.message?.includes('not found') ||
        error.code === 'PGRST116' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('No secret found')
      ) {
        return null;
      }
      throw new Error(`Failed to get ${type} credential from vault: ${error.message}`);
    }

    return data || null;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('No secret found'))
    ) {
      return null;
    }
    throw error;
  }
}

// Função para buscar organization ID pelo tenant slug
async function getOrganizationIdFromTenant(tenant) {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', tenant)
    .single();

  if (error || !org) {
    return null;
  }

  return org.id;
}

// Função para buscar dados de APM traces do Datadog
async function fetchApmTraces(apiKey, appKey, startHr, endHr) {
  const DATADOG_API_BASE = 'https://api.datadoghq.com';
  
  // Usar v2 API endpoint
  const endpoint = '/api/v2/usage/hourly_usage';
  const params = new URLSearchParams({
    'filter[timestamp][start]': startHr,
    'filter[timestamp][end]': endHr,
    'filter[product_families]': 'indexed_spans', // APM traces no v2
  });
  
  const url = `${DATADOG_API_BASE}${endpoint}?${params.toString()}`;
  
  console.log(`\n🔍 Fazendo requisição para: ${url}`);
  console.log(`📅 Período: ${startHr} até ${endHr}\n`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Datadog API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Função principal
async function main() {
  const tenant = process.argv[2] || 'clickbus';
  
  console.log(`\n🚀 Buscando dados de APM traces para o tenant: ${tenant}\n`);

  try {
    // 1. Buscar organization ID
    console.log('📋 Buscando organization ID...');
    const organizationId = await getOrganizationIdFromTenant(tenant);
    
    if (!organizationId) {
      console.error(`❌ Organização não encontrada para o tenant: ${tenant}`);
      process.exit(1);
    }
    
    console.log(`✅ Organization ID: ${organizationId}\n`);

    // 2. Buscar credenciais do vault
    console.log('🔐 Buscando credenciais do Datadog...');
    const [apiKey, appKey] = await Promise.all([
      getCredentialFromVault(organizationId, 'api'),
      getCredentialFromVault(organizationId, 'app'),
    ]);

    if (!apiKey || !appKey) {
      console.error('❌ Credenciais do Datadog não encontradas no vault');
      console.error('   Por favor, configure as credenciais através da interface web.');
      process.exit(1);
    }

    console.log(`✅ API Key encontrada: ${apiKey.substring(0, 8)}...`);
    console.log(`✅ App Key encontrada: ${appKey.substring(0, 8)}...\n`);

    // 3. Definir período (últimos 30 dias)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    // Formato RFC3339
    const startHr = startDate.toISOString();
    const endHr = endDate.toISOString();

    // 4. Buscar dados de APM traces
    console.log('📊 Buscando dados de APM traces...');
    const data = await fetchApmTraces(apiKey, appKey, startHr, endHr);

    // 5. Exibir resultados
    console.log('\n✅ Dados de APM traces recebidos:\n');
    console.log(JSON.stringify(data, null, 2));
    
    // Resumo dos dados
    if (data.data && Array.isArray(data.data)) {
      console.log(`\n📈 Resumo:`);
      console.log(`   - Total de registros: ${data.data.length}`);
      
      let totalSpans = 0;
      data.data.forEach((entry) => {
        if (entry.attributes?.measurements) {
          entry.attributes.measurements.forEach((measurement) => {
            // Para indexed_spans, o usage_type é 'indexed_events_count'
            if (measurement.usage_type === 'indexed_events_count' && typeof measurement.value === 'number') {
              totalSpans += measurement.value;
            }
          });
        }
      });
      
      console.log(`   - Total de spans indexados: ${totalSpans.toLocaleString()}`);
      console.log(`   - Média por hora: ${Math.round(totalSpans / data.data.length).toLocaleString()}`);
      
      // Encontrar valores mínimo e máximo
      const values = data.data
        .flatMap((entry) => 
          entry.attributes?.measurements
            ?.filter((m) => m.usage_type === 'indexed_events_count')
            .map((m) => m.value) || []
        )
        .filter((v) => typeof v === 'number');
      
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        console.log(`   - Mínimo (por hora): ${min.toLocaleString()}`);
        console.log(`   - Máximo (por hora): ${max.toLocaleString()}`);
      }
    }

    console.log('\n✨ Concluído!\n');
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Executar
main();

