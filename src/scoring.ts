
/**
 * Confidence Score Calculation Logic
 * Evaluates the coherence between detected forward depth and email address density.
 * Uses a Signal-Based architecture where various factors contribute to a health score.
 */

export interface ConfidenceResult {
    score: number; // 0 to 100
    description: string; // Human readable explanation
    // Details
    ratio: number;
    email_count: number;
    sender_count: number;
    quote_depth: number;
    signals: Record<string, number>;
    reasons: string[];
}

export function calculateConfidence(fullBody: string, depth: number): ConfidenceResult {
    // 0. Base case: No depth detected implies no confidence metric applicable (N/A)
    if (depth === 0) {
        return {
            score: 100,
            description: "N/A (No depth detected)",
            ratio: 0,
            email_count: 0,
            sender_count: 0,
            quote_depth: 0,
            signals: {},
            reasons: ["No depth detected"]
        };
    }

    // 1. Calculate Max Quote Depth (">" prefix)
    const lines = fullBody.split('\n');
    let maxQuoteDepth = 0;
    for (const line of lines) {
        const match = line.match(/^(\s*>)+/);
        if (match) {
            const qCount = (match[0].match(/>/g) || []).length;
            if (qCount > maxQuoteDepth) maxQuoteDepth = qCount;
        }
    }

    // 2. Count emails strictly between angle brackets <...>
    const emailRegex = /<[\s\r\n]*([^\s<>@]+@[^\s<>@]+)[\s\r\n]*>/g;
    let match;
    const emails: { addr: string, index: number, fullMatchLength: number }[] = [];
    while ((match = emailRegex.exec(fullBody)) !== null) {
        emails.push({ addr: match[1], index: match.index, fullMatchLength: match[0].length });
    }

    const count = emails.length;
    const ratio = count / depth;

    // 3. Sender & Header context analysis
    let explainedCount = 0;
    let fromCount = 0;
    const contextWindow = 150;

    const fromKeywords = [
        "From", "Od", "Fra", "Von", "De", "Lähettäjä", "Šalje", "Feladó", "Da", "Van", "Expeditorul",
        "Отправитель", "Från", "Kimden", "Від кого", "Saatja", "De la", "Gönderen", "От", "Від",
        "Mittente", "Nadawca", "送信元"
    ];

    const otherKeywords = [
        "To", "Komu", "Til", "An", "Para", "Vastaanottaja", "À", "Prima", "Címzett", "A", "Aan", "Do",
        "Destinatarul", "Кому", "Pre", "Till", "Kime", "Pour", "Adresat", "送信先",
        "Cc", "CC", "Kopie", "Kopio", "Másolat", "Kopi", "Dw", "Копия", "Kopia", "Bilgi", "Копія",
        "Másolatot kap", "Kópia", "Copie à",
        "Reply-To", "Odgovori na", "Odpověď na", "Svar til", "Antwoord aan", "Vastaus", "Répondre à",
        "Antwort an", "Válaszcím", "Rispondi a", "Odpowiedź-do", "Responder A", "Responder a",
        "Răspuns către", "Ответ-Кому", "Odpovedať-Pre", "Svara till", "Yanıt Adresi", "Кому відповісти"
    ];

    const trailingSenderKeywords = [
        "wrote", "escribió", "a écrit", "kirjoitti", "ezt írta", "ha scritto", "geschreven", "skrev",
        "napisał", "escreveu", "написал", "napísal", "följande", "tarihinde şunu yazdı", "napsal"
    ];

    const buildRegex = (words: string[], strict: boolean = false) => {
        const sorted = Array.from(new Set(words)).sort((a, b) => b.length - a.length);
        const joined = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const prefix = `[\\*\\_\\>]*\\s*`;
        const suffix = `\\s*[\\*\\_]*\\s*`;
        if (strict) {
            return new RegExp(`(?:${prefix}(?:${joined})${suffix})\\s*:\\s*(?:[^:\\n]*\\n\\s*)?[^:\\n]*$`, 'i');
        }
        return new RegExp(`(?:${prefix}(?:${joined})${suffix})\\s*:`, 'i');
    };

    const headerPattern = buildRegex([...fromKeywords, ...otherKeywords], false);
    const fromPattern = buildRegex(fromKeywords, true);
    const trailingPattern = new RegExp(`^\\s*[\\*\\_\\>]*\\s*(?:${trailingSenderKeywords.join('|')})\\s*:?`, 'i');

    for (const email of emails) {
        const start = Math.max(0, email.index - contextWindow);
        const preText = fullBody.substring(start, email.index);
        const postText = fullBody.substring(email.index + email.fullMatchLength);
        const blocks = preText.split(/\n\s*\n/);
        const currentBlock = blocks[blocks.length - 1];

        if (headerPattern.test(currentBlock)) explainedCount++;
        if (fromPattern.test(preText) || trailingPattern.test(postText)) fromCount++;
    }

    // ⚖️  SIGNAL-BASED SCORING ⚖️
    const signals: Record<string, number> = {};
    let finalScore = 100;
    const reasons: string[] = [];

    // --- 1. Ratio Signals (The base score) ---
    if (count === 0) {
        signals['penalty_ghost'] = -100;
        reasons.push("Ghost Forward: 0 emails found in the body");
    } else if (ratio < 0.5) {
        signals['penalty_inconsistent'] = -100;
        reasons.push(`Inconsistent Density: Ratio ${ratio.toFixed(2)} is too low (expected >= 0.5)`);
    } else if (ratio >= 0.5 && ratio <= 1.5) {
        signals['adjustment_partial'] = -50;
        reasons.push(`Partial Chain: Ratio ${ratio.toFixed(2)} suggests ~1 email per detected level`);
    } else if (ratio > 2.4) {
        signals['adjustment_high_density'] = -75;
        reasons.push(`High Density: Ratio ${ratio.toFixed(2)} is high (many emails per level)`);

        // Bonus for validated high density
        const explainedRatio = explainedCount / count;
        if (explainedRatio >= 0.6) {
            signals['bonus_validated_density'] = 75;
            reasons.push(`Validated Density: ${Math.round(explainedRatio * 100)}% of emails are preceded by headers`);
        } else {
            reasons.push(`Unvalidated Density: Only ${Math.round(explainedRatio * 100)}% of emails have header context`);
        }
    } else {
        reasons.push(`Standard Density: Ratio ${ratio.toFixed(2)} is optimal (~2 emails per level)`);
    }

    // --- 2. Coherence Signals (Penalties) ---
    if (fromCount > depth) {
        signals['penalty_sender_mismatch'] = -75;
        reasons.push(`Sender Mismatch: Found ${fromCount} senders but only ${depth} forward levels`);
    }
    if (maxQuoteDepth > depth) {
        signals['penalty_quote_mismatch'] = -75;
        reasons.push(`Quote Mismatch: Max quote nesting ${maxQuoteDepth} exceeds detected depth ${depth}`);
    }

    // --- Aggregate ---
    for (const val of Object.values(signals)) {
        finalScore += val;
    }

    finalScore = Math.max(0, Math.min(100, finalScore));

    // Map description based on final score if not already descriptive
    let description = reasons.join("; ");
    if (finalScore === 100) description = "High Confidence: " + description;
    else if (finalScore >= 50) description = "Medium Confidence: " + description;
    else description = "Low Confidence: " + description;

    return {
        score: finalScore,
        description,
        ratio,
        email_count: count,
        sender_count: fromCount,
        quote_depth: maxQuoteDepth,
        signals,
        reasons
    };
}
