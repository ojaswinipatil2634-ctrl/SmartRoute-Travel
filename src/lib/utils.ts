import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Recursively removes undefined values from an object or array.
 * Firestore does not support 'undefined' values.
 */
export function sanitizeFirestoreData(data: any): any {
  if (data === undefined) return null;
  if (data === null) return null;
  
  if (Array.isArray(data)) {
    // Check if this array contains other arrays (nested arrays)
    const hasNestedArray = data.some(item => Array.isArray(item));
    if (hasNestedArray) {
      // Firestore doesn't support nested arrays, so we convert it to an object with index keys
      const flattened: any = {};
      data.forEach((item, index) => {
        flattened[`item_${index}`] = sanitizeFirestoreData(item);
      });
      return flattened;
    }
    return data.map(item => sanitizeFirestoreData(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    // Handle Date objects
    if (data instanceof Date) return data.toISOString();
    
    const sanitized: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        if (value !== undefined) {
          sanitized[key] = sanitizeFirestoreData(value);
        } else {
          sanitized[key] = null;
        }
      }
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Recursively parses JSON strings that were created by sanitizeFirestoreData.
 */
export function parseFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    if ((data.startsWith('[') && data.endsWith(']')) || (data.startsWith('{') && data.endsWith('}'))) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return data;
      }
    }
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => parseFirestoreData(item));
  }
  
  if (typeof data === 'object') {
    // Check if this object was a flattened array
    const keys = Object.keys(data);
    const isFlattenedArray = keys.length > 0 && keys.every(key => key.startsWith('item_'));
    
    if (isFlattenedArray) {
      const array: any[] = [];
      keys.forEach(key => {
        const index = parseInt(key.replace('item_', ''), 10);
        array[index] = parseFirestoreData(data[key]);
      });
      return array;
    }

    const parsed: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        parsed[key] = parseFirestoreData(data[key]);
      }
    }
    return parsed;
  }
  
  return data;
}
