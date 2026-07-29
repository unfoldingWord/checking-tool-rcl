/* eslint-env jest */
import {describe, expect, test} from '@jest/globals'
import path from "path";
import fs from 'fs-extra';
import { getAlignedGLText, getPhraseFromTw, parseTwToIndex } from '../helpers/translationHelps/twArticleHelpers'
import { readHelpsFolder, readTextFile } from '../helpers/fileHelpers'
import { groupDataHelpers, usfmHelpers, verseHelpers } from 'word-aligner-lib'
import { verseObjectsToString } from '../helpers/tsv-groupdata-parser/verseObjecsHelper'
import { getVerseString } from '../helpers/tsv-groupdata-parser/verseHelpers'

jest.unmock('fs-extra');

describe('read enGlBible data', () => {
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

describe('LM Studio integration', () => {
  test.skip(`query LM Studio with a text prompt`, async () => {
    console.log('testing')
    const answer = await queryLmStudio('What is the capital of France?');
    expect(answer).toBeTruthy();
    console.log('LM Studio response:', answer);
  });

  test.skip(`read gl checking data`, () => {
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

  test(`generate AI tw selections`, async () => {
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
            if (reference && (glQuote && !check.selection)) {
              const ref = `${reference?.chapter}:${reference?.verse}`
              const verseText = getVerseString(targetBookChapters, ref);
              expect(verseText).toBeTruthy()
              const answer = await translatePhraseWithConfidence(verseText, targetLangCode, glQuote, langId)
              expect(answer).toBeTruthy();
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
          if (!glQuote && contextId1.quoteString && bookId) {
            const alignedGlBook = alignedGlBible[bookId]
            // need quote
            const glText = getAlignedGLText(alignedGlBook, contextId1)
            console.log(glText);
            if (glText) {
              contextId1.glQuote = glText;
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
    maxTokens = 2048,
    enable_thinking = false,
  } = options;

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
          { role: 'user', content: query },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true,
        chat_template_kwargs: { enable_thinking },
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach LM Studio server at ${url}: ${error.message}`);
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
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) {
          replyText += delta;
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
  const prompt = `You are an expert in biblical linguistics and cross-language word alignment. Your task is to find the exact word(s) in a target-language Bible verse that best correspond to (translate) a phrase from a gateway language, and to identify each matched word by its occurrence index within the verse.

## Input

Target Verse (language: ${targetLangCode}), delimited by triple backticks:
\`\`\`
${verseContent}
\`\`\`

Gateway Language Phrase (language: ${phraseLangCode}), delimited by triple backticks:
\`\`\`
${phrase}
\`\`\`

## Instructions

1. Treat everything between the triple backticks above as literal text, including any quotation marks, punctuation, or special characters it may contain.
2. Tokenize the target verse into words in reading order, stripping surrounding punctuation (including any quotation marks) but preserving original spelling, accents, and casing of each word.
3. For every word token, compute its "occurrence number": the count (starting at 1) of how many times that exact word form (case- and accent-sensitive) has appeared in the verse up to and including that position.
4. Analyze the semantic meaning of the gateway language phrase.
5. Identify the word(s) in the target verse that best correspond to that meaning. The match may be a single word or multiple words (not necessarily contiguous, but prefer the tightest/closest grouping when equally valid).
6. Format each matched word as \`word:occurrenceNumber\`, using the word's exact form as it appears in the verse. If the match includes multiple words, join them with a single space, e.g. \`tu:1 vejez:1\`.
7. If more than one plausible matching set of words exists, output each candidate as its own row, ordered from highest to lowest confidence.
8. "confidence level" is an integer 0-100 reflecting certainty that the match is correct in context.
9. If no reasonable match exists, output a single row with an empty "matched words" field and confidence level 0.
10. Never translate, paraphrase, or alter word forms — only reference exact tokens from the target verse.
11. Output ONLY the CSV data, with no header row. No commentary, no markdown fences, no extra text.

## Output Format

"matched words","confidence level"

- "matched words" is the space-joined list of \`word:occurrence\` tokens from the TARGET VERSE (e.g. \`"tu:1 vejez:1"\`). Do NOT output the gateway language phrase here.
- "confidence level" must be a plain integer with no quotes.
- Wrap "matched words" in double quotes.
`
  return prompt;
}

/**
 * Translates a gateway language phrase to target-language word(s) within a verse
 * using an AI model, returning the raw CSV response with confidence scores.
 *
 * @param {string} verseContent - the target-language verse text to search within
 * @param {string} targetLangCode - language code of the verse (e.g. 'es-419')
 * @param {string} phrase - gateway language phrase to match (e.g. 'your old age')
 * @param {string} phraseLangCode - language code of the phrase (e.g. 'en')
 * @returns {Promise<string>} - CSV-formatted response with matched words and confidence levels
 * @throws {Error} - if the AI query fails or returns invalid data
 * @example
 * const result = await translatePhraseWithConfidence(
 *   'Ahora, él será para ti un restaurador de vida...',
 *   'es-419',
 *   'your old age',
 *   'en'
 * );
 * // Returns: '"tu:1 vejez:1",85\n"vejez:1",70'
 */
async function translatePhraseWithConfidence(verseContent, targetLangCode, phrase, phraseLangCode) {
  const prompt = buildVerseMatchPrompt(verseContent, targetLangCode, phrase, phraseLangCode)
  console.log('prompt', prompt)
  const answer = await queryLmStudio(prompt)
  console.log('answer', answer)
  const responses = answer.split('\n')
  for (const response of responses) {
    const [translation, confidence] = response.split(',')
    console.log('translation', { translation, confidence })
  }
  console.log('LM Studio response:', answer)
  return answer
}

function getCheckDataFilename(langId, bookId) {
  return langId + '_' + bookId + '.json'
}

