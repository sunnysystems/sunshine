import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getOrganizationIdFromTenant } from '@/lib/datadog/client';
import { importQuoteFromJSON } from '@/lib/datadog/cost-guard/quote-importer';
import { checkTenantAccess } from '@/lib/tenant';
import pdfParse from '@/lib/datadog/cost-guard/pdf-parser';
import { debugApi, logError } from '@/lib/debug';

const OWNER_ROLES = new Set(['owner', 'admin']);

async function validateOwnerOrAdmin(tenant: string, userId: string) {
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);
  if (!hasAccess || !OWNER_ROLES.has(role)) {
    return { authorized: false, role: role || null };
  }
  return { authorized: true, role };
}

/**
 * Extract structured data from Datadog quote PDF
 */
function parseDatadogQuotePDF(text: string): any {
  const quote: any = {
    services: [],
  };

  debugApi('Starting PDF Quote Parsing', {
    textLength: text.length,
    timestamp: new Date().toISOString(),
  });

  // Extract dates (format: MM/DD/YYYY or YYYY-MM-DD)
  const datePattern = /(?:Start Date|End Date|Start|End)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi;
  const dates = [...text.matchAll(datePattern)];
  debugApi('Date Pattern Matches', {
    matches: dates.map(d => d[1]),
    count: dates.length,
  });
  if (dates.length >= 2) {
    quote.contractStartDate = dates[0][1];
    quote.contractEndDate = dates[1][1];
  }

  // Also try to find dates in format: 9/1/2025 or 2025-09-01
  const datePattern2 = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g;
  const allDates = [...text.matchAll(datePattern2)];
  debugApi('Alternative Date Pattern Matches', {
    matches: allDates.map(d => d[1]),
    count: allDates.length,
  });
  if (allDates.length >= 2 && !quote.contractStartDate) {
    quote.contractStartDate = allDates[0][1];
    quote.contractEndDate = allDates[1][1];
  }

  // Extract plan name
  const planMatch = text.match(/(?:Plan|Plan Name)[:\s]+([^\n]+)/i);
  if (planMatch) {
    quote.planName = planMatch[1].trim();
    debugApi('Plan Name Found', { planName: quote.planName });
  }

  // Extract billing cycle
  const billingMatch = text.match(/(?:Billing|Payment Frequency)[:\s]+(Monthly|Quarterly|Annual|Annually)/i);
  if (billingMatch) {
    quote.billingCycle = billingMatch[1].toLowerCase().replace('annually', 'annual');
    debugApi('Billing Cycle Found', { billingCycle: quote.billingCycle });
  }

  // Extract services from COMMITTED SERVICES table
  // Pattern: Service name, Quantity, List Price, Sales Price
  const servicesSection = text.match(/COMMITTED SERVICES[\s\S]*?(?=ADDITIONAL SERVICES|TERMS|$)/i);
  debugApi('Services Section Search', {
    found: !!servicesSection,
    sectionLength: servicesSection ? servicesSection[0].length : 0,
    sectionPreview: servicesSection ? servicesSection[0].substring(0, 500) : null,
  });
  if (servicesSection) {
    const sectionText = servicesSection[0];
    
    // Split into lines and process
    const lines = sectionText.split('\n');
    let inTable = false;
    let processedLines = 0;
    let skippedLines = 0;
    
    debugApi('Processing Services Section Lines', {
      totalLines: lines.length,
      timestamp: new Date().toISOString(),
    });
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Detect table start
      if (line.includes('SERVICE') && line.includes('QUANTITY') && line.includes('PRICE')) {
        inTable = true;
        debugApi('Table Header Found', { lineIndex: i, line });
        continue;
      }

      // Skip if not in table yet
      if (!inTable) continue;

      // Stop at subtotal or additional services
      if (line.includes('SUBTOTAL') || line.includes('ADDITIONAL') || line.includes('ADJUSTMENT') || line.match(/^Page \d+ of \d+$/i)) {
        debugApi('Table End Found', { lineIndex: i, line });
        break;
      }

      // Skip empty lines
      if (!line || line.length < 3) {
        skippedLines++;
        continue;
      }

      // Handle multi-line entries: if current line doesn't have USD prices, try to merge with next line(s)
      // This handles cases like "Indexed Spans (15 Day Retention Period)" on one line and "80 M Analyzed" on next
      // Or "Indexed Spans (15 Day Retention Period) 80 M Analyzed" on one line and "USD 2.04 per M..." on next
      if (!line.match(/USD\s*[\d.]+/i) && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() || '';
        // If next line has a number (quantity), USD prices, or looks like a continuation, merge them
        if (nextLine.match(/^\d+/) || nextLine.match(/USD/i) || nextLine.length > 0) {
          line = line + ' ' + nextLine;
          i++; // Skip next line since we merged it
          debugApi('Merged Multi-line Entry', {
            originalLine: lines[i - 1],
            nextLine: nextLine,
            merged: line,
          });
          
          // If still no USD prices, try one more line
          if (!line.match(/USD\s*[\d.]+/i) && i + 1 < lines.length) {
            const nextNextLine = lines[i + 1]?.trim() || '';
            if (nextNextLine.match(/USD/i)) {
              line = line + ' ' + nextNextLine;
              i++; // Skip this line too
              debugApi('Merged Additional Line', {
                merged: line,
              });
            }
          }
        }
      }

      // Use regex to parse the line since PDF doesn't have proper column separators
      // Pattern: ServiceName + Quantity + "USD" + ListPrice + "per" + Unit + "USD" + SalesPrice + "per" + Unit
      // Example: "Infra Host (Enterprise)120USD 27.00 per HostUSD 20.70 per Host"
      // Also handle cases like: "Containers1,300USD 1.00 per ContainerUSD 0.90 per Container"
      // And cases like: "Indexed Spans (15 Day Retention Period) 80 M Analyzed" followed by price on next line
      
      // Match pattern: Service name (text until number), quantity (number with M/K), USD, list price, "per", unit, USD, sales price
      // More flexible: service name ends before a number, then quantity (with M/K), then USD prices
      // Try multiple patterns to handle different formats
      let match = line.match(/^([A-Za-z][^0-9]*?)(\d+(?:,\d+)*(?:\s*[MK])?)\s*USD\s*([\d.]+)\s*per\s*[^U]*USD\s*([\d.]+)/i);
      
      // If first pattern doesn't match, try without "per" in between (some formats might be different)
      if (!match) {
        match = line.match(/^([A-Za-z][^0-9]*?)(\d+(?:,\d+)*(?:\s*[MK])?)\s*USD\s*([\d.]+).*?USD\s*([\d.]+)/i);
      }
      
      // If still no match, try to extract service name and quantity, then look for USD prices
      // This handles cases where quantity might be in the middle: "Indexed Spans (15 Day Retention Period) 80 M Analyzed"
      if (!match) {
        // Try to find quantity anywhere in the line (with M/K suffix)
        const quantityMatch = line.match(/(\d+(?:,\d+)*(?:\s*[MK])?)/);
        if (quantityMatch) {
          const quantityIndex = line.indexOf(quantityMatch[0]);
          const serviceName = line.substring(0, quantityIndex).trim();
          const quantityStr = quantityMatch[0].trim();
          
          // Look for USD prices
          const priceMatches = Array.from(line.matchAll(/USD\s*([\d.]+)/gi));
          if (priceMatches.length >= 2 && serviceName.length > 0) {
            match = [null, serviceName, quantityStr, priceMatches[0][1], priceMatches[1][1]];
          }
        }
      }
      
      debugApi('Processing Table Line', {
        lineIndex: i,
        line,
        matchFound: !!match,
        match: match ? match.slice(1) : null,
      });
      
      if (match && match.length >= 5) {
        let serviceName = match[1].trim();
        const quantityStr = match[2].trim();
        const listPriceStr = match[3].trim();
        
        // Skip header rows and totals
        if (
          serviceName.toUpperCase().includes('SERVICE') ||
          serviceName.toUpperCase().includes('QUANTITY') ||
          serviceName.toUpperCase().includes('PRICE') ||
          serviceName.toUpperCase().includes('SUBTOTAL') ||
          serviceName.toUpperCase().includes('TOTAL') ||
          serviceName.toUpperCase().includes('AUDIT') ||
          serviceName === ''
        ) {
          skippedLines++;
          continue;
        }

        // Extract quantity (remove commas, handle "M", "K" suffixes)
        let quantity = 0;
        const cleanQuantityStr = quantityStr.replace(/,/g, '').trim();
        
        if (cleanQuantityStr.match(/[Mm]/)) {
          const num = parseFloat(cleanQuantityStr.replace(/[Mm]/g, ''));
          quantity = num * 1000000;
        } else if (cleanQuantityStr.match(/[Kk]/)) {
          const num = parseFloat(cleanQuantityStr.replace(/[Kk]/g, ''));
          quantity = num * 1000;
        } else {
          quantity = parseFloat(cleanQuantityStr) || 0;
        }

        // Extract list price
        const listPrice = parseFloat(listPriceStr) || 0;

        debugApi('Service Row Parsed', {
          serviceName,
          quantityStr,
          quantity,
          listPrice,
          line,
        });

        // Extract unit from service name
        let unit = 'units';
        const serviceNameLower = serviceName.toLowerCase();
        
        if (serviceNameLower.includes('host') && !serviceNameLower.includes('database')) {
          unit = 'hosts';
        } else if (serviceNameLower.includes('container')) {
          unit = 'containers';
        } else if (serviceNameLower.includes('gb') || serviceNameLower.includes('gigabyte')) {
          unit = 'GB';
        } else if (serviceNameLower.includes('analyzed span') || serviceNameLower.includes('indexed span')) {
          unit = 'M Analyzed Spans';
        } else if (serviceNameLower.includes('ingested span')) {
          unit = 'GB';
        } else if (serviceNameLower.includes('log event') || serviceNameLower.includes('indexed log')) {
          unit = 'M';
        } else if (serviceNameLower.includes('log ingestion') || serviceNameLower.includes('ingested log')) {
          unit = 'GB';
        } else if (serviceNameLower.includes('llm')) {
          unit = '10K LLM Requests';
        } else if (serviceNameLower.includes('browser test')) {
          unit = '1K';
        } else if (serviceNameLower.includes('api test')) {
          unit = '10K';
        } else if (serviceNameLower.includes('session replay')) {
          unit = '1K Sessions';
        } else if (serviceNameLower.includes('rum') && (serviceNameLower.includes('browser') || serviceNameLower.includes('mobile'))) {
          unit = '1K Sessions';
        } else if (serviceNameLower.includes('siem')) {
          unit = 'M';
        } else if (serviceNameLower.includes('code security') || serviceNameLower.includes('committer')) {
          unit = 'Committer';
        } else if (serviceNameLower.includes('function') && serviceNameLower.includes('apm')) {
          unit = 'M invocations';
        } else if (serviceNameLower.includes('function') && !serviceNameLower.includes('apm')) {
          unit = 'functions';
        } else if (serviceNameLower.includes('database monitoring')) {
          unit = 'hosts';
        } else if (serviceNameLower.includes('apm') && serviceNameLower.includes('enterprise')) {
          unit = 'hosts';
        }

        if (quantity > 0 && listPrice > 0) {
          quote.services.push({
            serviceName,
            quantity,
            listPrice,
            unit,
          });
          processedLines++;
          debugApi('Service Added to Quote', {
            serviceName,
            quantity,
            listPrice,
            unit,
            totalServices: quote.services.length,
          });
        } else {
          debugApi('Service Skipped (Invalid Quantity or Price)', {
            serviceName,
            quantity,
            listPrice,
          });
        }
      } else {
        // No match found - skip this line
        skippedLines++;
        debugApi('Line Skipped (No Match Found)', {
          lineIndex: i,
          line,
        });
      }
    }

    debugApi('Services Section Processing Complete', {
      totalLines: lines.length,
      processedLines,
      skippedLines,
      servicesFound: quote.services.length,
    });
  } else {
    debugApi('Services Section Not Found', {
      textSnippet: text.substring(0, 1000),
    });
  }

  debugApi('PDF Quote Parsing Complete', {
    contractStartDate: quote.contractStartDate,
    contractEndDate: quote.contractEndDate,
    planName: quote.planName,
    billingCycle: quote.billingCycle,
    servicesCount: quote.services.length,
  });

  return quote;
}

