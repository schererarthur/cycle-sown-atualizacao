// ============================================================================
// Rota que recebe o upload do laudo de análise de solo (PDF ou foto) e usa a
// API do Claude (Anthropic) para extrair os valores automaticamente, para o
// frontend preencher o formulário de análise sozinho.
//
// POST /api/parse-laudo  (multipart/form-data, campo "laudo")
// ============================================================================

const os = require('os');
const fs = require('fs/promises');
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(new Error('Tipo de arquivo não suportado. Envie um PDF, PNG, JPEG ou WebP.'));
            return;
        }
        cb(null, true);
    }
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um especialista em leitura de laudos de análise de solo de laboratórios brasileiros (especialmente da rede ROLAS do RS/SC).

Sua tarefa: extrair TODOS os valores presentes no laudo e retornar EXCLUSIVAMENTE um objeto JSON válido.

REGRAS:
- Retorne APENAS o JSON. Sem markdown, sem backticks, sem explicação, sem texto antes ou depois.
- Converta vírgulas decimais para pontos (ex: 5,2 → 5.2).
- Se um valor NÃO estiver presente no laudo, use null.
- Se não conseguir ler um valor com certeza, use null.
- Identifique a unidade de medida que o laboratório usou para cada parâmetro.
- NÃO invente valores. Se não está no laudo, é null.

CAMPOS QUE VOCÊ DEVE EXTRAIR:

{
  "labName": "string ou null — nome do laboratório",
  "sampleId": "string ou null — número/código da amostra",
  "date": "string ou null — data da análise",

  "phWater": number ou null,
  "phCaCl2": number ou null,
  "smpIndex": number ou null,

  "organicMatter": { "value": number ou null, "unit": "percentage | gkg | gdm3" },

  "clay": { "value": number ou null, "unit": "percentage | gkg" },
  "sand": { "value": number ou null, "unit": "percentage | gkg" },
  "silt": { "value": number ou null, "unit": "percentage | gkg" },

  "phosphorus": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "potassium": { "value": number ou null, "unit": "mgdm3 | cmolcdm3 | mmolcdm3 | mgkg | ppm" },
  "calcium": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3 | mgdm3 | meq100ml" },
  "magnesium": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3 | mgdm3 | meq100ml" },
  "sulfur": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },

  "aluminum": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3 | meq100ml" },
  "potentialAcidity": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3 | meq100ml" },

  "iron": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "manganese": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "zinc": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "copper": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "boron": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },
  "molybdenum": { "value": number ou null, "unit": "mgdm3 | mgkg | ppm" },

  "sb": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3" },
  "ctcEffective": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3" },
  "ctcPH7": { "value": number ou null, "unit": "cmolcdm3 | mmolcdm3" },
  "vPercentage": number ou null,
  "mPercentage": number ou null
}

ATENÇÃO:
- NÃO extraia Nitrogênio (N). Laudos de solo quase nunca trazem N.
- NÃO extraia Região, Estado ou Tipo de Solo — isso o agricultor preenche.
- Se o laudo trouxer SB, CTC, V% e m% calculados, extraia. Se não, retorne null (o frontend calcula automaticamente).
- Abreviações comuns: P = Fósforo, K = Potássio, Ca = Cálcio, Mg = Magnésio, S = Enxofre, Al = Alumínio, H+Al = Acidez potencial, MO = Matéria orgânica, B/Cu/Fe/Mn/Zn/Mo = Micronutrientes.`;

// Encontra o primeiro objeto JSON top-level no texto, contando chaves
// balanceadas (ignorando chaves dentro de strings) em vez de um regex guloso
// — assim, texto extra depois do JSON (comum quando a IA ignora a instrução
// de "só JSON, sem explicação") não quebra a extração.
function extractFirstJsonObject(text) {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === '\\') {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}

// Extrai o objeto JSON da resposta do modelo, tolerando blocos markdown
// (```json ... ```) ou texto ao redor, caso a IA não siga a instrução de
// devolver JSON puro.
function parseJsonFromModelText(text) {
    try {
        return JSON.parse(text);
    } catch {
        const candidate = extractFirstJsonObject(text);
        if (candidate) {
            return JSON.parse(candidate);
        }
        throw new Error('A resposta da IA não veio em formato JSON válido.');
    }
}

router.post('/parse-laudo', (req, res) => {
    upload.single('laudo')(req, res, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === 'LIMIT_FILE_SIZE'
                ? 'Arquivo muito grande. O limite é 20 MB.'
                : uploadError.message;
            return res.status(400).json({ error: message });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        try {
            const fileBuffer = await fs.readFile(req.file.path);
            const base64Data = fileBuffer.toString('base64');

            const fileContentBlock = req.file.mimetype === 'application/pdf'
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
                : { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: base64Data } };

            const response = await anthropic.messages.create({
                model: 'claude-sonnet-5',
                max_tokens: 2048,
                thinking: { type: 'disabled' },
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            fileContentBlock,
                            { type: 'text', text: 'Leia este laudo de análise de solo e extraia os valores conforme as instruções do sistema.' }
                        ]
                    }
                ]
            });

            const textBlock = response.content.find((block) => block.type === 'text');
            if (!textBlock) {
                return res.status(502).json({ error: 'A IA não retornou nenhum texto. Tente novamente.' });
            }

            const extracted = parseJsonFromModelText(textBlock.text);
            res.json(extracted);
        } catch (err) {
            console.error('Erro ao processar laudo com IA:', err.message);
            res.status(502).json({ error: 'Não foi possível ler o laudo com a IA. Tente novamente ou preencha manualmente.' });
        } finally {
            await fs.unlink(req.file.path).catch(() => {});
        }
    });
});

module.exports = router;
