// ── Visora RAG Pipeline ──────────────────────────────────────────────────────
// Cohere (embeddings) + Groq (LLM) + PDF.js (PDF parsing)
// All API calls are made directly from the browser.

const COHERE_API_KEY   = 'drT9g43z4IU7fnO1VEdQjQgEvMoZ7Ob6ah4ujesk';
const GROQ_API_KEY     = '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';
const COHERE_EMBED_URL = 'https://api.cohere.com/v2/embed';
const GROQ_CHAT_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL       = 'llama-3.3-70b-versatile';

const SIMILARITY_THRESHOLD = 0.35;
const TOP_K                = 3;
const EMBED_BATCH_SIZE     = 90;
const CACHE_VERSION        = 'visora_embeddings_v2';

const MANUAL_MAP = {
  1: { path: 'assets/manuals/CNC-Milling-Machine-Manual-2023.pdf',  title: 'CNC Milling Machine Manual' },
  2: { path: 'assets/manuals/Belt-Conveyor-Manual-2022.pdf',         title: 'Belt Conveyor System Manual' }
};

// ── PDF Parsing ───────────────────────────────────────────────────────────────

async function loadAndParsePDF(url) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js not loaded — make sure the CDN script tag is present.');
  }
  const loadingTask = pdfjsLib.getDocument({ url });
  const pdf = await loadingTask.promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    pageTexts.push(text);
  }
  return pageTexts;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunkPageTexts(pageTexts, machineId, manualTitle) {
  // Build full text and record where each page starts
  let fullText = '';
  const pageStartOffsets = [];
  for (const text of pageTexts) {
    pageStartOffsets.push(fullText.length);
    fullText += text.trim() + '\n\n';
  }

  // Split into rough sentences on terminal punctuation
  const rawSentences = fullText.split(/(?<=[.?!])\s+/);

  // Merge fragments shorter than 20 chars into the previous sentence
  const sentences = [];
  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.length < 20 && sentences.length > 0) {
      sentences[sentences.length - 1] += ' ' + trimmed;
    } else {
      sentences.push(trimmed);
    }
  }

  // Track each sentence's approximate start offset in fullText
  const sentenceOffsets = [];
  let cursor = 0;
  for (const s of sentences) {
    const idx = fullText.indexOf(s, cursor);
    sentenceOffsets.push(idx >= 0 ? idx : cursor);
    cursor = idx >= 0 ? idx + s.length : cursor + s.length;
  }

  // Determine which page a character offset falls on
  function pageForOffset(offset) {
    let page = 0;
    for (let i = 0; i < pageStartOffsets.length; i++) {
      if (pageStartOffsets[i] <= offset) page = i + 1;
      else break;
    }
    return page;
  }

  // Slide a window of 4 sentences, step by 3 (1-sentence overlap)
  const WINDOW = 4;
  const STEP   = 3;
  const chunks = [];

  for (let i = 0; i < sentences.length; i += STEP) {
    const window = sentences.slice(i, i + WINDOW);
    const text = window.join(' ').trim();
    if (text.length < 60) continue;

    const startOffset = sentenceOffsets[i] ?? 0;
    const page = pageForOffset(startOffset);
    const excerpt = text.length > 120 ? text.slice(0, 120) + '…' : text;

    chunks.push({
      text,
      machineId,
      source: { title: manualTitle, page, excerpt }
    });
  }

  return chunks;
}

// ── Cohere Embeddings ─────────────────────────────────────────────────────────

async function embedTexts(texts, inputType) {
  const response = await fetch(COHERE_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      texts,
      model: 'embed-english-v3.0',
      input_type: inputType,
      embedding_types: ['float']
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cohere embed error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.embeddings.float; // array of float arrays
}

async function embedInBatches(texts, inputType) {
  const allVectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedTexts(batch, inputType);
    for (const v of vectors) {
      allVectors.push(new Float32Array(v));
    }
  }
  return allVectors;
}

// ── localStorage Cache ────────────────────────────────────────────────────────

function cacheKey(machineId) {
  return `${CACHE_VERSION}_machine${machineId}`;
}

