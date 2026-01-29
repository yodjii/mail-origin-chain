
import * as fs from 'fs';
import { simpleParser } from 'mailparser';

const file = 'C:\\Users\\Flo\\Downloads\\Certificat radiation Alix MEZY.eml';

async function dump() {
    const content = fs.readFileSync(file);
    const parsed = await simpleParser(content);
    const fullBody = parsed.text || parsed.html || '';
    fs.writeFileSync('body_dump.txt', typeof fullBody === 'string' ? fullBody : JSON.stringify(fullBody));
    console.log("Body dumped to body_dump.txt");
}

dump();
