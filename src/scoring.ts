
/**
 * Confidence Score Calculation Logic
 * Evaluates the coherence between detected forward depth and email address density.
 */

export interface ConfidenceResult {
    score: number; // 0 to 100
    description: string; // Human readable explanation
    // Details
    ratio: number;
    email_count: number;
    sender_count: number;
}

export function calculateConfidence(fullBody: string, depth: number): ConfidenceResult {
    // 0. Base case: No depth detected implies no confidence metric applicable (N/A)
    // We return a neutral high score because there is no mismatch to detect.
    if (depth === 0) {
        return { score: 100, description: "N/A (No depth detected)", ratio: 0, email_count: 0, sender_count: 0 };
    }

    // 1. Count emails strictly between angle brackets <...>
    // This reduces noise from signatures, login ids, etc.
    const emailRegex = /<[^>\s]+@[^>\s]+>/g;
    let match;
    const emails: { addr: string, index: number }[] = [];

    // We use a loop to track indices for context checking
    while ((match = emailRegex.exec(fullBody)) !== null) {
        emails.push({ addr: match[0], index: match.index });
    }

    const count = emails.length;
    const ratio = count / depth;

    // 🚧 SETUP ANALYSIS TOOLS 🚧
    let explainedCount = 0;
    let fromCount = 0;

    // Look back 150 chars for context
    const contextWindow = 150;

    // Keywords from email-forward-parser (parser.js) covering multiple languages
    // Includes: From, To, Cc, Reply-To and their localized variants
    const keywords = [
        // From
        "From", "Od", "Fra", "Von", "De", "Lähettäjä", "Šalje", "Feladó", "Da", "Van", "Expeditorul",
        "Отправитель", "Från", "Kimden", "Від кого", "Saatja", "De la", "Gönderen", "От", "Від",
        "Mittente", "Nadawca", "送信元",

        // To
        "To", "Komu", "Til", "An", "Para", "Vastaanottaja", "À", "Prima", "Címzett", "A", "Aan", "Do",
        "Destinatarul", "Кому", "Pre", "Till", "Kime", "Pour", "Adresat", "送信先",

        // Cc
        "Cc", "CC", "Kopie", "Kopio", "Másolat", "Kopi", "Dw", "Копия", "Kopia", "Bilgi", "Копія",
        "Másolatot kap", "Kópia", "Copie à",

        // Reply-To
        "Reply-To", "Odgovori na", "Odpověď na", "Svar til", "Antwoord aan", "Vastaus", "Répondre à",
        "Antwort an", "Válaszcím", "Rispondi a", "Odpowiedź-do", "Responder A", "Responder a",
        "Răspuns către", "Ответ-Кому", "Odpovedať-Pre", "Svara till", "Yanıt Adresi", "Кому відповісти",
        "Appreciated" // Legacy/Specific
    ];

    // Keywords specific to Senders (From) to detect missed separators
    const fromKeywords = [
        "From", "Od", "Fra", "Von", "De", "Lähettäjä", "Šalje", "Feladó", "Da", "Van", "Expeditorul",
        "Отправитель", "Från", "Kimden", "Від кого", "Saatja", "De la", "Gönderen", "От", "Від",
        "Mittente", "Nadawca", "送信元"
    ];

    // Keywords appearing AFTER the email (e.g. "On ... <email> wrote:")
    const trailingSenderKeywords = [
        "wrote", "escribió", "a écrit", "kirjoitti", "ezt írta", "ha scritto", "geschreven", "skrev",
        "napisał", "escreveu", "написал", "napísal", "följande", "tarihinde şunu yazdı", "napsal"
    ];

    // Construct regexes
    const buildRegex = (words: string[], strict: boolean = false) => {
        const sorted = Array.from(new Set(words)).sort((a, b) => b.length - a.length);
        const joined = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

        // Allow optional decorative characters (Markdown *, _, or >) before/after the keyword
        // e.g. "*From :*" or "> From:"
        const prefix = `[\\*\\_\\>]*\\s*`;
        const suffix = `\\s*[\\*\\_]*\\s*`;

        // If strict, we want the pattern to appear at the END of the preText (ignoring name chars)
        if (strict) {
            // (?:Prefix)(Keyword)(Suffix) : [Content]$
            return new RegExp(`(?:${prefix}(?:${joined})${suffix})\\s*:\\s*[^:\\n]*$`, 'i');
        }
        return new RegExp(`(?:${prefix}(?:${joined})${suffix})\\s*:`, 'i');
    };

    const buildTrailingRegex = (words: string[]) => {
        const sorted = Array.from(new Set(words)).sort((a, b) => b.length - a.length);
        const joined = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        // Check if postText starts with " wrote:" or similar
        return new RegExp(`^\\s*(?:${joined})\\s*:`, 'i');
    }

    const headerPattern = buildRegex(keywords, false); // Loose check for "context"
    const fromPattern = buildRegex(fromKeywords, true); // Strict check for "Sender" (Prefix)
    const trailingPattern = buildTrailingRegex(trailingSenderKeywords); // Strict check for "Sender" (Suffix)

    // 🏃 RUN ANALYSIS LOOP 🏃
    for (const email of emails) {
        // Extract the text chunk preceding the email
        const start = Math.max(0, email.index - contextWindow);
        const preText = fullBody.substring(start, email.index);

        // Extract text following the email (for "wrote:" check)
        const postText = fullBody.substring(email.index + email.addr.length);

        // Get the "logical block" (lines near the email)
        const blocks = preText.split(/\n\s*\n/);
        const currentBlock = blocks[blocks.length - 1];

        if (headerPattern.test(currentBlock)) {
            explainedCount++;
        }

        // For From Check: Look strictly at the text immediately preceding the email
        // OR the text immediately following (for "On ... wrote:")
        if (fromPattern.test(preText) || trailingPattern.test(postText)) {
            fromCount++;
        }
    }


    // ⚖️  APPLY RULES ⚖️
    const details = { ratio, email_count: count, sender_count: fromCount };

    // 1. CRITICAL CHECK: Missed Separators (Too many senders)
    // Applies regardless of ratio logic.
    if (fromCount > depth) {
        return { score: 25, description: `Low Confidence (Suspect: Detected ${fromCount} senders for depth ${depth})`, ...details };
    }

    // 2. Ghost Forward (0 emails)
    if (count === 0) {
        return { score: 0, description: "Low Confidence (Ghost Forward: 0 emails found)", ...details };
    }

    // 3. High Density Check (Ratio > 2.4)
    if (ratio > 2.4) {
        const explainedRatio = count > 0 ? explainedCount / count : 0;
        const threshold = 0.6; // 60% of emails must be explained by headers

        if (explainedRatio >= threshold) {
            return { score: 100, description: "High Confidence (High Density Header Chain)", ...details };
        } else {
            return { score: 25, description: "Low Confidence (Suspect: High density without headers)", ...details };
        }
    }

    // 4. Standard Ratios

    // Ratio ~2.0 (Standard)
    if (ratio > 1.5 && ratio <= 2.4) {
        return { score: 100, description: "High Confidence (Standard: ~2 emails per level)", ...details };
    }

    // Ratio ~1.0 (Partial)
    if (ratio >= 0.5 && ratio <= 1.5) {
        return { score: 50, description: "Medium Confidence (Partial: ~1 email per level)", ...details };
    }

    // Fallback
    return { score: 0, description: "Low Confidence (Inconsistent)", ...details };
}
