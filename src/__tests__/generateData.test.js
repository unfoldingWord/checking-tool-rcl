/* eslint-env jest */
import { describe, expect, test } from '@jest/globals'
import path from 'path'
import fs from 'fs-extra'
import { getAlignedGLText, getPhraseFromTw, parseTwToIndex } from '../helpers/translationHelps/twArticleHelpers'
import { readHelpsFolder, readTextFile } from '../helpers/fileHelpers'
import { groupDataHelpers, usfmHelpers } from 'word-aligner-lib'
import { getVerseString } from '../helpers/tsv-groupdata-parser/verseHelpers'
import Lexer from 'wordmap-lexer'
import { normalizer } from 'string-punctuation-tokenizer'

jest.unmock('fs-extra');

describe.skip('read enGlBible data', () => {
  test(`read enGlBible.json`, () => {
    const filePath = path.join(__dirname, 'fixtures', 'bibles', '1jn', 'enGlBible.json')
    const bibleData = fs.readJsonSync(filePath)
    expect(bibleData).toBeTruthy()
    expect(Array.isArray(bibleData['1']['1'].verseObjects)).toBe(true)
  });

  test(`read twl_tit.check`, () => {
    const filePath = path.join(__dirname, 'fixtures', 'checks', 'twl_tit.check')
    const checkData = fs.readJsonSync(filePath)
    expect(checkData).toBeTruthy()
    expect(checkData.kt).toBeTruthy()
    expect(checkData.kt.groups).toBeTruthy()
    expect(checkData.names).toBeTruthy()
    expect(checkData.other).toBeTruthy()

    const aptGroup = checkData.kt.groups.apostle
    expect(Array.isArray(aptGroup)).toBe(true)
    expect(aptGroup.length).toBeGreaterThan(0)
    expect(aptGroup[0].contextId).toBeTruthy()
    expect(aptGroup[0].contextId.reference.bookId).toEqual('tit')
  });
})

////////////////////////////////
// used for developing AI integration
////////////////////////////////

