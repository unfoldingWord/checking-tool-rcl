/* eslint-env jest */
import { describe, expect, test } from '@jest/globals'
import path from 'path'
import fs from 'fs-extra'
import {
  getAlignedGLText,
  getPhraseFromTw,
  parseTwToIndex,
} from '../helpers/translationHelps/twArticleHelpers'
import {
  getDetailsFromProjectNameMini,
  readHelpsFolder,
  readJsonFile,
  readTextFile
} from '../helpers/fileHelpers'
import { groupDataHelpers, usfmHelpers } from 'word-aligner-lib'
import { getVerseString } from '../helpers/tsv-groupdata-parser/verseHelpers'
import {
  getBestTWordSelectionWithConfidence,
  getBestTWordSelectionWithConfidenceAlgorithm,
  getCheckDataFilename,
  getSelectionsForBook,
  getWordList,
  normalizeHistory,
  removePunctuation, selectionsToString,
  translatePhraseWithConfidence
} from './autoCheckingUtils'
import { isBibleBookId, isNT } from '../common/BooksOfTheBible'

jest.unmock('fs-extra')

describe.skip('read enGlBible data', () => {
  test(`read enGlBible.json`, () => {
    const filePath = path.join(__dirname, 'fixtures', 'bibles', '1jn', 'enGlBible.json')
    const bibleData = fs.readJsonSync(filePath)
    expect(bibleData).toBeTruthy()
    expect(Array.isArray(bibleData['1']['1'].verseObjects)).toBe(true)
  });

  test.skip(`read twl_tit.check`, () => {
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
    // const books = ['eph', '1co', 'heb']
    const books = ['tit']
    for (const bookId of books) {
      const bookChecks = readHelpsFolder(filePath, bookId)
      expect(bookChecks)
      const savePath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
      fs.outputJsonSync(savePath, bookChecks, { spaces: 2 });
    }
  });

  test(`test selection prediction for tw in New Book - AI`, async () => {
    let count = 0;
    let completedSelections = 0;
    const startTime = Date.now();

    const lmOptions = {
      enable_thinking: true,
      model: 'qwen2.5-coder-7b-instruct-mlx' // 'nvidia/nemotron-3-nano-4b' // 'qwen/qwen3-8b' // 'gemma-3n-e2b-it-text' // 'google/gemma-4-e4b' // 'qwen/qwen3-8b' // 'google/gemma-3n-e4b'
    }
    const langId = 'en';
    const bookId = '1co';
    const tWord = 'church'
    const category = 'kt'

    const expectedMinConfidence = 60
    const results = []
    const generatedSelections = {}

    /////////////////////
    // get checking data for book
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();
    const tWordCategoryData = bookChecks[category]?.groups?.[tWord];
    const selectedCheck = tWordCategoryData?.[0];
    const contextId = selectedCheck?.contextId;
    const reference = contextId?.reference;
    const glQuote = contextId?.glQuote;

    ///////////////////////////
    // get get previous tWord selections
    const historyName = 'church_es-419_eph.json'
    const selectionDataPath = path.join(outputFolder, historyName)
    const selectionsForTWordsRaw = fs.readJsonSync(selectionDataPath)
    const selectionsForTWords = normalizeHistory(selectionsForTWordsRaw)


    /////////////////////
    // get gateway language bible
    const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
    const alignedGlBible = readHelpsFolder(enUltFolder)

    /////////////////////
    // get target book
    const targetLangCode = `es-419`
    const targetBookName = 'es-419_1co_level2_text_ulb.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()
    expect(reference).toBeTruthy()
    expect(glQuote).toBeTruthy()

    for (const check of tWordCategoryData) {
      const contextId = check.contextId
      const reference = contextId.reference
      const glQuoteInitial = contextId.glQuote
      const initialSelections = check.selections
      let glQuote = null
      if (!glQuote) {
        const alignedGlBook = alignedGlBible[bookId]
        // need quote
        let glText = getAlignedGLText(alignedGlBook, contextId)
        // console.log(glText);
        if (glText) {
          glText = removePunctuation(glText)
          glQuote = glText;
        }
      }
      expect(glQuote).toBeTruthy()
      const ref = `${reference?.chapter}:${reference?.verse}`
      const verseText = getVerseString(targetBookChapters, ref)
      const wordList = getWordList(verseText)
      count++
      const bestSelections = await getBestTWordSelectionWithConfidence(wordList, targetLangCode, glQuote, langId, selectionsForTWords, lmOptions)
      const lines = []
      for (let i = 0; i <= bestSelections.length; i++) {
        const option = bestSelections[i]
        const confidence = option?.confidence
        if (option?.selections?.length) {
          const json_ = JSON.stringify(option.selections)
          const line = `${i+1} - ${confidence}% ${json_}`
          lines.push(line)
        }
      }
      lines.length && console.log('\n' + lines.join('\n'))
      // console.log(bestSelections)

      const confidenceIsNumber = confidence && !isNaN(confidence)
      const selections = bestSelections[0]?.selections
      if (!confidenceIsNumber || !selections) {
        if (!selections) {
          console.log(`missing selections for ${ref} and ${verseText}`)
        } else if (!confidenceIsNumber) {
          console.log(`confidence ${confidence} is not a number`)
        }
      } else {
        completedSelections++
        for (const selection of selections) {
          const { text, occurrence } = selection
          const occurrenceCount = wordList.filter(word => word === text).length
          if (!occurrence || occurrence > occurrenceCount) {
            console.log(`invalid occurrence ${occurrence} for ${text}`)
          }
          expect(occurrenceCount).toBeGreaterThanOrEqual(occurrence)
          // expect(wordList).toContain(text)
        }
        if (initialSelections) {
          if (!isEqual(initialSelections, selections)) {
            console.log('mismatch', {initialSelections, selections})
          }
        }
      }
      // expect(selections).toEqual(expected)
      let confidence = bestSelections[0]?.confidence
      results.push({ ref, verseText, glQuote, selections, confidence })
      const selectedText = selections?.map(word => word?.text)?.join(' ')
      if (selectedText) {
        let previousGeneratedQuote = generatedSelections[glQuote]
        if (!previousGeneratedQuote) {
          previousGeneratedQuote = {}
          generatedSelections[glQuote] = previousGeneratedQuote
        }
        if (previousGeneratedQuote[selectedText]) {
          previousGeneratedQuote[selectedText]++
        } else {
          previousGeneratedQuote[selectedText] = 1
        }

      }

      if (selections && confidenceIsNumber) {
        if (!(confidence >= expectedMinConfidence)) {
          console.log(`confidence ${confidence} is less than ${expectedMinConfidence}`)
        }
        expect(confidence >= expectedMinConfidence).toBeTruthy()
      }
    }
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const finalResults = {
      model: lmOptions.model,
      thinking: lmOptions.enable_thinking,
      verseCount: count,
      successfulSelections: completedSelections,
      totalTime,
      averageTime: completedSelections ? totalTime/completedSelections : 0,
      generatedSelections,
    }
    console.log("finalResults", finalResults)

    expect(results).toMatchSnapshot()
  }, 500000000)

  test(`test selection prediction for tw in New Book - Algorithm`, async () => {
    const langId = 'en';
    const bookId = '1co';
    const tWord = 'church'
    const category = 'kt'

    const expectedMinConfidence = 90
    const results = []
    const generatedSelections = {}

    /////////////////////
    // get checking data for book
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();
    const tWordCategoryData = bookChecks[category]?.groups?.[tWord];
    const selectedCheck = tWordCategoryData?.[0];
    const contextId = selectedCheck?.contextId;
    const reference = contextId?.reference;
    const glQuote = contextId?.glQuote;

    ///////////////////////////
    // get get previous tWord selections
    const historyName = 'church_es-419_eph.json'
    const selectionDataPath = path.join(outputFolder, historyName)
    const selectionsForTWordsRaw = fs.readJsonSync(selectionDataPath)
    const selectionsForTWords = normalizeHistory(selectionsForTWordsRaw)

    /////////////////////
    // get gateway language bible
    const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
    const alignedGlBible = readHelpsFolder(enUltFolder)

    /////////////////////
    // get target book
    const targetLangCode = `es-419`
    const targetBookName = 'es-419_1co_level2_text_ulb.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()
    expect(reference).toBeTruthy()
    expect(glQuote).toBeTruthy()

    for (const check of tWordCategoryData) {
      const contextId = check.contextId
      const reference = contextId.reference
      const glQuoteInitial = contextId.glQuote
      const prevSelection = check.selections
      let glQuote = null
      if (!glQuote) {
        const alignedGlBook = alignedGlBible[bookId]
        // need quote
        let glText = getAlignedGLText(alignedGlBook, contextId)
        console.log(glText);
        if (glText) {
          glText = removePunctuation(glText)
          glQuote = glText;
        }
      }
      expect(glQuote).toBeTruthy()
      const ref = `${reference?.chapter}:${reference?.verse}`
      const verseText = getVerseString(targetBookChapters, ref)
      const wordList = getWordList(verseText)
      const bestSelections = await getBestTWordSelectionWithConfidenceAlgorithm(wordList, targetLangCode, glQuote, langId, selectionsForTWords)
      console.log(bestSelections)
      const selections = bestSelections[0]?.selections
      if (!selections) {
        console.log(`missing selections for ${ref} and ${verseText}`)
      } else {
        for (const selection of selections) {
          const { text, occurrence } = selection
          const occurrenceCount = wordList.filter(word => word === text).length
          expect(occurrenceCount).toBeGreaterThanOrEqual(occurrence)
          // expect(wordList).toContain(text)
        }
        // const selectionStr = selectionsToString(selections)
        // if (selectionStr !== glQuoteInitial) {
        //   console.log('mismatch', {glQuoteInitial, selectionStr})
        // }
      }
      // expect(selections).toEqual(expected)
      const confidence = bestSelections[0]?.confidence
      results.push({ ref, verseText, glQuote, selections, confidence })
      const selectedText = selections?.map(word => word?.text)?.join(' ')
      if (selectedText) {
        let previousGeneratedQuote = generatedSelections[glQuote]
        if (!previousGeneratedQuote) {
          previousGeneratedQuote = {}
          generatedSelections[glQuote] = previousGeneratedQuote
        }
        if (previousGeneratedQuote[selectedText]) {
          previousGeneratedQuote[selectedText]++
        } else {
          previousGeneratedQuote[selectedText] = 1
        }
      }

      // expect(confidence >= expectedMinConfidence).toBeTruthy()
    }
    console.log("generatedSelections", generatedSelections)
    expect(results).toMatchSnapshot()
  }, 5000000)

  test.skip(`test selection prediction for tw`, async () => {
    const langId = 'en';
    const bookId = 'eph';
    const tWord = 'church'
    const category = 'kt'

    const expectedMinConfidence = 90
    const expected = [
      {
        "text": "para",
        "occurrence": 1
      },
      {
        "text": "la",
        "occurrence": 1
      },
      {
        "text": "iglesia",
        "occurrence": 1
      }
    ]

    /////////////////////
    // get checking data for  book
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();
    const tWordCategoryData = bookChecks[category]?.groups?.[tWord];
    const selectedCheck = tWordCategoryData?.[0];
    const contextId = selectedCheck?.contextId;
    const reference = contextId?.reference;
    const glQuote = contextId?.glQuote;

    ///////////////////////////
    // get tWord selections for book
    const selectionDataPath = path.join(outputFolder, tWord + '_' + getCheckDataFilename(langId, bookId))
    const selectionsForTWords =  fs.readJsonSync(selectionDataPath)

    /////////////////////
    // get target book
    const targetLangCode = `es-419`;
    const targetBookName = 'es-419_tpl_eph_book.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()
    expect(reference).toBeTruthy()
    expect(glQuote).toBeTruthy()

    const ref = `${reference?.chapter}:${reference?.verse}`
    const verseText = getVerseString(targetBookChapters, ref);
    const wordList = getWordList(verseText)
    const lmOptions = { enable_thinking: false }
    const bestSelections = await getBestTWordSelectionWithConfidence(wordList, targetLangCode, glQuote, langId, selectionsForTWords, lmOptions)
    console.log(bestSelections)
    const selections = bestSelections[0]?.selections
    expect(selections).toEqual(expected)
    const confidence = bestSelections[0]?.confidence
    expect(confidence>=expectedMinConfidence).toBeTruthy()
  }, 50000);

  test.skip(`test selection prediction for tw missing word`, async () => {
    const outputFolder = path.join(__dirname, 'fixtures', 'checks', 'checkingData')
    const langId = 'en';
    const bookId = 'eph';
    const tWord = 'church'
    const category = 'kt'

    const expectedMinConfidence = 90
    const expected = [
      {
        "text": "la",
        "occurrence": 1
      },
      {
        "text": "iglesia",
        "occurrence": 1
      }
    ]

    const readPath = path.join(outputFolder, getCheckDataFilename(langId, bookId))
    const bookChecks = fs.readJsonSync(readPath);
    expect(bookChecks).toBeTruthy();
    const tWordCategoryData = bookChecks[category]?.groups?.[tWord];
    const selectedCheck = tWordCategoryData?.[0];
    const contextId = selectedCheck?.contextId;
    const reference = contextId?.reference;
    const glQuote = contextId?.glQuote;

    const selectionDataPath = path.join(outputFolder, tWord + '_' + getCheckDataFilename(langId, bookId))
    const selectionsForTWords =  fs.readJsonSync(selectionDataPath)

    const targetLangCode = `es-419`;
    const targetBookName = 'es-419_tpl_eph_book.usfm'
    const targetBookPath = path.join(__dirname, 'fixtures/bibles/es-419', targetBookName)
    const targetBookUSfm = readTextFile(targetBookPath);
    const targetBook = usfmHelpers.getParsedUSFM(targetBookUSfm);
    expect(targetBook).toBeTruthy()
    const targetBookChapters = targetBook?.chapters;
    expect(targetBookChapters).toBeTruthy()
    expect(reference).toBeTruthy()
    expect(glQuote).toBeTruthy()

    const ref = `${reference?.chapter}:${reference?.verse}`
    const verseText = getVerseString(targetBookChapters, ref);
    const wordList = getWordList(verseText.replace('para ', ''))
    const lmOptions = { enable_thinking: false }
    const bestSelections = await getBestTWordSelectionWithConfidence(wordList, targetLangCode, glQuote, langId, selectionsForTWords, lmOptions)
    console.log(bestSelections)
    const selections = bestSelections[0]?.selections
    expect(selections).toEqual(expected)
    const confidence = bestSelections[0]?.confidence
    expect(confidence>=expectedMinConfidence).toBeTruthy() });

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

    const wordChecks = bookChecks?.kt?.groups?.[tWord];
    expect(wordChecks).toBeTruthy();
    const selectionsForWord = {}
    const checks = wordChecks
    for (const check of checks) {
      const glQuote = check?.contextId?.glQuote;
      const selectionsForCheck = check?.selections
      if (glQuote && selectionsForCheck) {
        const selectedText = selectionsForCheck?.map(word => word?.text)?.join(' ')

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

  test.skip(`generate AI tw selections`, async () => {
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
const projectFolder = '/Users/blm0/translationCore/projects/en_ult_gal_book'

describe('read resources', () => {
  test(`read tWl from projects`, () => {

    /////////////////////
    // get gateway language bible
    const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
    const alignedGlBible = readHelpsFolder(enUltFolder)

    const projectSaveLocation = projectFolder;
    const toolName = 'translationWords';
    const toolTerm = 'faith';

    const parsed = path.parse(projectSaveLocation);
    const projectName = parsed.base;
    const projectsFolder = parsed.dir;
    const usingNT = true;
    const glLanguage = 'en'
    const resourceType = 'ult'
    const selectionsForWord = {}

    const projects = fs.readdirSync(projectsFolder);
    for (const projectName_ of projects) {
      const {
        bookId,
        languageId,
        resourceId
      } = getDetailsFromProjectNameMini(projectName_)

      const isBible = isBibleBookId(bookId)
      const isNt = isNT(bookId)

      const matchingResource = (isBible &&
        (isNt === usingNT)
        && (languageId === glLanguage)
        && (resourceType === resourceId));
      if (!matchingResource) {
        continue; // skip
      }

      const projectPath = path.join(projectsFolder, projectName_)

      //    '.apps/translationCore/index/translationWords/gal/faith.json'
      const selectionsPath = path.join(projectPath, `.apps/translationCore/index/${toolName}/${bookId}/${toolTerm}.json`)

      const checks = readJsonFile(selectionsPath)
      expect(checks?.length)

      const alignedGlBook = alignedGlBible[bookId]
      getSelectionsForBook(checks, alignedGlBook, selectionsForWord)
    }
    const keys = Object.keys(selectionsForWord)
    expect(keys.length)
  });

  test(`read tWl from projectFolder`, () => {

    /////////////////////
    // get gateway language bible
    const enUltFolder = '/Users/blm0/translationCore/resources/en/bibles/ult/v89_unfoldingWord'
    const alignedGlBible = readHelpsFolder(enUltFolder)

    const projectSaveLocation = projectFolder;
    const toolName = 'translationWords';
    const toolTerm = 'faith';

    const parsed = path.parse(projectSaveLocation);
    const projectName = parsed.base;
    const projectsFolder = parsed.dir;

    const {
      bookId,
      languageId,
      resourceId,
    } = getDetailsFromProjectNameMini(projectName)

    const projectPath = projectSaveLocation;

    //    '.apps/translationCore/index/translationWords/gal/faith.json'
    const selectionsPath = path.join(projectPath, `.apps/translationCore/index/${toolName}/${bookId}/${toolTerm}.json`)

    const checks = readJsonFile(selectionsPath)
    expect(checks?.length)

    const alignedGlBook = alignedGlBible[bookId]
    const selectionsForWord = {}
    getSelectionsForBook(checks, alignedGlBook, selectionsForWord)
    const keys = Object.keys(selectionsForWord)
    expect(keys.length)
  });

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