export async function POST(request: NextRequest) {
  // Suppress Buffer deprecation warning from pdf-parse
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function(warning: any, ...args: any[]) {
    if (warning && typeof warning === 'string' && warning.includes('Buffer() is deprecated')) {
      return; // Suppress Buffer deprecation warnings
    }
    return originalEmitWarning.call(process, warning, ...args);
  };

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenant = searchParams.get('tenant');

    if (!tenant) {
      return NextResponse.json(
        { message: 'Tenant parameter is required' },
        { status: 400 },
      );
    }

    // Validate user is owner or admin
    const validation = await validateOwnerOrAdmin(tenant, session.user.id);
    if (!validation.authorized) {
      return NextResponse.json(
        {
          message: 'Only organization owners and admins can import quotes',
        },
        { status: 403 },
      );
    }

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 },
      );
    }

    debugApi('PDF Upload Received', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      tenant,
      timestamp: new Date().toISOString(),
    });

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return NextResponse.json(
        { message: 'Invalid file type. Please upload a PDF file.' },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: 'File size exceeds 10MB limit' },
        { status: 400 },
      );
    }

    // Read PDF file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    debugApi('PDF Buffer Created', {
      bufferSize: buffer.length,
      fileName: file.name,
      timestamp: new Date().toISOString(),
    });

    // Parse PDF using wrapped pdf-parse (lazy loaded to avoid test file issues)
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    debugApi('PDF Text Extracted', {
      textLength: text.length,
      textPreview: text.substring(0, 500),
      firstLines: text.split('\n').slice(0, 10),
      fileName: file.name,
      timestamp: new Date().toISOString(),
    });

    // Parse quote data from PDF text
    const quoteData = parseDatadogQuotePDF(text);

    debugApi('PDF Quote Data Parsed', {
      contractStartDate: quoteData.contractStartDate,
      contractEndDate: quoteData.contractEndDate,
      planName: quoteData.planName,
      billingCycle: quoteData.billingCycle,
      servicesFound: quoteData.services.length,
      services: quoteData.services.map((s: any) => ({
        name: s.serviceName,
        quantity: s.quantity,
        listPrice: s.listPrice,
        unit: s.unit,
      })),
      fileName: file.name,
      timestamp: new Date().toISOString(),
    });

    // Import services using existing importer
    const services = importQuoteFromJSON(quoteData);

    debugApi('Services Mapped and Imported', {
      totalServices: services.length,
      mappedServices: services.map((s) => ({
        serviceKey: s.serviceKey,
        serviceName: s.serviceName,
        quantity: s.quantity,
        listPrice: s.listPrice,
        committedValue: s.committedValue,
        unit: s.unit,
      })),
      fileName: file.name,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        services,
        quoteData: {
          contractStartDate: quoteData.contractStartDate,
          contractEndDate: quoteData.contractEndDate,
          planName: quoteData.planName || 'Enterprise Observability',
          billingCycle: quoteData.billingCycle || 'annual',
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logError(error, 'Error processing PDF');
    const { searchParams } = new URL(request.url);
    const tenantParam = searchParams.get('tenant');
    debugApi('PDF Processing Error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      tenant: tenantParam || 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to process PDF file',
      },
      { status: 500 },
    );
  } finally {
    // Restore original emitWarning
    process.emitWarning = originalEmitWarning;
  }
}