describe('LM Studio integration', () => {
  test.skip(`query LM Studio with a text prompt`, async () => {
    console.log('testing')
    const answer = await queryLmStudio('What is the capital of France?');
    expect(answer).toBeTruthy();
    console.log('LM Studio response:', answer);
  });

  test.skip(`generate gl checking data`, () => {
    const filePath = "/Users/blm0/translationCore/resources/en/translationHelps/translationWordsLinks/v89_unfoldingWord"
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const langId = 'en';

    // const books = ['1co', 'heb', '1th']
    // const books = ['est', 'jon', 'rut']
    const books = ['eph', '1co', 'heb']
    for (const bookId of books) {
      const bookChecks = readHelpsFolder(filePath, bookId)
      expect(bookChecks)
      const savePath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
      fs.outputJsonSync(savePath, bookChecks, { spaces: 2 });
    }
  });

  test(`test selection prediction for tw`, async () => {
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const langId = 'en';
    const bookId = 'eph';
    const tWord = 'church'
    const category = 'kt'

    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();
    const tWordCategoryData = bookChecks[category]?.groups?.[tWord];
    const selectedCheck = tWordCategoryData?.[0];
    const contextId = selectedCheck?.contextId;
    const reference = contextId?.reference;
    const glQuote = contextId?.glQuote;

    const selectionDataPath = path.join(outputFolder, tWord + '_' +getCheckDataFilename(langId, bookId))
    const selectionsForTWords =  fs.readJsonSync(selectionDataPath)

    const targetLangCode = `es-419`;
    const targetBookName = 'es-419_tpl_eph_book.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()

    if (reference && (glQuote)) {
      const ref = `${reference?.chapter}:${reference?.verse}`
      const verseText = getVerseString(targetBookChapters, ref);
      const wordList = getWordList(verseText)
      const translationOptions = await getBestTWordSelectionWithConfidence(wordList, targetLangCode, glQuote, langId, selectionsForTWords)
      console.log(translationOptions)
    }
  });

  test.skip(`generate selection test data for tw`, () => {
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const langId = 'en';
    const bookId = 'eph';
    const tWord = 'church'

    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();

    const targetBookName = 'es-419_tpl_eph_book.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()

    const selectionWord = bookChecks?.kt?.groups?.[tWord];
    expect(selectionWord).toBeTruthy();
    const selectionsForWord = {}
    const selections = selectionWord
    for (const item of selections) {
      const glQuote = item?.contextId?.glQuote;
      const selectionsForItem = item?.selections
      if (glQuote && selectionsForItem) {
        const selectedText = selectionsForItem?.map(word => word?.text)?.join(' ')

        let glQuoteMatches = selectionsForWord[glQuote]
        if (!glQuoteMatches) {
          glQuoteMatches = {}
          selectionsForWord[glQuote] = glQuoteMatches
        }
        let selectedTextCount = glQuoteMatches[selectedText]
        if (!selectedTextCount) {
          glQuoteMatches[selectedText] = 1
        } else {
          glQuoteMatches[selectedText]++
        }
      }
    }
    console.log('selectionsForWord', selectionsForWord)
    const selectionDataPath = path.join(outputFolder, tWord + '_' +getCheckDataFilename(langId, bookId))
    fs.outputJsonSync(selectionDataPath, selectionsForWord, { spaces: 2 })
  });

  test(`generate AI tw selections`, async () => {
    let count = 0;
    let successes = 0;
    const checkingDataFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const langId = 'en';
    const bookId = 'eph'
    const targetLangCode = `es-419`;
    const targetBookName = 'es-419_tpl_eph_book.usfm'
    const checkingDataPath = path.join(checkingDataFolder, getCheckDataFilename(langId, bookId))
    const bibleData = fs.readJsonSync(checkingDataPath)
    expect(bibleData).toBeTruthy()
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()

    for (const category of ['kt', 'names', 'other']) {
      const categoryData = bibleData[category]?.groups;
      expect(categoryData).toBeTruthy()
      if (categoryData) {
        const groupIds = Object.keys(categoryData);
        expect(groupIds.length).toBeGreaterThan(0)
        for (const groupId of groupIds) {
          const group = categoryData[groupId];
          expect(group).toBeTruthy();
          for (const check of group) {
            expect(check).toBeTruthy();
            const contextId = check?.contextId;
            const reference = contextId?.reference;
            const glQuote = contextId?.glQuote;
            if (reference && (glQuote && !check.selections)) {
              const ref = `${reference?.chapter}:${reference?.verse}`
              const verseText = getVerseString(targetBookChapters, ref);
              expect(verseText).toBeTruthy()
              const wordList = getWordList(verseText)
              console.log(`success/count ${successes}/${++count} translating '${glQuote}' from: ${wordList.join(' ')}`)
              const bestMatches = await translatePhraseWithConfidence(wordList, targetLangCode, glQuote, langId)
              let bestAnswer = bestMatches[0]
              for (let i = 1; i < bestMatches.length; i++) {
                if (bestMatches[i]?.confidence > bestAnswer?.confidence) {
                  bestAnswer = bestMatches[i];
                }
              }
              if (bestAnswer?.confidence) {
                successes++;
                check.selections = bestAnswer.selections
                check.confidence = bestAnswer.confidence
                console.log(`count ${count} best match`, bestAnswer)
                fs.outputJsonSync(checkingDataPath, bibleData, { spaces: 2 });
              }
            }
          }
        }
      }
    }

  }, 8000000);

  test.skip(`add quotes to gl checking data`, () => {
    const langId = 'en';
    const bookId = 'heb'
    const folderPath = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const checkingDataPath = path.join(folderPath, getCheckDataFilename(langId, bookId))
    const bibleData = fs.readJsonSync(checkingDataPath)
    expect(bibleData).toBeTruthy()

    const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
    const alignedGlBible = readHelpsFolder(enUltFolder)

    const ktGroups = bibleData?.kt?.groups || [];
    for (const key of Object.keys(ktGroups)) {
      const group = ktGroups[key]
      if (group?.length) {
        for (const item of group) {
          const contextId1 = item?.contextId
          const glQuote = contextId1?.glQuote
          const reference = contextId1?.reference;
          const bookId = reference?.bookId;
          if (contextId1.quoteString && bookId) {
            if (!glQuote) {
              const alignedGlBook = alignedGlBible[bookId]
              // need quote
              let glText = getAlignedGLText(alignedGlBook, contextId1)
              console.log(glText);
              if (glText) {
                glText = removePunctuation(glText)
                contextId1.glQuote = glText;
              }
            } else {
              console.log(`already have glQuote '${glQuote}'`)
              const cleanedQuote = cleanQuote(glQuote)
              const cleanedQuote2 = cleanQuote2(glQuote)
              if ((cleanedQuote2 !== cleanedQuote)) {
                console.log(`cleaning differs '${cleanedQuote}' with '${cleanedQuote2}'`)
              }
              if ((cleanedQuote !== glQuote)) {
                console.log(`replacing '${glQuote}' with '${cleanedQuote}'`)
                contextId1.glQuote = cleanedQuote
              }
            }
          }
        }

        // update data
        fs.outputJsonSync(checkingDataPath, bibleData, { spaces: 2 });
      }
    }
  });

  test.skip(`test AI tw selection`, async () => {
    console.log('testing')
    const verseContent = `Ahora, él será para ti un restaurador de vida y un sustentador de tu vejez, porque tu nuera que te ama, ella que es mejor para ti que siete hijos, lo ha parido".`
    const targetLangCode = `es-419`;
    const phrase = `your old age`
    const phraseLangCode = `en`;
    const answer = await translatePhraseWithConfidence(verseContent, targetLangCode, phrase, phraseLangCode)
    expect(answer).toBeTruthy();
  }, 80000);
});