function loadFromCache(machineId) {
  try {
    const raw = localStorage.getItem(cacheKey(machineId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.chunks || !parsed.embeddings) return null;
    // Restore plain arrays back to Float32Array
    const embeddings = parsed.embeddings.map(v => new Float32Array(v));
    return { chunks: parsed.chunks, embeddings };
  } catch {
    return null;
  }
}

function saveToCache(machineId, chunks, embeddings) {
  try {
    // Convert Float32Array → plain array for JSON serialisation
    const serialisable = embeddings.map(v => Array.from(v));
    localStorage.setItem(cacheKey(machineId), JSON.stringify({ chunks, embeddings: serialisable }));
  } catch (e) {
    // QuotaExceededError — skip silently, pipeline still works
    console.warn('Visora: could not cache embeddings in localStorage:', e.name);
  }
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function retrieveTopK(queryVec, embeddings, chunks) {
  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryVec, embeddings[i])
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter(r => r.score >= SIMILARITY_THRESHOLD)
    .slice(0, TOP_K);
}

// ── Groq Generation ───────────────────────────────────────────────────────────

async function callGroq(userQuery, topChunks) {
  const excerptBlock = topChunks
    .map(r => `[Page ${r.chunk.source.page}] ${r.chunk.text}`)
    .join('\n---\n');

  const userMessage =
    `Manual excerpts:\n---\n${excerptBlock}\n---\n\nQuestion: ${userQuery}`;

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a specialized maintenance assistant for industrial machinery at a manufacturing facility. ' +
            'Answer ONLY based on the manual excerpts provided in the user message. Do not use outside knowledge. ' +
            'If the excerpts do not contain enough information, say so honestly. ' +
            'Be concise and practical. Use numbered steps when describing procedures. ' +
            'Do not refer to yourself as an AI or mention "the context" — answer directly as a knowledgeable technician would.'
        },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 512
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── Primary Entry Point ───────────────────────────────────────────────────────

async function queryRAG(machineId, userQuery) {
  // Machines without a manual
  if (!MANUAL_MAP[machineId]) {
    return {
      answer: "I don't have a manual loaded for this machine yet. I can only answer questions about the CNC Milling Machine and the Conveyor Belt System.",
      citations: []
    };
  }

  try {
    const { path: pdfPath, title: manualTitle } = MANUAL_MAP[machineId];

    // Load from cache or build fresh
    let chunks, embeddings;
    const cached = loadFromCache(machineId);
    if (cached) {
      ({ chunks, embeddings } = cached);
    } else {
      const pageTexts = await loadAndParsePDF(pdfPath);
      chunks     = chunkPageTexts(pageTexts, machineId, manualTitle);
      embeddings = await embedInBatches(chunks.map(c => c.text), 'search_document');
      saveToCache(machineId, chunks, embeddings);
    }

    // Embed the user query
    const queryVectors = await embedInBatches([userQuery], 'search_query');
    const queryVec     = queryVectors[0];

    // Retrieve relevant chunks
    const topResults = retrieveTopK(queryVec, embeddings, chunks);
    if (topResults.length === 0) {
      return {
        answer: "I couldn't find relevant information about that in this machine's manual.",
        citations: []
      };
    }

    // Generate answer
    const answer = await callGroq(userQuery, topResults);

    return {
      answer,
      citations: topResults.map(r => r.chunk.source)
    };

  } catch (err) {
    console.error('Visora RAG error:', err);

    if (err.message.includes('PDF.js not loaded')) {
      return { answer: "Could not load the manual — PDF reader failed to initialise. Please refresh the page.", citations: [] };
    }
    if (err.message.startsWith('Cohere embed error (401)')) {
      return { answer: "Embedding API error — invalid API key. Please check the Cohere key in rag.js.", citations: [] };
    }
    if (err.message.startsWith('Cohere embed error (429)')) {
      return { answer: "Embedding API rate limit hit. Please wait a moment and try again.", citations: [] };
    }
    if (err.message.startsWith('Cohere embed error')) {
      return { answer: `Embedding service error: ${err.message}`, citations: [] };
    }
    if (err.message.startsWith('Groq error (401)')) {
      return { answer: "AI service error — invalid API key. Please check the Groq key in rag.js.", citations: [] };
    }
    if (err.message.startsWith('Groq error')) {
      return { answer: `AI service error: ${err.message}`, citations: [] };
    }
    if (err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('networkerror')) {
      return { answer: "Network error — please check your internet connection and try again.", citations: [] };
    }
    if (err.message.toLowerCase().includes('pdf')) {
      return { answer: "Could not load the manual PDF. Make sure you're running the app through a local server (e.g. python -m http.server 8000).", citations: [] };
    }

    return { answer: "Something went wrong. Please try again.", citations: [] };
  }
}
