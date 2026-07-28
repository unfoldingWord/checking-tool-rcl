/* eslint-env jest */
import {describe, expect, test} from '@jest/globals'
import path from "path";
import fs from 'fs-extra';
import { getPhraseFromTw, parseTwToIndex } from '../helpers/translationHelps/twArticleHelpers'
import { readHelpsFolder } from '../helpers/fileHelpers'
import { groupDataHelpers } from 'word-aligner-lib'

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

  test(`test tw selection`, async () => {
    console.log('testing')
    const verseContent = `Ahora, él será para ti un restaurador de vida y un sustentador de tu vejez, porque tu nuera que te ama, ella que es mejor para ti que siete hijos, lo ha parido".`
    const targetLangCode = `es-419`;
    const phrase = `your old age`
    const phraseLangCode = `en`;
    const prompt = buildVerseMatchPrompt(verseContent, targetLangCode, phrase, phraseLangCode)
    console.log('prompt', prompt)
    const answer = await queryLmStudio(prompt);
    console.log('answer', answer)
    expect(answer).toBeTruthy();
    console.log('LM Studio response:', answer);
  }, 20000);
});

////////////////////////////////
// only used for generating data for demo
////////////////////////////////

const enTaFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationAcademy/v79_unfoldingWord'
const enTwlFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationWordsLinks/v79_unfoldingWord'
const enTwFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationWords/v79_unfoldingWord'
const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v79_unfoldingWord'
const enTnFolder = '/Users/blm0/translationCore/resources/en/translationHelps/translationNotes/v79_unfoldingWord'

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
 * @param {number} [options.temperature=0.7] - sampling temperature
 * @param {number} [options.maxTokens=512] - max tokens to generate
 * @returns {Promise<string>} - the text of the model's reply
 */
async function queryLmStudio(query, options = {}) {
  const {
    baseUrl = 'http://localhost:1234',
    model = 'local-model',
    temperature = 0.7,
    maxTokens = 512,
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
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach LM Studio server at ${url}: ${error.message}`);
  }

  const ok = response.ok
  if (!ok) {
    const errorText = await response.text();
    throw new Error(`LM Studio request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Query took ${elapsed}s`);
  const replyText = data?.choices?.[0]?.message?.content;

  if (!replyText) {
    throw new Error(`Unexpected LM Studio response shape: ${JSON.stringify(data)}`);
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
9. If no reasonable match exists, output a single row with an empty "target phrase" and confidence level 0.
10. Never translate, paraphrase, or alter word forms — only reference exact tokens from the target verse.
11. Output ONLY the CSV data, with no header row. No commentary, no markdown fences, no extra text.

## Output Format

"target phrase",confidence level

Wrap "target phrase" in double quotes. If it contains a literal double quote character, escape it by doubling it (i.e. \`""\`), per standard CSV quoting rules. "confidence level" must be a plain integer with no quotes.`
  return prompt;
}