////////////////////////////////
// only used for generating data for demo
////////////////////////////////

const enTaFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationAcademy/v89_unfoldingWord'
const enTwlFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationWordsLinks/v89_unfoldingWord'
const enTwFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationWords/v89_unfoldingWord'
const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
const enTnFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationNotes/v89_unfoldingWord'

describe.skip('read resources', () => {
  test(`read tA`, () => {
    const filePath = enTaFolder
    const data = readHelpsFolder(filePath)
    expect(data)
    const groupData = groupDataHelpers.extractGroupData(data)
    expect(Object.keys(groupData).length).toEqual(3)
  });

  test(`read tWl 1jn`, () => {
    const filePath = enTwlFolder
    const data = readHelpsFolder(filePath, '1jn')
    expect(data)
    const groupData = groupDataHelpers.extractGroupData(data)
    expect(Object.keys(groupData).length).toEqual(3)
  });

  test(`read tN 1jn`, () => {
    const filePath = enTnFolder
    const data = readHelpsFolder(filePath, '1jn')
    expect(data)
    const groupData = groupDataHelpers.extractGroupData(data)
    expect(Object.keys(groupData).length).toEqual(3)
  });

  test(`read tW`, () => {
    const filePath = enTwFolder
    const data = readHelpsFolder(filePath)
    const groupsIndex = parseTwToIndex(data)
    expect(data)
    expect(groupsIndex.length > 0)
    const phrase = getPhraseFromTw(data, 'know')
    expect(phrase)
  });

  test(`read en ult`, () => {
    const filePath = enUltFolder
    const data = readHelpsFolder(filePath)
    expect(data)
  });

})


//////////////////////////////
// Testing Support functions
//////////////////////////////

/**
 * Sends a text query to a locally running LM Studio server and returns the model's response text.
 * LM Studio exposes an OpenAI-compatible API (chat completions endpoint) once
 * "Local Server" is started from the LM Studio app (default port 1234).
 *
 * @param {string} query - the text prompt/question to send to the model
 * @param {object} [options] - optional overrides
 * @param {string} [options.baseUrl='http://localhost:1234'] - base URL of the LM Studio server
 * @param {string} [options.model='local-model'] - model identifier as loaded in LM Studio
 * @param {number} [options.temperature=0.7] - sampling temperature (0.0-1.0)
 * @param {number} [options.maxTokens=2048] - max tokens to generate in the response
 * @param {boolean} [options.enable_thinking=false] - whether to enable thinking mode in chat template
 * @returns {Promise<string>} - the text of the model's reply
 * @throws {Error} - if the server is unreachable or returns an error status
 * @example
 * const answer = await queryLmStudio('What is the capital of France?');
 * console.log(answer); // "The capital of France is Paris."
 */
