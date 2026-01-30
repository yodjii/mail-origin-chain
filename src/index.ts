import { ResultObject, Options, EmailAddress } from './types';
import { processMime } from './mime-layer';
import { processInline } from './inline-layer';
import { cleanText, normalizeFrom } from './utils';

/**
 * Main entry point: Extract the deepest forwarded email using hybrid strategy
 */
export async function extractDeepestHybrid(
    raw: string | Buffer,
    options?: Options
): Promise<ResultObject> {
    const opts = {
        maxDepth: options?.maxDepth ?? 15,
        timeoutMs: options?.timeoutMs ?? 10000,
        skipMimeLayer: options?.skipMimeLayer ?? false,
        customDetectors: options?.customDetectors ?? []
    };

    try {
        // Step 1: MIME Layer
        let mimeResult;
        if (opts.skipMimeLayer) {
            // Simulated mime result for text-only inputs
            const rawBody = typeof raw === 'string' ? raw : raw.toString('binary');
            mimeResult = {
                rawBody,
                depth: 0,
                lastAttachments: [],
                isRfc822: false,
                history: [],
                metadata: {}
            };
        } else {
            let timer: NodeJS.Timeout | undefined;
            mimeResult = await Promise.race([
                processMime(raw, opts),
                new Promise<any>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('MIME parsing timeout')), opts.timeoutMs);
                    if (timer && typeof timer.unref === 'function') timer.unref();
                })
            ]);
            if (timer) clearTimeout(timer);
        }

        // Step 2: Inline Layer
        const inlineResult = await processInline(
            mimeResult.rawBody,
            mimeResult.depth,
            mimeResult.history,
            opts.customDetectors
        );

        // history[0] is the DEEPEST level (original message)
        const deepestEntry = inlineResult.history[0];

        // Metadata extraction from MIME for fallback
        let mimeFrom: EmailAddress | null = null;
        if (mimeResult.metadata?.from) {
            const mFrom = mimeResult.metadata.from as any;
            if (mFrom.value?.[0]) {
                mimeFrom = { name: mFrom.value[0].name, address: mFrom.value[0].address };
            } else if (mFrom.text) {
                mimeFrom = { address: mFrom.text };
            }
        }

        const from = normalizeFrom(deepestEntry?.from || mimeFrom);
        const subject = deepestEntry?.subject || mimeResult.metadata?.subject || null;
        const date_raw = deepestEntry?.date_raw || mimeResult.metadata?.date?.toString() || null;
        const date_iso = deepestEntry?.date_iso || mimeResult.metadata?.date?.toISOString() || null;

        const attachments = (mimeResult.lastAttachments || []).map((att: any) => ({
            filename: att.filename,
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0
        }));

        const warnings = [
            ...(inlineResult.history.length <= 1 && !mimeResult.isRfc822 ? ['No forwarded content detected'] : [])
        ];

        return {
            from,
            to: deepestEntry?.to || null,
            subject,
            date_raw,
            date_iso,
            text: cleanText(deepestEntry?.text),
            full_body: cleanText(mimeResult.rawBody) || '',
            confidence_score: 0,
            attachments: [...attachments, ...inlineResult.attachments],
            history: inlineResult.history,
            diagnostics: {
                ...inlineResult.diagnostics,
                depth: mimeResult.depth + inlineResult.diagnostics.depth,
                method: (inlineResult.diagnostics.method === 'fallback' && mimeResult.isRfc822) ? 'rfc822' : inlineResult.diagnostics.method,
                parsedOk: !!(from && (subject || inlineResult.history.length > 1)),
                warnings: [...warnings, ...inlineResult.diagnostics.warnings]
            }
        };

    } catch (error) {
        const rawString = typeof raw === 'string' ? raw : raw.toString('binary');
        return {
            from: null,
            to: null,
            subject: null,
            date_raw: null,
            date_iso: null,
            text: cleanText(rawString),
            full_body: cleanText(rawString) || '',
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
