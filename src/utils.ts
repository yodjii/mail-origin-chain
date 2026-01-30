import { ResultObject, EmailAddress } from './types';

import * as anyDateParser from 'any-date-parser';

export function normalizeDateToISO(dateRaw: string | Date | null | undefined): string | null {
    if (!dateRaw) return null;

    if (dateRaw instanceof Date) {
        return dateRaw.toISOString();
    }

    const dateStr = String(dateRaw).trim();

    // 1. Try native Date first - handle standard RFC 2822 or ISO 8601
    const nativeDate = new Date(dateStr);
    if (!isNaN(nativeDate.getTime())) {
        return nativeDate.toISOString();
    }

    // 2. Try any-date-parser on original string
    try {
        const parsedDate = anyDateParser.fromString(dateStr);
        if (parsedDate && !isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
        }
    } catch (e) {
        // Fallback to manual cleaning
    }

    // 3. Robust cleaning fallback (remove French/English days, "at", "à", etc.)
    // 3. Robust cleaning fallback (remove French/English days, "at", "à", etc.)
    let cleaned = dateStr
        .replace(/\b(lun\.?|mar\.?|mer\.?|jeu\.?|ven\.?|sam\.?|dim\.?|mon\.?|tue\.?|wed\.?|thu\.?|fri\.?|sat\.?|sun\.?)\b/gi, '')
        .replace(/\bà\b/gi, '')
        .replace(/\bat\b/gi, '')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ');

    // Normalize French months
    cleaned = cleaned
        .replace(/\bjanv\.?\b/gi, 'Jan')
        .replace(/\bfévr\.?\b/gi, 'Feb')
        .replace(/\bmars\b/gi, 'Mar')
        .replace(/\bavr\.?\b/gi, 'Apr')
        .replace(/\bmai\b/gi, 'May')
        .replace(/\bjuin\b/gi, 'Jun')
        .replace(/\bjuil\.?\b/gi, 'Jul')
        .replace(/\baoût\b/gi, 'Aug')
        .replace(/\bsept\.?\b/gi, 'Sep')
        .replace(/\boct\.?\b/gi, 'Oct')
        .replace(/\bnov\.?\b/gi, 'Nov')
        .replace(/\bdéc\.?\b/gi, 'Dec')
        .replace(/\bfevr\.?\b/gi, 'Feb') // Tolerance for missing accent
        .replace(/\baout\b/gi, 'Aug')
        .replace(/\bdec\.?\b/gi, 'Dec')
        .trim();

    // Retry native Date on cleaned string
    const cleanedNative = new Date(cleaned);
    if (!isNaN(cleanedNative.getTime())) {
        return cleanedNative.toISOString();
    }

    // Retry any-date-parser on cleaned string
    try {
        const cleanedParsed = anyDateParser.fromString(cleaned);
        if (cleanedParsed && !isNaN(cleanedParsed.getTime())) {
            return cleanedParsed.toISOString();
        }
    } catch (e) { }

    return null;
}

export function cleanText(text: string | null | undefined): string | null {
    if (typeof text !== 'string') return null;
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '') // trim end of lines
        .trim();
}

/**
 * Basic HTML to Text converter to handle cases where text/plain is missing.
 * Replaces common block elements with newlines and strips all other tags.
 */
export function convertHtmlToText(html: string | null | undefined): string | null {
    if (typeof html !== 'string') return null;

    let text = html
        .replace(/<style([\s\S]*?)<\/style>/gi, '')   // Remove CSS
        .replace(/<script([\s\S]*?)<\/script>/gi, '') // Remove JS
        .replace(/<br\s*\/?>/gi, '\n')                 // <br> to \n
        .replace(/<\/p>/gi, '\n\n')                    // </p> to double \n
        .replace(/<\/div>/gi, '\n')                   // </div> to \n
        .replace(/<[^>]+>/g, '')                      // Strip all tags
        .replace(/&nbsp;/g, ' ')                      // Entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');

    // Decode entities like &#x... or &#...
    text = text.replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    text = text.replace(/&#x([0-9a-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    return cleanText(text);
}

export function extractInlineAttachments(text: string | null | undefined): import('./types').Attachment[] {
    if (typeof text !== 'string') return [];

    const attachments: import('./types').Attachment[] = [];
    const attachmentRegex = /<([-a-zA-Z0-9._ ]+\.([a-zA-Z0-9]+))>/g;
    let match;

    const extensionMap: Record<string, string> = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'html': 'text/html',
        'xml': 'application/xml',
        'json': 'application/json'
    };

    while ((match = attachmentRegex.exec(text)) !== null) {
        const filename = match[1];
        const ext = match[2]?.toLowerCase();

        // Prevent duplicate filenames in the same node
        if (!attachments.find(a => a.filename === filename)) {
            attachments.push({
                filename: filename,
                contentType: extensionMap[ext] || 'application/octet-stream',
                size: 0
            });
        }
    }

    return attachments;
}

