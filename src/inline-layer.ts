import EmailForwardParser from 'email-forward-parser';
import { DetectorRegistry } from './detectors';
import { normalizeDateToISO, cleanText, normalizeFrom, extractInlineAttachments } from './utils';
import { ResultObject, HistoryEntry } from './types';

import { ForwardDetector } from './detectors/types';

/**
 * Process inline forwarded content recursively.
 * Uses a manual loop with DetectorRegistry to allow multiple strategies (lib, custom regexes, etc.)
 */
export async function processInline(
    text: string,
    depth: number,
    baseHistory: HistoryEntry[] = [],
    customDetectors: ForwardDetector[] = []
): Promise<ResultObject> {
    const warnings: string[] = [];
    const registry = new DetectorRegistry(customDetectors);
    const history: HistoryEntry[] = [...baseHistory];

    let currentText = text.trim();
    const startingDepth = depth;
    let currentDepth = depth;
    const maxRecursiveDepth = 15; // Increased for deep chains

    // Ensure we have at least one entry representing the "current" starting point
    if (history.length === 0) {
        history.push({
            from: null,
            to: null,
            subject: null,
            date_raw: null,
            date_iso: null,
            text: '',
            depth: currentDepth,
            flags: ['level:root', 'trust:medium_inline']
        });
    }

    // Detection loop
    while (currentDepth < maxRecursiveDepth) {
        const result = registry.detect(currentText);

        if (!result.found || !result.email) {
            // No more forwards detected
            const lastIdx = history.length - 1;
            history[lastIdx].text = cleanText(currentText);

            // Enrich with inline attachments if not already present
            const inlineAtts = extractInlineAttachments(history[lastIdx].text);
            if (inlineAtts.length > 0) {
                const existing = history[lastIdx].attachments || [];
                const toAdd = inlineAtts.filter(a => !existing.find(e => e.filename === a.filename));
                if (toAdd.length > 0) {
                    history[lastIdx].attachments = [...existing, ...toAdd];
                }
            }
            break;
        }

        const email = result.email;

        // Update previous level's exclusive text
        const previousIdx = history.length - 1;
        history[previousIdx].text = cleanText(result.message || '');
        if (!history[previousIdx].text && !history[previousIdx].flags.includes('content:silent_forward')) {
            history[previousIdx].flags.push('content:silent_forward');
        }

        // Enrich previous level with inline attachments
        const prevInlineAtts = extractInlineAttachments(history[previousIdx].text);
        if (prevInlineAtts.length > 0) {
            const existing = history[previousIdx].attachments || [];
            const toAdd = prevInlineAtts.filter(a => !existing.find(e => e.filename === a.filename));
            if (toAdd.length > 0) {
                history[previousIdx].attachments = [...existing, ...toAdd];
            }
        }

        // Build flags 
        const flags = [`method:${result.detector || 'unknown'}`, 'trust:medium_inline'];
        if (!email.body || email.body.trim() === '') {
            flags.push('content:silent_forward');
        }

        // Normalize date
        const dateIso = normalizeDateToISO(email.date);
        if (email.date && !dateIso) {
            warnings.push(`Could not normalize date: "${email.date}"`);
            flags.push('date:unparseable');
        }

        // Normalize from address
        let fromNormalized: import('./types').EmailAddress | null = typeof email.from === 'object'
            ? { name: email.from.name, address: email.from.address }
            : (email.from ? { address: email.from } : null);

        fromNormalized = normalizeFrom(fromNormalized);

        // Normalize to address
        let toNormalized: import('./types').EmailAddress | null = typeof email.to === 'object'
            ? { name: email.to.name, address: email.to.address }
            : (email.to ? { address: email.to } : null);

        if (typeof email.to === 'string') {
            toNormalized = normalizeFrom({ address: email.to });
        } else if (toNormalized) {
            toNormalized = normalizeFrom(toNormalized);
        }

        // Add this forward level to history
        const cleanedBody = cleanText(email.body || '');
        history.push({
            from: fromNormalized,
            to: toNormalized,
            subject: email.subject || null,
            date_raw: email.date || null,
            date_iso: dateIso,
            text: cleanedBody,
            depth: currentDepth + 1,
            flags: flags,
            attachments: extractInlineAttachments(cleanedBody)
        });

        // Continue with the body for next iteration
        currentText = (email.body || '').trim();
        currentDepth++;
    }

    // Mark the deepest entry
    if (currentDepth > startingDepth) {
        const deepestEntry = history[history.length - 1];
        if (!deepestEntry.flags.includes('level:deepest')) {
            deepestEntry.flags.push('level:deepest');
        }

        return {
            from: deepestEntry.from,
            subject: deepestEntry.subject,
            date_raw: deepestEntry.date_raw,
            date_iso: deepestEntry.date_iso,
            text: deepestEntry.text,
            to: deepestEntry.to,
            attachments: [],
            history: history.slice().reverse(),
            diagnostics: {
                method: (deepestEntry.flags.find(f => f.startsWith('method:'))?.replace('method:', '') || 'inline') as any,
                depth: currentDepth - startingDepth,
                parsedOk: true,
                warnings: warnings
            }
        };
    }

    // No forwards found
    const currentEntry = history[history.length - 1];
    return {
        from: currentEntry.from,
        subject: currentEntry.subject,
        date_raw: currentEntry.date_raw,
        date_iso: currentEntry.date_iso,
        text: currentEntry.text || cleanText(currentText),
        to: currentEntry.to,
        attachments: [],
        history: history.slice().reverse(),
        diagnostics: {
            method: 'fallback',
            depth: 0,
            parsedOk: false,
            warnings: warnings.length > 0 ? warnings : ['No forwarded content detected']
        }
    };
}
