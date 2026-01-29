import { processMime } from './mime-layer';
import { processInline } from './inline-layer';
import { Options, ResultObject, Attachment } from './types';
import { normalizeDateToISO, cleanText, normalizeFrom } from './utils';

/**
 * Main entry point: Extract the deepest forwarded email using hybrid strategy
 */
export async function extractDeepestHybrid(raw: string, options?: Options): Promise<ResultObject> {
    // Validation
    if (typeof raw !== 'string') {
        throw new Error('Input must be a string');
    }

    const opts = {
        maxDepth: options?.maxDepth ?? 15,
        timeoutMs: options?.timeoutMs ?? 10000,
        skipMimeLayer: options?.skipMimeLayer ?? false,
        customDetectors: options?.customDetectors ?? []
    };

    const warnings: string[] = [];

    // If skipMimeLayer is true, parse only inline forwards (text-only mode)
    if (opts.skipMimeLayer) {
        return await processInline(raw, 0, [], opts.customDetectors);
    }

    try {
        // Step 1: MIME Layer
        let timer: NodeJS.Timeout | undefined;
        const mimeResult = await Promise.race([
            processMime(raw, opts),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('MIME parsing timeout')), opts.timeoutMs);
            })
        ]).finally(() => {
            if (timer) clearTimeout(timer);
        });

        // Step 2: Inline Layer
        const inlineResult = await processInline(mimeResult.rawBody, mimeResult.depth, mimeResult.history, opts.customDetectors);

        // Step 3: Align results
        let from = normalizeFrom(inlineResult.from);
        let subject = inlineResult.subject;
        let date_raw = inlineResult.date_raw;
        let date_iso = inlineResult.date_iso;
        let text = inlineResult.text;

        if (inlineResult.diagnostics.method === 'fallback' && mimeResult.metadata) {
            const m = mimeResult.metadata;
            if (!from && m.from?.value?.[0]) {
                from = normalizeFrom({ name: m.from.value[0].name, address: m.from.value[0].address });
            }
            if (!subject && m.subject) subject = m.subject;
            if (!date_iso && m.date) date_iso = m.date.toISOString();
            if (!date_raw && m.date) date_raw = m.date.toString();
            if (!text) text = mimeResult.rawBody;
        }

        // Align the root entry of history
        if (inlineResult.history.length > 0) {
            const rootInHistory = inlineResult.history[inlineResult.history.length - 1];
            if (!rootInHistory.from && mimeResult.metadata) {
                const m = mimeResult.metadata;
                if (m.from?.value?.[0]) {
                    rootInHistory.from = normalizeFrom({ name: m.from.value[0].name, address: m.from.value[0].address });
                }
                if (m.subject) rootInHistory.subject = m.subject;
            }
        }

        // Step 4: Final enrichment
        const attachments: Attachment[] = mimeResult.lastAttachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0
        }));

        date_iso = date_iso || normalizeDateToISO(date_raw);

        // Destructure to exclude 'from' since we have our own normalized version
        const { from: _unusedFrom, ...restInlineResult } = inlineResult;

        const result: ResultObject = {
            ...restInlineResult,
            // Use our normalized/enriched values
            from,
            subject,
            date_raw,
            date_iso,
            text: cleanText(text),
            attachments: [...attachments, ...inlineResult.attachments],
            diagnostics: {
                ...inlineResult.diagnostics,
                depth: mimeResult.depth + inlineResult.diagnostics.depth,
                method: (inlineResult.diagnostics.method === 'fallback' && mimeResult.isRfc822) ? 'rfc822' : inlineResult.diagnostics.method,
                parsedOk: !!(from && subject) || !!(from && inlineResult.diagnostics.method !== 'fallback'),
                warnings: [...warnings, ...inlineResult.diagnostics.warnings]
            }
        };

        return result;

    } catch (error) {
        return {
            from: null,
            subject: null,
            date_raw: null,
            date_iso: null,
            text: cleanText(raw),
            attachments: [],
            history: [],
            diagnostics: {
                method: 'fallback',
                depth: 0,
                parsedOk: false,
                warnings: [`Fatal error: ${(error as Error).message}`]
            }
        };
    }
}

export * from './types';