/**
 * Normalizes EmailAddress to fix edge cases like "email [email]" pattern
 * 
 * Issue: Some email clients (Gmail, Outlook) produce formats like:
 *   "john.doe@example.com [john.doe@example.com]"
 * 
 * email-forward-parser may parse this as:
 *   { name: "john.doe@example.com [john.doe@example.com]", address: "" }
 * 
 * This function detects and fixes this pattern to:
 *   { name: null, address: "john.doe@example.com" }
 */
export function normalizeFrom(from: EmailAddress | null | undefined): EmailAddress | null {
    if (!from) return null;

    // PREPROCESSING: Strip all <mailto:...> patterns and extra > characters
    // This handles cases like: "Name" <email<mailto:email>> or email<mailto:email>>
    let cleanedAddress = from.address;
    if (cleanedAddress) {
        // PRE-CLEAN: Strip mailto: residue immediately as it confuses all other regexes
        cleanedAddress = cleanedAddress.replace(/<mailto:[^>\s]+>?/gi, '');

        // 1. Fix "Name" <email> or Name <email> pattern in address field
        const nameEmailMatch = cleanedAddress.match(/^(?:"([^"]+)"|([^<]+?))\s*<([^>]+)>$/);
        if (nameEmailMatch) {
            const extractedName = nameEmailMatch[1] || nameEmailMatch[2];
            const extractedEmail = nameEmailMatch[3];
            if (/^[^\s@]+@[^\s@]+\.[^\s@,]+$/.test(extractedEmail)) {
                return normalizeFrom({
                    name: extractedName?.trim() || from.name,
                    address: extractedEmail.trim()
                });
            }
        }

        // 2. Fix "email [email]" pattern (identical emails)
        if (cleanedAddress.includes('[')) {
            const match = cleanedAddress.match(/^([^\s@]+@[^\s@]+\.[^\s@,]+)\s*\[([^\]]+)\]$/);
            if (match && match[1] === match[2]) {
                cleanedAddress = match[1];
            }
        }

        // 3. FINAL RESIDUE STRIP: Remove any leftover markers
        cleanedAddress = cleanedAddress.replace(/[<>\[\]]/g, '').trim();

        // Update the address in the object for further logic
        from.address = cleanedAddress;
    }

    // ... (rest of logic for empty address)

    // 2. If address is empty but name contains a pattern "email [email]"
    if (!from.address && from.name) {
        const match = from.name.match(/^([^\s@]+@[^\s@]+\.[^\s@,]+)\s*\[([^\]]+)\]$/);

        if (match && match[1] === match[2]) {
            // Pattern "email [email]" detected with identical emails → extract the email
            return {
                name: undefined,
                address: match[1]
            };
        }

        // Try to extract any email from name if it contains one
        const emailMatch = from.name.match(/([^\s@]+@[^\s@]+\.[^\s@,]+)/);
        if (emailMatch) {
            return {
                name: undefined,
                address: emailMatch[1]
            };
        }
    }

    // 3. FINAL POLISH: Strip any leftover bold/italic markers (* or _) and brackets/quotes
    if (from.name) {
        from.name = from.name.replace(/^[\*\_>]+|[\*\_>]+$/g, '').replace(/[<>\[\]]/g, '').trim();
    }
    if (from.address) {
        from.address = from.address.replace(/^[\*\_]+|[\*\_]+$/g, '').trim();
    }

    // FINAL VALIDATION: If at the end we have no address and no name, return null
    if (!from.address && !from.name) return null;

    return from;
}

export function normalizeParserResult(
    parsed: any,
    method: 'inline' | 'fallback',
    depth: number,
    warnings: string[] = []
): ResultObject {
    // email-forward-parser structure:
    // email: { from: { name, address }, subject, date, body, ... }
    const email = parsed?.email || {};

    // Normalize From
    let from: EmailAddress | null = null;
    if (email.from && typeof email.from === 'object') {
        if (email.from.address) {
            from = { name: email.from.name, address: email.from.address };
        }
    } else if (typeof email.from === 'string' && email.from.trim()) {
        from = { address: email.from.trim() };
    }

    // Normalize To
    let to_addr: EmailAddress | null = null;
    if (email.to && typeof email.to === 'object') {
        if (Array.isArray(email.to)) {
            if (email.to.length > 0) {
                const first = email.to[0];
                to_addr = typeof first === 'string' ? { address: first } : { name: first.name, address: first.address };
            }
        } else {
            to_addr = { name: email.to.name, address: email.to.address };
        }
    } else if (typeof email.to === 'string' && email.to.trim()) {
        to_addr = { address: email.to.trim() };
    }

    const date_raw = email.date || null;
    const date_iso = normalizeDateToISO(date_raw);

    if (!date_iso && date_raw) {
        warnings.push(`Could not normalize date: "${date_raw}"`);
    }

    return {
        from,
        to: to_addr,
        subject: email.subject || null,
        date_raw,
        date_iso,
        text: cleanText(email.body),
        full_body: cleanText(email.body) || '',
        attachments: [], // TODO: extract if parser provides them
        history: [],
        diagnostics: {
            method,
            depth,
            parsedOk: !!(from && email.subject),
            warnings
        }
    };
}
