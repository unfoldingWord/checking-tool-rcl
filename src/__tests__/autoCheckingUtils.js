/* eslint-env jest */
import Lexer from 'wordmap-lexer'
import { normalizer } from 'string-punctuation-tokenizer'

jest.unmock('fs-extra');

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
export async function queryLmStudio(query, options = {}) {
  const {
    // baseUrl = 'http://localhost:1234',
    baseUrl = 'http://192.168.142.81:1234', // use local server
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
 * Normalizes a word for loose comparison. `normalizer` leaves case alone, and matching a
 * rendering against a verse word has to survive that word being capitalized at the start
 * of the verse, so lowercasing is added. Accents stay significant: a rendering differing by
 * an accent is a different word form, and `normalizer` does not fold accents either.
 *
 * @param {string} word
 * @returns {string}
 */
function normalizeForCompare(word) {
  return normalizer(word || '').toLowerCase()
}

/**
 * Reduces previous-translation data to a compact JSON string holding only the renderings
 * of `glPhrase` that can actually be selected from this verse, ordered highest count first.
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
 * @param {string} verseContent - the target-language verse text without punctuation
 * @returns {string} - compact JSON string of `{targetPhrase: count}` ordered by count descending,
 *   or empty string `''` when no usable history remains for this phrase
 * @example
 * // Nested structure; congregación is dropped because the verse does not contain it
 * formatPreviousTranslations(
 *   { "church": { "iglesia": 7, "congregación": 2 } },
 *   "church",
 *   "para la iglesia de Éfeso"
 * )
 * // Returns: '{"iglesia":7}'
 *
 * // Flat structure (already filtered to one phrase)
 * formatPreviousTranslations(
 *   { "de la iglesia": 3, "iglesia": 7 },
 *   "church",
 *   "para la iglesia de Éfeso"
 * )
 * // Returns: '{"iglesia":7,"de la iglesia":3}'
 *
 * // A rendering the verse spells differently is re-spelled to the verse's form
 * formatPreviousTranslations(
 *   { "church": { "Iglesia": 4 } },
 *   "church",
 *   "para la iglesia de Éfeso"
 * )
 * // Returns: '{"iglesia":4}'
 *
 * // No matching phrase, or nothing usable in this verse
 * formatPreviousTranslations(
 *   { "church": { "iglesia": 7 } },
 *   "temple",
 *   "para la iglesia de Éfeso"
 * )
 * // Returns: ''
 */
function formatPreviousTranslations(previousTranslationData, glPhrase, verseContent) {
  const data = previousTranslationData || {}

  // data is phrase-keyed when its values are count maps rather than counts
  const isPhraseKeyed = Object.values(data).some(value => value && typeof value === 'object')

  // Default to using data directly as counts map
  let filteredMatches = data

  // If data is phrase-keyed, extract the counts for the specific glPhrase
  if (isPhraseKeyed) {
    const keys = Object.keys(data)
    const counts = []

    // match the gateway phrase exactly, else accent- and case-insensitively
    let matchedGL = keys.find(key_ => key_ === glPhrase)
      || keys.find(key_ => normalizer(key_).toLowerCase() === normalizer(glPhrase).toLowerCase())

    const wordList = verseContent.split(' ')
    if (matchedGL) {
      const translations = Object.keys(data[matchedGL])
      const normalizedWordList = wordList.map(word => normalizeForCompare(word))
      const filteredMatchesEntries = []

      for (const translation of translations) {
        const translationWords = translation.split(/\s+/).filter(Boolean)
        const matchedWords = translationWords.map(word => {
          const normalizedWord = normalizeForCompare(word)
          const matchIndex = normalizedWordList.indexOf(normalizedWord)
          return matchIndex >= 0 ? wordList[matchIndex] : null
        })
        const exactMatch = matchedWords.every(Boolean)

        if (exactMatch) {
          filteredMatchesEntries.push([matchedWords.join(' '), data[matchedGL][translation]])
        }
      }

      if (filteredMatchesEntries.length) {
        // Use only translations whose words are all present in this verse
        filteredMatches = Object.fromEntries(filteredMatchesEntries)
      }
    }
  }

  // Convert counts map to array of [phrase, count] entries,
  // filter out empty phrases or zero counts,
  // and sort by count descending (strongest evidence first)
  const entries = Object.entries(filteredMatches)
    .filter(([phrase, count]) => phrase && count > 0)
    .sort((a, b) => b[1] - a[1]);

  // Return JSON string of filtered/sorted entries, or empty string if no entries
  const resultsJson = entries.length ? JSON.stringify(Object.fromEntries(entries)) : ''
  return resultsJson;
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

The TARGET VERSE is given as plain words in reading order.

Rules:
1. Use only words of the TARGET VERSE. Never invent, translate, inflect, or re-spell a word, and never output the gateway phrase itself.
2. Copy each word exactly as the TARGET VERSE spells it, keeping its accents and its casing.
3. Output the words on their own, separated by single spaces. Never add a number, a colon, or any punctuation to a word.
4. PREVIOUS TRANSLATIONS are earlier renderings of this GATEWAY PHRASE with usage counts. Prefer the highest-count rendering whose words all occur in the TARGET VERSE; discard any rendering that uses words the TARGET VERSE does not have.
5. Keep the words in TARGET VERSE order, and prefer the shortest option that carries the meaning.
6. Output at most 3 rows, one per plausible option, highest confidence first. "confidence" is an integer 0-100.
7. If no words of the TARGET VERSE can express the phrase, output exactly: "",0
8. Output only CSV rows: no header, no explanation, no markdown fences.

Required output format:
"word word",confidence

Example
GATEWAY PHRASE: church
TARGET VERSE: para la iglesia de Éfeso
PREVIOUS TRANSLATIONS: {"iglesia":7,"congregación":2}
Valid:
"iglesia",98
"la iglesia",70

Invalid: "church",98 | "congregación",90 | "iglesias",85 | "Iglesia",98 | "iglesia:3",98 | iglesia,98
`;

  const previousTranslations = formatPreviousTranslations(previousTranslationData, glPhrase, verseContent)

  // one labeled field per line, in the same order as the example above
  const lines = [
    `GATEWAY PHRASE (${glLangCode}): ${glPhrase}`,
    `TARGET VERSE (${targetLangCode}): ${verseContent}`,
  ]

  if (previousTranslations) {
    lines.push(`PREVIOUS TRANSLATIONS: ${previousTranslations}`)
  }

  return { systemPrompt, input: lines.join('\n') };
}

export async function getBestTWordSelectionWithConfidence(wordList, targetLangCode, glPhrase, glLangCode, previousTranslationData, enable_thinking = false) {
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
          const success_ = parseResponseRowNoPositions(response, wordList, answer, selectionWords)
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
      //handle case where AI did not use CSV format, but fields are separated by newlines
      if (responses?.length === 2) {
        selectionWords = []
        const response = answer.replace('\n', ',')
        success = parseResponseRowNoPositions(response, wordList, answer, selectionWords)
      }
    } else {
      // Handle verbose responses by retrying with the last non-empty CSV-looking line.
      const lastNonEmptyLine = responses
        ?.map(response => response?.trim())
        .filter(Boolean)
        .pop()
      if (lastNonEmptyLine) {
        const quoteParts = lastNonEmptyLine.split('"').filter(part => part.trim() !== '')

        if (quoteParts.length >= 3) {
          const phraseTranslation = quoteParts[quoteParts.length - 2]
          const confidencePart = quoteParts[quoteParts.length - 1]
            .split(',')
            .map(part => part.trim())
            .find(part => part !== '')

          const confidence = removeQuotes(confidencePart)
          const confidenceNum = parseInt(confidence, 10)

          if (Number.isNaN(confidenceNum) || confidenceNum < 0 || confidenceNum > 100) {
            success = false
          } else {
            selectionWords = []
            const response = `"${phraseTranslation}",${confidence}`
            success = parseResponseRowNoPositions(response, wordList, answer, selectionWords)
          }
          if (confidencePart) {
            selectionWords = []
            const response = `"${phraseTranslation}",${confidencePart}`
            success = parseResponseRowNoPositions(response, wordList, answer, selectionWords)
          }
        }
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

function parseResponseRowNoPositions(response, wordList, answer, selectionWords) {
  let error = false;
  const rowParts = response.split(',')
  if (rowParts.length === 2) {
    let [phraseTranslation, confidence] = rowParts
    confidence = confidence ? parseInt(removeQuotes(confidence), 10) : 0
    phraseTranslation = removeQuotes(phraseTranslation)
    const selections = []
    const words = phraseTranslation.split(' ')
    for (const word of words) {
      const text = normalizer(word.trim())

      if (text) {
        selections.push({ text })
      }
    }

    if (selections.length) {
      // Find the best positions for each word in selections within wordList
      // such that the positions are grouped closest together

      // Build a map of word -> array of positions in wordList
      const wordPositionsMap = new Map()
      for (const selection of selections) {
        const normalizedWord = normalizeForCompare(selection.text)
        const positions = []
        for (let i = 0; i < wordList.length; i++) {
          if (normalizeForCompare(wordList[i]) === normalizedWord) {
            positions.push(i)
          }
        }
        wordPositionsMap.set(selection.text, positions)
      }

      // Verify all words exist in wordList
      let allWordsFound = true
      for (const selection of selections) {
        const positions = wordPositionsMap.get(selection.text)
        if (!positions || positions.length === 0) {
          allWordsFound = false
          break
        }
      }

      if (!allWordsFound) {
        error = true
      } else {
        // Find the combination of positions that minimizes the span
        // (distance between first and last selected position)
        let bestCombination = null
        let minSpan = Infinity

        function findBestGrouping(selectionIndex, currentPositions) {
          if (selectionIndex === selections.length) {
            // Calculate span of current combination
            const sorted = [...currentPositions].sort((a, b) => a - b)
            const span = sorted[sorted.length - 1] - sorted[0]
            if (span < minSpan) {
              minSpan = span
              bestCombination = [...currentPositions]
            }
            return
          }

          const word = selections[selectionIndex].text
          const availablePositions = wordPositionsMap.get(word)
          for (const pos of availablePositions) {
            findBestGrouping(selectionIndex + 1, [...currentPositions, pos])
          }
        }

        findBestGrouping(0, [])

        // Assign the best positions and convert to occurrences
        if (bestCombination) {
          for (let i = 0; i < selections.length; i++) {
            const position = bestCombination[i]
            selections[i].text = normalizer(wordList[position])
            selections[i].occurrence = findOccurrenceForPos(position + 1, wordList, selections[i].text)
            // delete selections[i].position
          }
        } else {
          error = true
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
export async function translatePhraseWithConfidence(wordList, targetLangCode, phrase, phraseLangCode) {
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

export function getCheckDataFilename(langId, bookId) {
  return langId + '_' + bookId + '.json'
}

export function getWordList(verseText) {
  const tokenList = Lexer.tokenize(verseText)
  const wordList = tokenList.map(token => (token.text))
  return wordList
}

export function removePunctuation(glText) {
  const wordList = getWordList(glText)
  return wordList.join(' ')
}

export function cleanQuote(glQuote) {
  const replaceChars = ['{', '}', '.', ',', ';', ':', "\""];
  let cleanedQuote = glQuote

  // remove any characters in replaceChars
  for (const char of replaceChars) {
    cleanedQuote = cleanedQuote.split(char).join('')
  }
  return cleanedQuote
}

export function cleanQuote2(glQuote) {
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
