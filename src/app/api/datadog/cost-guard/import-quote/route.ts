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
 * Normalize date string to ISO format (YYYY-MM-DD)
 * Handles formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
 */
function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  try {
    // Try to parse the date
    // Handle MM/DD/YYYY or DD/MM/YYYY format
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      let year: number, month: number, day: number;
      
      // If first part is 4 digits, it's YYYY-MM-DD or YYYY/DD/MM
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        // Assume MM/DD/YYYY (US format) or DD/MM/YYYY
        // Try MM/DD/YYYY first (most common in US quotes)
        month = parseInt(parts[0], 10);
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        
        // If day > 12, it's likely DD/MM/YYYY
        if (day > 12 && month <= 12) {
          // Swap day and month
          const temp = day;
          day = month;
          month = temp;
        }
      }
      
      // Validate and format
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // Try parsing as-is (might already be ISO format)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (error) {
    debugApi('Date Normalization Error', {
      dateStr,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  return null;
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
    const normalizedStart = normalizeDate(dates[0][1]);
    const normalizedEnd = normalizeDate(dates[1][1]);
    if (normalizedStart) quote.contractStartDate = normalizedStart;
    if (normalizedEnd) quote.contractEndDate = normalizedEnd;
  }

  // Also try to find dates in format: 9/1/2025 or 2025-09-01
  const datePattern2 = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g;
  const allDates = [...text.matchAll(datePattern2)];
  debugApi('Alternative Date Pattern Matches', {
    matches: allDates.map(d => d[1]),
    count: allDates.length,
  });
  if (allDates.length >= 2 && !quote.contractStartDate) {
    const normalizedStart = normalizeDate(allDates[0][1]);
    const normalizedEnd = normalizeDate(allDates[1][1]);
    if (normalizedStart) quote.contractStartDate = normalizedStart;
    if (normalizedEnd) quote.contractEndDate = normalizedEnd;
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
      // Continue merging until we find USD prices or reach 3 lines total
      let mergeCount = 0;
      const maxMerges = 2; // Can merge up to 2 additional lines (total 3 lines)
      const originalLineIndex = i;
      
      while (!line.match(/USD\s*[\d.]+/i) && mergeCount < maxMerges && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() || '';
        
        // Check if we should merge:
        // - Next line has USD prices (always merge - this is the most important case)
        // - Next line starts with a number (quantity)
        // - Current line ends with quantity pattern (like "80 M Analyzed" or "100 K")
        // - Current line contains service name patterns that typically need merge (Indexed Spans, LLM Observability)
        // - Next line is not empty and looks like continuation (not a header or total)
        const hasServiceNameNeedingMerge = line.match(/(Indexed\s+Spans|LLM\s+Observability)/i);
        const nextLineStartsWithServiceWord = nextLine.match(/^(Spans|Requests|Sessions|Invocations)/i);
        const currentLineEndsWithQuantity = line.match(/\d+\s*[MK]\s*[A-Za-z]+$/i);
        
        // For services that need merge, be more aggressive - continue until we find USD
        const shouldMerge = 
          nextLine.match(/USD/i) ||
          nextLine.match(/^\d+/) ||
          currentLineEndsWithQuantity ||
          (hasServiceNameNeedingMerge && nextLine.length > 0 && !nextLine.match(/^(SUBTOTAL|ADDITIONAL|ADJUSTMENT|Page \d+|SERVICE|QUANTITY|PRICE|Audit)/i)) ||
          (nextLineStartsWithServiceWord && hasServiceNameNeedingMerge) ||
          (nextLine.length > 0 && !nextLine.match(/^(SUBTOTAL|ADDITIONAL|ADJUSTMENT|Page \d+|SERVICE|QUANTITY|PRICE|Audit)/i));
        
        if (shouldMerge) {
          line = line + ' ' + nextLine;
          i++; // Skip next line since we merged it
          mergeCount++;
          debugApi('Merged Multi-line Entry', {
            originalLineIndex,
            mergeCount,
            originalLine: lines[originalLineIndex],
            nextLine: nextLine,
            merged: line,
          });
        } else {
          // No more lines to merge
          break;
        }
      }

      // Use regex to parse the line since PDF doesn't have proper column separators
      // Pattern: ServiceName + Quantity + "USD" + ListPrice + "per" + Unit + "USD" + SalesPrice + "per" + Unit
      // Example: "Infra Host (Enterprise)120USD 27.00 per HostUSD 20.70 per Host"
      // Also handle cases like: "Containers1,300USD 1.00 per ContainerUSD 0.90 per Container"
      // And cases like: "Indexed Spans (15 Day Retention Period) 80 M Analyzed" followed by price on next line
      
      // Improved parsing: First find USD prices, then work backwards to find the quantity
      // This avoids capturing numbers inside parentheses like "(7 Day Retention Period)" or "(15 months)"
      let match = null;
      
      // Find all USD prices in the line
      const priceMatches = Array.from(line.matchAll(/USD\s*([\d.]+)/gi));
      if (priceMatches.length >= 2) {
        const firstPriceIndex = line.indexOf(priceMatches[0][0]);
        
        // Extract everything before the first USD price - this should contain service name and quantity
        const beforePrice = line.substring(0, firstPriceIndex).trim();
        
        // Remove text inside parentheses to avoid matching numbers from descriptions
        // Example: "Log Events (7 Day Retention Period)4,000 M" -> "Log Events 4,000 M"
        const withoutParentheses = beforePrice.replace(/\([^)]*\)/g, '').trim();
        
        // Remove units that appear before USD prices (like "GB", "M", "K") that are part of the quantity format
        // Example: "Ingested Spans18,000 GB" -> "Ingested Spans18,000"
        // But keep units that are part of the quantity (like "80 M" or "100 K")
        // Pattern: Look for quantity patterns that may have units after them but before USD
        const cleanedBeforePrice = withoutParentheses.replace(/\s+(GB|MB|TB)(?=\s*USD|$)/gi, '').trim();
        
        // Find the last number (with optional M/K suffix and commas) before the USD prices
        // This should be the actual quantity
        // Pattern: number with optional commas, optional space, optional M or K
        // Also handle cases where there might be a unit word after the number (like "18,000 GB" or "80 M Analyzed Spans")
        // For Indexed Spans: "80 M Analyzed Spans" -> quantity is "80 M" (Analyzed Spans is unit description)
        // For LLM: "100 K" -> quantity is "100 K"
        const quantityMatch = cleanedBeforePrice.match(/(\d+(?:,\d+)*(?:\s*[MK])?)\s*(?:GB|MB|TB|Analyzed(?:\s+Spans)?|Sessions|Requests|Invocations)?\s*$/i);
        
        if (quantityMatch) {
          // Extract just the quantity part (number with optional M/K)
          // For "80 M Analyzed Spans", this captures "80 M"
          // For "100 K", this captures "100 K"
          const quantityStr = quantityMatch[1].trim();
          
          // Find where this quantity appears in the original string (before removing parentheses and units)
          // We need to find it in the original to get the correct service name
          // Escape special regex characters in quantity string
          const escapedQuantity = quantityStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Look for the quantity pattern, possibly followed by a unit word, at the end of beforePrice
          const quantityPattern = new RegExp(escapedQuantity + '\\s*(?:GB|MB|TB|Analyzed|Sessions|Requests|Invocations)?\\s*$', 'i');
          const quantityMatchInOriginal = beforePrice.match(quantityPattern);
          
          if (quantityMatchInOriginal) {
            const quantityIndex = beforePrice.lastIndexOf(quantityMatchInOriginal[0]);
            let serviceName = beforePrice.substring(0, quantityIndex).trim();
            
            // Clean up service name - remove trailing parentheses content if any
            // Also remove any trailing text that looks like part of a unit description
            serviceName = serviceName.replace(/\s*\([^)]*$/, '').trim();
            serviceName = serviceName.replace(/\s+(Analyzed|Sessions|Requests|Invocations|GB|MB|TB)$/i, '').trim();
            
            if (serviceName.length > 0) {
              match = [null, serviceName, quantityStr, priceMatches[0][1], priceMatches[1][1]];
            }
          } else {
            // If exact match not found, try to find quantity anywhere in beforePrice
            // This handles cases where quantity might be separated by text
            const allQuantityMatches = Array.from(beforePrice.matchAll(/(\d+(?:,\d+)*(?:\s*[MK])?)/gi));
            if (allQuantityMatches.length > 0) {
              // Use the last match (closest to USD prices)
              const lastMatch = allQuantityMatches[allQuantityMatches.length - 1];
              const foundQuantity = lastMatch[0].trim();
              const quantityIndex = beforePrice.lastIndexOf(lastMatch[0]);
              let serviceName = beforePrice.substring(0, quantityIndex).trim();
              
              // Clean up service name - remove units that might have been captured
              serviceName = serviceName.replace(/\s*\([^)]*$/, '').trim();
              serviceName = serviceName.replace(/\s+(Analyzed|Sessions|Requests|Invocations|GB|MB|TB)$/i, '').trim();
              
              if (serviceName.length > 0) {
                match = [null, serviceName, foundQuantity, priceMatches[0][1], priceMatches[1][1]];
              }
            }
          }
        }
      }
      
      // Fallback to original pattern matching if improved approach didn't work
      if (!match) {
        match = line.match(/^([A-Za-z][^0-9]*?)(\d+(?:,\d+)*(?:\s*[MK])?)\s*USD\s*([\d.]+)\s*per\s*[^U]*USD\s*([\d.]+)/i);
      }
      
      // If still no match, try without "per" in between
      if (!match) {
        match = line.match(/^([A-Za-z][^0-9]*?)(\d+(?:,\d+)*(?:\s*[MK])?)\s*USD\s*([\d.]+).*?USD\s*([\d.]+)/i);
      }
      
      // Special fallback for cases with units between service name and quantity
      // Example: "Ingested Spans18,000 GBUSD 0.10 per GBUSD 0.98 per GB"
      if (!match && priceMatches.length >= 2) {
        const firstPriceIndex = line.indexOf(priceMatches[0][0]);
        const beforePrice = line.substring(0, firstPriceIndex).trim();
        
        // Try to match: ServiceName + Quantity + Unit + USD
        const unitBeforePriceMatch = beforePrice.match(/^(.+?)(\d+(?:,\d+)*)\s*(GB|MB|TB|M|K)\s*$/i);
        if (unitBeforePriceMatch) {
          const serviceName = unitBeforePriceMatch[1].trim().replace(/\s*\([^)]*$/, '').trim();
          const quantity = unitBeforePriceMatch[2].trim();
          if (serviceName.length > 0) {
            match = [null, serviceName, quantity, priceMatches[0][1], priceMatches[1][1]];
          }
        }
      }
      
      // Special fallback for Indexed Spans pattern
      // From PDF: QUANTITY = "80 M Analyzed Spans", LIST PRICE = "USD 2.04 per M Analyzed Spans"
      // Example: "Indexed Spans (15 Day Retention Period) 80 M Analyzed Spans USD 2.04..."
      // Or after merge: "Indexed Spans (15 Day Retention Period) 80 M Analyzed Spans USD 2.04 per M Analyzed SpansUSD 1.53..."
      // Also handle case where line might be just "Spans USD..." after merge (check previous lines)
      if (!match && priceMatches.length >= 1) {
        let indexedSpansMatch = null;
        let serviceName = '';
        let quantity = '';
        
        // Check if current line has "Indexed Spans"
        if (line.match(/Indexed\s+Spans/i)) {
          const firstPriceIndex = line.indexOf(priceMatches[0][0]);
          const beforePrice = line.substring(0, firstPriceIndex).trim();
          indexedSpansMatch = beforePrice.match(/Indexed\s+Spans[^(]*\([^)]*\)\s*(\d+(?:,\d+)*)\s*([MK])\s*(?:Analyzed(?:\s+Spans)?)?/i);
          if (indexedSpansMatch) {
            quantity = indexedSpansMatch[1] + ' ' + indexedSpansMatch[2];
            serviceName = 'Indexed Spans (15 Day Retention Period)';
          }
        }
        
        // If not found and line starts with "Spans USD", check previous lines (up to 2 lines back)
        if (!indexedSpansMatch && line.match(/^Spans\s+USD/i) && i > 0) {
          // Check previous line
          const prevLine = lines[i - 1]?.trim() || '';
          if (prevLine.match(/Indexed/i) && prevLine.match(/\d+\s*[MK]/i)) {
            // Previous line has "Indexed Spans (15 Day Retention Period) 80 M Analyzed"
            const prevMatch = prevLine.match(/Indexed\s+Spans[^(]*\([^)]*\)\s*(\d+(?:,\d+)*)\s*([MK])/i);
            if (prevMatch) {
              quantity = prevMatch[1] + ' ' + prevMatch[2];
              serviceName = 'Indexed Spans (15 Day Retention Period)';
              indexedSpansMatch = prevMatch;
            }
          }
        }
        
        if (indexedSpansMatch && serviceName && quantity) {
          // Use first price as list price, second as sales price (or same if only one)
          const listPrice = priceMatches[0][1];
          const salesPrice = priceMatches.length >= 2 ? priceMatches[1][1] : priceMatches[0][1];
          match = [null, serviceName, quantity, listPrice, salesPrice];
        }
      }
      
      // Special fallback for LLM Observability pattern
      // From PDF: QUANTITY = "100 K", LIST PRICE = "USD 10.00 per 10K LLM Requests"
      // Example: "LLM Observability100 K USD 10.00 per 10K LLM Requests USD 8.00..."
      // Or: "LLM Observability100 K USD 10.00 per" (incomplete line that needs merge)
      // Or: "10K LLM Requests USD 8.00 per 10K LLM Requests" (after merge, check previous line)
      if (!match && priceMatches.length >= 1) {
        let llmMatch = null;
        let serviceName = '';
        let quantity = '';
        
        // Check if current line has "LLM Observability"
        if (line.match(/LLM\s+Observability/i)) {
          const firstPriceIndex = line.indexOf(priceMatches[0][0]);
          const beforePrice = line.substring(0, firstPriceIndex).trim();
          llmMatch = beforePrice.match(/LLM\s+Observability\s*(\d+(?:,\d+)*)\s*([MK])/i);
          if (llmMatch) {
            quantity = llmMatch[1] + ' ' + llmMatch[2];
            serviceName = 'LLM Observability';
          }
        }
        
        // If not found and line starts with "10K LLM Requests" or similar, check previous line
        if (!llmMatch && line.match(/10K\s+LLM\s+Requests/i) && i > 0) {
          const prevLine = lines[i - 1]?.trim() || '';
          if (prevLine.match(/LLM\s+Observability/i) && prevLine.match(/\d+\s*[MK]/i)) {
            // Previous line has "LLM Observability100 K USD 10.00 per"
            const prevMatch = prevLine.match(/LLM\s+Observability\s*(\d+(?:,\d+)*)\s*([MK])/i);
            if (prevMatch) {
              quantity = prevMatch[1] + ' ' + prevMatch[2];
              serviceName = 'LLM Observability';
              llmMatch = prevMatch;
            }
          }
        }
        
        if (llmMatch && serviceName && quantity) {
          // Use first price as list price, second as sales price (or same if only one)
          const listPrice = priceMatches[0][1];
          const salesPrice = priceMatches.length >= 2 ? priceMatches[1][1] : priceMatches[0][1];
          match = [null, serviceName, quantity, listPrice, salesPrice];
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

        // Extract unit from service name FIRST (before quantity conversion)
        // This is needed to determine if we should convert the quantity
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

        // Extract quantity (remove commas, handle "M", "K" suffixes)
        // IMPORTANT: If the unit already contains "M" or "K", don't convert the quantity
        // For example: "1 M" with unit "M invocations" should be quantity = 1, not 1,000,000
        // Units that already indicate scale: "M invocations", "M Analyzed Spans", "M", "10K LLM Requests", "1K", "10K", "1K Sessions"
        let quantity = 0;
        const cleanQuantityStr = quantityStr.replace(/,/g, '').trim();
        
        // Check if unit already indicates the scale (contains M or K)
        // Units like "M invocations", "M Analyzed Spans", "M", "10K LLM Requests", "1K", "10K", "1K Sessions"
        const unitHasM = /M(\s|$)/.test(unit); // "M " or "M" at end
        const unitHasK = /(10K|1K|K(\s|$))/.test(unit); // "10K", "1K", "K ", or "K" at end
        
        if (cleanQuantityStr.match(/[Mm]/) && !unitHasM) {
          // Quantity has "M" but unit doesn't - convert to base unit
          // Example: "1,000 M" with unit "GB" → quantity = 1,000,000,000
          const num = parseFloat(cleanQuantityStr.replace(/[Mm]/g, ''));
          quantity = num * 1000000;
        } else if (cleanQuantityStr.match(/[Kk]/) && !unitHasK) {
          // Quantity has "K" but unit doesn't - convert to base unit
          // Example: "5 K" with unit "hosts" → quantity = 5,000
          const num = parseFloat(cleanQuantityStr.replace(/[Kk]/g, ''));
          quantity = num * 1000;
        } else {
          // No conversion needed - quantity is already in the correct unit
          // Remove M/K suffix if present (since unit already indicates the scale)
          // Example: "1 M" with unit "M invocations" → quantity = 1
          // Example: "80 M" with unit "M Analyzed Spans" → quantity = 80
          // Example: "1 K" with unit "1K Sessions" → quantity = 1
          const numStr = cleanQuantityStr.replace(/[MmKk]/g, '');
          quantity = parseFloat(numStr) || 0;
        }

        // Extract list price
        const listPrice = parseFloat(listPriceStr) || 0;

        debugApi('Service Row Parsed', {
          serviceName,
          quantityStr,
          quantity,
          listPrice,
          unit,
          unitHasM,
          unitHasK,
          line,
        });

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

