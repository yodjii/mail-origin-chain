import { ForwardDetector, DetectionResult } from './detectors/types';
export { ForwardDetector, DetectionResult };

export interface EmailAddress {
    name?: string;
    address?: string;
}

export interface Attachment {
    filename?: string;
    contentType: string;
    size: number;
    content?: any; // Buffer or stream, depending on need, mostly metadata for now
}

export interface Diagnostics {
    method: 'rfc822' | 'inline' | 'fallback';
    depth: number;
    parsedOk: boolean;
    warnings: string[];
}

export interface HistoryEntry {
    from: EmailAddress | null;
    to: EmailAddress | null;
    subject: string | null;
    date_raw: string | null;
    date_iso: string | null;
    text: string | null; // The text content EXCLUSIVE to this level (not including nested forwards)
    depth: number;
    flags: string[];
    attachments?: Attachment[];
}

export interface ResultObject {
    from: EmailAddress | null;
    to: EmailAddress | null;
    subject: string | null;
    date_raw: string | null;
    date_iso: string | null;
    text: string | null; // The cleaned body content of the deepest level
    full_body?: string; // The full decoded text body before chain splitting
    attachments: Attachment[];
    history: HistoryEntry[];
    diagnostics: Diagnostics;
}

/**
 * Options for extraction behavior
 */
export interface Options {
    /**
     * Maximum depth to descend through MIME attachments.
     * Default: 5
     */
    maxDepth?: number;

    /**
     * Maximum time in milliseconds to wait for MIME parsing before timeout.
     * Default: 5000ms
     */
    timeoutMs?: number;

    /**
     * Skip MIME layer processing and parse only inline forwards.
     * Use this when input is plain text body (not a full email with headers).
     * Default: false
     */
    skipMimeLayer?: boolean;

    /**
     * Custom forward detectors to register.
     * These will be added to the registry and used for detection.
     */
    customDetectors?: ForwardDetector[];
}
