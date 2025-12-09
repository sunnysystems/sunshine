import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with 2 decimal places when not an integer, otherwise no decimals
 * Maintains thousand separators using toLocaleString()
 * Handles "N/A" strings and null values by returning them as-is
 */
export function formatNumberWithDecimals(
  value: number | string | null | undefined,
): string | null {
  // Handle null or undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Handle string values (like "N/A")
  if (typeof value === 'string') {
    return value;
  }

  // Handle numbers
  // Check if it's an integer
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  // Format with 2 decimal places
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
