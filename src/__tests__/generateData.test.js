/* eslint-env jest */
import {describe, expect, test} from '@jest/globals'
import path from "path";
import fs from 'fs-extra';
import { getAlignedGLText, getPhraseFromTw, parseTwToIndex } from '../helpers/translationHelps/twArticleHelpers'
import { readHelpsFolder, readTextFile } from '../helpers/fileHelpers'
import { groupDataHelpers, usfmHelpers, verseHelpers } from 'word-aligner-lib'
import { verseObjectsToString } from '../helpers/tsv-groupdata-parser/verseObjecsHelper'
import { getVerseString } from '../helpers/tsv-groupdata-parser/verseHelpers'
import Lexer from 'wordmap-lexer'
import { normalizer } from 'string-punctuation-tokenizer'

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
    let count = 0;
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
              const tokenList = Lexer.tokenize(verseText);
              const wordList = tokenList.map(token => (token.text))
              const bestMatches = await translatePhraseWithConfidence(wordList, targetLangCode, glQuote, langId)
              let bestAnswer = bestMatches[0]
              for (let i = 1; i < bestMatches.length; i++) {
                if (bestMatches[i]?.confidence > bestAnswer?.confidence) {
                  bestAnswer = bestMatches[i];
                }
              }
              if (bestAnswer?.confidence) {
                check.selections = bestAnswer.selections
                check.confidence = bestAnswer.confidence
                console.log(`count ${++count} best match`, bestAnswer)
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

  // if (!enable_thinking) {
  //   query = query + '\n/no_think'
  // }

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
6. Format each matched word as \`word:position\`, using the word's exact form as it appears in the verse, and position is the number of the word in the verse (the first word is 1). If the match includes multiple words, join them with a single space, e.g. \`tu:1 vejez:1\`.
7. If more than one plausible matching set of words exists, output each candidate as its own row, ordered from highest to lowest confidence.
8. "confidence level" is an integer 0-100 reflecting certainty that the match is correct in context.
9. If no reasonable match exists, output a single row with an empty "matched words" field and confidence level 0.
10. Never translate, paraphrase, or alter word forms — only reference exact tokens from the target verse.
11. Output ONLY the CSV data, with no header row. No commentary, no markdown fences, no extra text.

## Output Format

"matched words","confidence level"

- "matched words" is the space-joined list of \`word:position\` tokens from the TARGET VERSE (e.g. \`"tu:5 vejez:6"\`). Do NOT output the gateway language phrase here.
- "confidence level" must be a plain integer with no quotes.
- Wrap "matched words" in double quotes.
`
  return prompt;
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
          const wordlistWord = wordList[selection.position - 1]
          if (selection.text === normalizer(wordlistWord)) {
            found = true
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
  const prompt = buildVerseMatchPrompt(verseWords, targetLangCode, phrase, phraseLangCode)
  let success = true;
  let answer = '';
  try {
    answer = await queryLmStudio(prompt)
    const responses = answer.split('\n')
    for (const response of responses) {
      if (response) {
        const success_ = parseResponseRow(response, wordList, answer, selectionWords)
        if (!success_) {
          success = false
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