async function queryLmStudio(query, options = {}) {
  const {
    // baseUrl = 'http://localhost:1234',
    baseUrl = 'http://192.168.142.92:1234', // use local server
    model = 'local-model',
    temperature = 0.7,
    maxTokens = 4096,
    enable_thinking = true,
    systemPrompt = 'You are a helpful assistant.',
  } = options;

  if (!enable_thinking) {
    query = query + '\n/no_think'
  }

  const url = `${baseUrl}/v1/chat/completions`;
  const startTime = Date.now();

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true,
        chat_template_kwargs: { enable_thinking },
      }),
    });
  } catch (error) {
    const message1 = `Failed to reach LM Studio server at ${url}: ${error.message}`
    console.error(message1);
    throw new Error(message1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const message = `AI request failed (${response.status}): ${errorText}`
    throw new Error(message);
  }

  // Read the SSE stream and accumulate the full response
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let replyText = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') break;

      try {
        const chunk = JSON.parse(dataStr);
        const delta = chunk?.choices?.[0]?.delta;
        const text = delta?.content || delta?.reasoning_content;

        if (text) {
          replyText += text;
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Query took ${elapsed}s`);

  if (!replyText) {
    const message = `Unexpected LM Studio response shape: received empty content`
    console.log(message)
    throw new Error(message);
  }

  return replyText;
}

/**
 * Builds the AI prompt for matching a gateway language phrase to the
 * best corresponding word(s) in a target-language verse, returning
 * results as CSV rows of `"word:occurrence ..."`,confidence.
 *
 * @param {string} verseContent - the target-language verse text
 * @param {string} targetLangCode - language code of the verse (e.g. 'es-419')
 * @param {string} phrase - gateway language phrase to match (e.g. 'your old age')
 * @param {string} phraseLangCode - language code of the phrase (e.g. 'en')
 * @returns {string} - the fully populated prompt text
 */
export function buildVerseMatchPrompt(verseContent, targetLangCode, phrase, phraseLangCode) {
  const systemPrompt = `You are an expert in biblical linguistics and cross-language word alignment.

Your task is to locate the exact word token(s) in the TARGET VERSE that correspond semantically to the GATEWAY PHRASE.

CRITICAL RULE:
You must NEVER output the gateway phrase, a translation of the gateway phrase, or any word that does not occur exactly in the TARGET VERSE.
The "matched words" field must contain only exact word forms copied from the TARGET VERSE.

Definitions:
- TARGET VERSE: the verse text provided by the user under "Target Verse".
- GATEWAY PHRASE: the source phrase provided by the user under "Gateway Phrase".
- Your answer must identify the TARGET VERSE word(s) that express the meaning of the GATEWAY PHRASE.

Instructions:
1. Treat the TARGET VERSE and GATEWAY PHRASE as literal text, including quotation marks, punctuation, or special characters.
2. Tokenize only the TARGET VERSE into words in reading order.
3. Strip surrounding punctuation from target-verse tokens, including quotation marks, but preserve the original spelling, accents, and casing of each word.
4. Number each target-verse word by its position in the verse, starting at 1.
5. Analyze the semantic meaning of the GATEWAY PHRASE.
6. Find the exact TARGET VERSE word(s) that best correspond to that meaning.
7. The match may be one word or multiple words. Prefer the tightest/closest grouping when equally valid.
8. Format every matched TARGET VERSE word as word:position.
9. If multiple TARGET VERSE words are matched, join them with a single space, for example: tu:23 vejez:24.
10. Before answering, verify that every word in every word:position pair appears exactly as a token in the TARGET VERSE.
11. Before answering, verify that every matched word contains a colon followed by a number.
12. If any proposed matched word comes from the GATEWAY PHRASE instead of the TARGET VERSE, discard it and find the corresponding TARGET VERSE word instead.
13. If more than one plausible matching set of target-verse words exists, output each candidate as its own CSV row, ordered from highest to lowest confidence.
14. "confidence level" is an integer 0-100 reflecting certainty that the match is correct in context.
15. If no reasonable match exists in the TARGET VERSE, output a single row with an empty "matched words" field and confidence level 0.
16. Output ONLY the CSV data, with no header row. No commentary, no markdown fences, no extra text.

Required output format:
"word:position word:position",confidence

Output requirements:
- The first CSV field, "matched words", must contain only exact matches to TARGET VERSE tokens formatted as word:position.
- The colon and numeric position are REQUIRED for every non-empty matched word.
- Do NOT output bare words such as "vejez".
- Do NOT output "word" without ":position".
- Do NOT output the gateway phrase in the "matched words" field.
- Do NOT output an English phrase unless that exact English word appears in the TARGET VERSE.
- Do NOT translate, paraphrase, summarize, or alter target-verse word forms.
- The second CSV field, "confidence level", must be a plain integer with no quotes.
- Wrap only the matched words field in double quotes.
- Do not output a CSV header row.

Correct output example:
If the TARGET VERSE contains:
\`porque tu nuera sustentador de tu vejez\`

And the GATEWAY PHRASE is:
\`your old age\`

A valid answer is:
"tu:6 vejez:7",95

Invalid answers:
"your old age",95
"vejez",95
"tu vejez",95
"tu: vejez:",95
"tu:6 vejez",95
`;

  const input = `Target Verse language: ${targetLangCode}

Target Verse:
\`\`\`
${verseContent}
\`\`\`

Gateway Phrase language: ${phraseLangCode}

Gateway Phrase:
\`\`\`
${phrase}
\`\`\``;

  return { systemPrompt, input };
}

/**
 * Reduces previous-translation data to a compact JSON string holding only the renderings
 * of `glPhrase`, ordered highest count first.
 *
 * Previous translation data is expected to be structured as:
 * ```
 * {
 *   glPhrase: {
 *     targetPhrase: count
 *   }
 * }
 * ```
 * An already-flat `{targetPhrase: count}` map is also accepted. Sending only the current
 * phrase's history keeps the prompt small and stops unrelated phrases from biasing the answer.
 *
 * @param {object} previousTranslationData - prior translation-count object; may be nested
 *   (phrase-keyed) or flat (already filtered to a single phrase's counts)
 * @param {string} glPhrase - gateway-language phrase being translated
 * @returns {string} - compact JSON string of `{targetPhrase: count}` ordered by count descending,
 *   or empty string `''` when there is no history for this phrase
 * @example
 * // Nested structure
 * formatPreviousTranslations(
 *   { "church": { "iglesia": 7, "congregación": 2 } },
 *   "church"
 * )
 * // Returns: '{"iglesia":7,"congregación":2}'
 *
 * // Flat structure (already filtered)
 * formatPreviousTranslations(
 *   { "iglesia": 7, "congregación": 2 },
 *   "church"
 * )
 * // Returns: '{"iglesia":7,"congregación":2}'
 *
 * // No matching phrase
 * formatPreviousTranslations(
 *   { "church": { "iglesia": 7 } },
 *   "temple"
 * )
 * // Returns: ''
 */
function formatPreviousTranslations(previousTranslationData, glPhrase) {
  // Initialize data with empty object if null/undefined
  const data = previousTranslationData || {}

  // Check if data is phrase-keyed (nested structure) by examining if any value is an object
  const isPhraseKeyed = Object.values(data).some(value => value && typeof value === 'object')

  // Default to using data directly as counts map
  let counts = data

  // If data is phrase-keyed, extract the counts for the specific glPhrase
  if (isPhraseKeyed) {
    const keys = Object.keys(data)

    // Find matching key either by exact match or case-insensitive normalized match
    const matchedKey = keys.find(key_ => key_ === glPhrase)
      || keys.find(key_ => normalizer(key_).toLowerCase() === normalizer(glPhrase).toLowerCase())

    if (matchedKey) {
      // Use the counts for the matched key, or empty object if no match found
      counts = (matchedKey && data[matchedKey]) || {}
    }
  }

  // Convert counts map to array of [phrase, count] entries,
  // filter out empty phrases or zero counts,
  // and sort by count descending (strongest evidence first)
  const entries = Object.entries(counts)
    .filter(([phrase, count]) => phrase && count > 0)
    .sort((a, b) => b[1] - a[1])

  // Return JSON string of filtered/sorted entries, or empty string if no entries
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : ''
}

/**
 * Renders the verse as `word:position` tokens, which is exactly the format the answer
 * must use. Handing the AI the positions removes the need for it to count words - which
 * small models do unreliably - so producing the answer becomes a copy operation.
 *
 * `verseContent` is `wordList.join(' ')`, so splitting on whitespace recovers the same
 * tokens and the same 1-based indexes that `parseResponseRow` resolves against `wordList`.
 *
 * @param {string} verseContent - the target-language verse text without punctuation
 * @returns {string} - e.g. `para:1 la:2 iglesia:3 de:4 Éfeso:5`
 */
function formatNumberedVerse(verseContent) {
  return (verseContent || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => `${word}:${index + 1}`)
    .join(' ')
}

/**
 * Builds the AI prompt for selecting the best target-language translation option(s)
 * for a gateway-language phrase, using only words found in the target-language verse.
 *
 * The system prompt holds no per-call data, so its text is identical on every call and
 * the LM Studio server can reuse its cached prompt prefix across the whole run.
 *
 * @param {string} verseContent - the target-language verse text without punctuation
 * @param {string} targetLangCode - language code of the target words, e.g. 'es-419'
 * @param {string} glPhrase - gateway-language phrase to translate, e.g. 'church'
 * @param {string} glLangCode - language code of the gateway phrase, e.g. 'en'
 * @param {object} previousTranslationData - prior translation-count object; only the
 *   entries for `glPhrase` are sent to the AI
 * @returns {{systemPrompt: string, input: string}} - the fully populated prompt data
 */
export function buildTranslationOptionsPrompt(
  verseContent,
  targetLangCode,
  glPhrase,
  glLangCode,
  previousTranslationData = {},
) {
  const systemPrompt = `You are an expert in biblical linguistics and cross-language translation consistency.

Pick the word(s) of the TARGET VERSE that best translate the GATEWAY PHRASE.

The TARGET VERSE is given as word:position tokens, in reading order, already numbered from 1.

Rules:
1. Use only tokens of the TARGET VERSE. Never invent, translate, inflect, or re-spell a word, and never output the gateway phrase itself.
2. Copy each token exactly as the TARGET VERSE gives it: the word with its accents and casing, then its number.
3. The numbers are already correct, so never recount or renumber them. The colon and number are REQUIRED on every word you output.
4. PREVIOUS TRANSLATIONS are earlier renderings of this GATEWAY PHRASE with usage counts. Prefer the highest-count rendering whose words all occur in the TARGET VERSE; discard any rendering that uses words the TARGET VERSE does not have.
5. Keep the words in TARGET VERSE order, and prefer the shortest option that carries the meaning.
6. Output at most 3 rows, one per plausible option, highest confidence first. "confidence" is an integer 0-100.
7. If no words of the TARGET VERSE can express the phrase, output exactly: "",0
8. Output only CSV rows: no header, no explanation, no markdown fences.

Required output format:
"word:position word:position",confidence

Example
GATEWAY PHRASE: church
TARGET VERSE: para:1 la:2 iglesia:3 de:4 Éfeso:5
PREVIOUS TRANSLATIONS: {"iglesia":7,"congregación":2}
Valid:
"iglesia:3",98
"la:2 iglesia:3",70

Invalid: "church",98 | "congregación",90 | "iglesias",85 | iglesia,98 | "iglesia",98 | "la iglesia:3",70 | "iglesia:1",98
`;

  const previousTranslations = formatPreviousTranslations(previousTranslationData, glPhrase)

  // one labeled field per line, in the same order as the example above
  const lines = [
    `GATEWAY PHRASE (${glLangCode}): ${glPhrase}`,
    `TARGET VERSE (${targetLangCode}): ${formatNumberedVerse(verseContent)}`,
  ]

  if (previousTranslations) {
    lines.push(`PREVIOUS TRANSLATIONS: ${previousTranslations}`)
  }

  return { systemPrompt, input: lines.join('\n') };
}

async function getBestTWordSelectionWithConfidence(wordList, targetLangCode, glPhrase, glLangCode, previousTranslationData, enable_thinking = false) {
  let selectionWords = []
  const { systemPrompt, input } = buildTranslationOptionsPrompt(
    wordList.join(' '),
    targetLangCode,
    glPhrase,
    glLangCode,
    previousTranslationData,
  )
  let success = true;
  let answer = '';
  let responses = null
  try {
    const options = { systemPrompt, enable_thinking }
    answer = await queryLmStudio(input, options)
    responses = answer.split('\n')
    const length = responses.length
    let start = 0
    if (length > 5) { // if the response was verbose, like in thinking mode, skip ahead to csv line
      for (let i = start; i < length; i++) {
        const response = responses[i]
        const parts = response?.split(',')
        if (parts?.length == 2) {
          let confidence = removeQuotes(parts[1])
          confidence = parseInt(confidence, 10)
          if (!Number.isNaN(confidence)) {
            start = i
            break
          }
        }
      }
    }
    for (let i = start; i < length; i++) {
      const response = responses[i]
      if (response) {
        if (!response.includes('\`\`\`')) {
          const success_ = parseResponseRow(response, wordList, answer, selectionWords)
          if (!success_) {
            success = false
          }
        }
      }
    }
  } catch (e) {
    console.log('query failed',e)
    success = false;
  }

  if (!success) {
    if (!answer.includes(',')) {
      //handle case where AI did not use CSV format, by fields are separated by newlines
      if (responses?.length === 2) {
        selectionWords = []
        const response = answer.replace('\n', ',')
        success = parseResponseRow(response, wordList, answer, selectionWords)
      }
    }
  }

  // remove duplicates from selections
  const seen = new Set()
  for (const option of selectionWords) {
    const uniqueSelections = []
    for (const word of option.selections) {
      if (word.occurrence && word.text) {
        const key = word.text + ':' + word.occurrence
        if (!seen.has(key)) {
          seen.add(key)
          uniqueSelections.push(word)
        }
      } else {
        console.log('invalid word or occurrence found', word);
        success = false
      }
    }
    if (option.selections.length != uniqueSelections.length) { // if changed then update
      option.selections = uniqueSelections
    }
  }

  if (success) {
    console.log('AI response:', {
      wordList: formatNumberedVerse(wordList.join(' ')),
      glPhrase,
      answer,
      matches: selectionWords.length,
      selectionWords
    })
    return selectionWords
  } else {
    console.log('AI response ERROR:', {
      wordList: formatNumberedVerse(wordList.join(' ')),
      glPhrase,
      answer,
      matches: selectionWords.length
    })
  }
  return []
}

function removeQuotes(value) {
  return value?.trim().replace(/^"|"$/g, '') || ''
}

function findOccurrenceForPos(position, wordList, text) {
  let occurrence = 0
  for (let i = 0; i < position; i++) {
    if (wordList[i] === text) {
      occurrence++
    }
  }
  occurrence = occurrence || 1 // fallback if AI got mixed up
  return occurrence
}

function parseResponseRow(response, wordList, answer, selectionWords) {
  let error = false;
  let missingPos = false;
  const rowParts = response.split(',')
  if (rowParts.length === 2) {
    let [phraseTranslation, confidence] = rowParts
    confidence = confidence ? parseInt(removeQuotes(confidence), 10) : 0
    phraseTranslation = removeQuotes(phraseTranslation)
    const selections = []
    const words = phraseTranslation.split(' ')
    for (const word of words) {
      let selectionFound = null
      const wordParts = word.split(':')
      let [text, position] = wordParts
      text = normalizer(text)
      if (wordParts.length === 2) {
        position = parseInt(position, 10)
        selectionFound = { text, position }
      } else if (wordParts.length === 1) {
        position = -1
        selectionFound = { text, position }
        missingPos = true
      } else {
        // invalid number of columns
        error = true
      }

      if (selectionFound) {
        selections.push(selectionFound)
      } else {
        console.log('invalid response', answer)
        error = true
      }
    }

    if (selections.length) {
      if (missingPos && !error) { // fill in missing positions
        missingPos = false // clear before second pass
        for (let i = 0; i < selections.length; i++) {
          const selection = selections[i]
          if (selection.position < 0) {
            // look ahead for last of contiguous words
            let startPos = 0
            let lastOfContig = 0
            for (let j = i + 1; j < selections.length; j++) {
              const selection_ = selections[j]
              if (selection_.position >= 0) {
                startPos = selection_.position
                lastOfContig = j
                break;
              }
            }
            if (startPos) {
              for (let j = i; j <= lastOfContig; j++) {
                const selection_ = selections[j]
                selection_.position = startPos++
              }
            } else {
              error = true
              break;
            }
          }
        }
      }

      // convert positions to occurrences
      for (const selection of selections) {
        let found = false
        if (selection.position > 0) {
          let wordlistWord = wordList[selection.position - 1]
          if (selection.text !== normalizer(wordlistWord)) {
            wordlistWord = wordList[selection.position - 2]
            if (selection.text === normalizer(wordlistWord)) { // try offset index
              selection.position--
              found = true
            }
          } else {
            found = true
          }
          if (found) {
            const occurrence = findOccurrenceForPos(selection.position, wordList, selection.text)
            if (occurrence > 0) {
              delete selection.position
              selection.occurrence = occurrence
            }
          } else if (selection.position > 0) {
            // see if AI sent occurrence rather than position
            const matchOccurrence = selection.position
            let occurrence = 0
            for (let i = 0; i < wordList.length; i++) {
              const word = wordList[i]
              if (selection.text === normalizer(word)) {
                if (++occurrence >= matchOccurrence) {
                  found = true
                  delete selection.position
                  selection.occurrence = i + 1
                  break
                }
              }
            }
          }

          if (!found) {
              console.log(`word ${selection.text} not found at ${selection.position} in wordList`, wordList)
          }
        }
      }

      selectionWords.push({ selections, confidence })
    } else {
      error = true
    }
    console.log('translation', { translation: phraseTranslation, confidence })
  } else {
    console.log("row is not in csv format", response)
    error = true
  }
  return !error
}

/**
 * Translates a gateway language phrase to target-language word(s) within a verse
 * using an AI model, returning an array of selection objects with confidence scores.
 *
 * @param {Array<string>} wordList - array of words from the target-language verse to search within
 * @param {string} targetLangCode - language code of the verse (e.g. 'es-419')
 * @param {string} phrase - gateway language phrase to match (e.g. 'your old age')
 * @param {string} phraseLangCode - language code of the phrase (e.g. 'en')
 * @returns {Promise<Array<{selections: Array<{text: string, position: number}>, confidence: number}>>} - array of selection objects, each containing:
 *   - selections: array of {text, position} objects representing matched words, where text is the word and position is its occurrence index in the verse
 *   - confidence: integer 0-100 indicating match certainty
 * @throws {Error} - if the AI query fails or returns invalid data
 * @example
 * const wordList = ['Ahora', 'él', 'será', 'para', 'ti', 'un', 'restaurador', 'de', 'vida'];
 * const result = await translatePhraseWithConfidence(
 *   wordList,
 *   'es-419',
 *   'your old age',
 *   'en'
 * );
 * // Returns: [
 * //   { selections: [{text: 'tu', position: 1}, {text: 'vejez', position: 1}], confidence: 85 },
 * //   { selections: [{text: 'vejez', position: 1}], confidence: 70 }
 * // ]
 */
async function translatePhraseWithConfidence(wordList, targetLangCode, phrase, phraseLangCode) {
  let selectionWords = []
  const verseWords = wordList.join(' ')
  const { systemPrompt, input } = buildVerseMatchPrompt(verseWords, targetLangCode, phrase, phraseLangCode)
  let success = true;
  let answer = '';
  let responses = null
  try {
    answer = await queryLmStudio(input, { systemPrompt })
    responses = answer.split('\n')
    const length = responses.length
    let start = 0
    if (length > 5) { // if the response was verbose, like in thinking mode, skip ahead to csv line
      for (let i = start; i < length; i++) {
        const response = responses[i]
        const parts = response?.split(',')
        if (parts?.length == 2) {
          let confidence = removeQuotes(parts[1])
          confidence = parseInt(confidence, 10)
          if (!Number.isNaN(confidence)) {
            start = i
            break
          }
        }
      }
    }
    for (let i = start; i < length; i++) {
      const response = responses[i]
      if (response) {
        if (!response.includes('\`\`\`')) {
          const success_ = parseResponseRow(response, wordList, answer, selectionWords)
          if (!success_) {
            success = false
          }
        }
      }
    }
  } catch (e) {
    console.log('query failed',e)
    success = false;
  }

  if (!success) {
    if (!answer.includes(',')) {
      //handle case where AI did not use CSV format, by fields are separated by newlines
      if (responses?.length === 2) {
        selectionWords = []
        const response = answer.replace('\n', ',')
        success = parseResponseRow(response, wordList, answer, selectionWords)
      }
    }
  }

  // remove duplicates from selections
  const seen = new Set()
  for (const option of selectionWords) {
    const uniqueSelections = []
    for (const word of option.selections) {
      if (word.occurrence && word.text) {
        const key = word.text + ':' + word.occurrence
        if (!seen.has(key)) {
          seen.add(key)
          uniqueSelections.push(word)
        }
      } else {
        console.log('invalid word or occurrence found', word);
        success = false
      }
    }
    if (option.selections.length != uniqueSelections.length) { // if changed then update
      option.selections = uniqueSelections
    }
  }

  if (success) {
    console.log('AI response:', { verseWords, phrase, answer, matches: selectionWords.length })
    return selectionWords
  } else {
    console.log('AI response ERROR:', { verseWords, phrase, answer, matches: selectionWords.length })
  }
  return []
}

function getCheckDataFilename(langId, bookId) {
  return langId + '_' + bookId + '.json'
}

function getWordList(verseText) {
  const tokenList = Lexer.tokenize(verseText)
  const wordList = tokenList.map(token => (token.text))
  return wordList
}

function removePunctuation(glText) {
  const wordList = getWordList(glText)
  return wordList.join(' ')
}

function cleanQuote(glQuote) {
  const replaceChars = ['{', '}', '.', ',', ';', ':', "\""];
  let cleanedQuote = glQuote

  // remove any characters in replaceChars
  for (const char of replaceChars) {
    cleanedQuote = cleanedQuote.split(char).join('')
  }
  return cleanedQuote
}

function cleanQuote2(glQuote) {
  const AMPERSAND = ' & '
  const ELLIPSIS = '\u2026'
  let cleanedString = ''
  const parts = glQuote.split(ELLIPSIS)
  for (const part of parts) {
    let cleanedString2 = ''
    const parts2 = part.split(AMPERSAND)
    for (const part2 of parts2) {
      const cleanedPart2 = removePunctuation(part2)
      if (cleanedString2) {
        cleanedString2 += AMPERSAND
      }
      cleanedString2 += cleanedPart2
    }
    if (cleanedString) {
      cleanedString += ELLIPSIS
    }
    cleanedString += cleanedString2
  }
  return cleanedString
}
