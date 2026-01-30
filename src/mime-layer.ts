import { simpleParser, ParsedMail, Attachment as MailparserAttachment } from 'mailparser';
import { Options, HistoryEntry } from './types';
import { convertHtmlToText } from './utils';

export interface MimeResult {
    rawBody: string; // The raw content of the deepest node found via MIME
    depth: number;
    lastAttachments: MailparserAttachment[];
    isRfc822: boolean;
    history: HistoryEntry[];
    metadata?: {
        from?: any;
        to?: any;
        subject?: string;
        date?: Date;
    };
}

export async function processMime(raw: string | Buffer, options: Options): Promise<MimeResult> {
    let currentRaw = raw;
    let depth = 0;
    const maxDepth = options.maxDepth || 5;
    let lastAttachments: MailparserAttachment[] = [];
    let isRfc822 = false;
    const history: HistoryEntry[] = [];

    // Safety check
    if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
        throw new Error("MIME parser input must be a string or Buffer");
    }

    // Iterative approach to avoid call stack limits, though recursion is also fine for depth < 100
    while (depth < maxDepth) {
        try {
            const parsed: ParsedMail = await simpleParser(currentRaw);

            // Record current level in history
            history.push({
                from: (parsed.from as any)?.value?.[0] ? {
                    name: (parsed.from as any).value[0].name,
                    address: (parsed.from as any).value[0].address
                } : null,
                to: (parsed.to as any)?.value?.[0] ? {
                    name: (parsed.to as any).value[0].name,
                    address: (parsed.to as any).value[0].address
                } : null,
                subject: parsed.subject || null,
                date_raw: parsed.date?.toString() || null,
                date_iso: parsed.date ? parsed.date.toISOString() : null,
                text: parsed.text || convertHtmlToText(parsed.html as string) || null,
                depth,
                flags: ['trust:high_mime'],
                attachments: parsed.attachments.map(att => ({
                    filename: att.filename,
                    contentType: att.contentType || 'application/octet-stream',
                    size: att.size || 0
                }))
            });

            // Check for attached messages
            const rfcParts = parsed.attachments.filter(a => a.contentType === 'message/rfc822');

            if (rfcParts.length > 0) {
                const last = rfcParts[rfcParts.length - 1];

                if (last.content) {
                    currentRaw = last.content; // Pass Buffer directly to preserve encoding
                    depth++;
                    isRfc822 = true;
                    // Reset attachments for the new level
                    lastAttachments = [];
                    continue;
                }
            }

            return {
                rawBody: parsed.text || convertHtmlToText(parsed.html as string) || (Buffer.isBuffer(currentRaw) ? currentRaw.toString('binary') : currentRaw),
                depth,
                lastAttachments: parsed.attachments,
                isRfc822,
                history,
                metadata: {
                    from: parsed.from,
                    to: parsed.to,
                    subject: parsed.subject,
                    date: parsed.date
                }
            };

        } catch (error) {
            break;
        }
    }

    return {
        rawBody: typeof currentRaw === 'string' ? currentRaw : currentRaw.toString('binary'),
        depth,
        lastAttachments,
        isRfc822,
        history
    };
}
