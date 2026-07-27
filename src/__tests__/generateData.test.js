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

describe.skip('LM Studio integration', () => {
  test(`query LM Studio with a text prompt`, async () => {
    console.log('testing')
    const answer = await queryLmStudio('What is the capital of France?');
    expect(answer).toBeTruthy();
    console.log('LM Studio response:', answer);
  });
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
  const replyText = data?.choices?.[0]?.message?.content;

  if (!replyText) {
    throw new Error(`Unexpected LM Studio response shape: ${JSON.stringify(data)}`);
  }

  return replyText;
}

