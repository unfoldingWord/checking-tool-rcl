

import { removeMarker } from "usfm-js";
import { getVerses } from 'bible-reference-range';
/**
 * verify all selections
 * @param {Object} targetBible - target bible
 * @param {Object} groupsData - all the checks keyed by catagory
 * @param {Function} invalidateCheckCallback
 * @return {Promise<boolean>}
 */
export function validateSelectionsForAllChecks(targetBible, groupsData = null, invalidateCheckCallback = null)  {
  let _selectionsChanged = false;
  const filteredVerses = {} // for caching verse content parsed to text

  const groupIds = Object.keys(groupsData)
  for (const groupId of groupIds) {
    const checks = groupsData[groupId]

    for (let j = 0, lenGI = checks.length; j < lenGI; j++) {
      const check = checks[j];
      const selections = check.selections;
      const reference = check.contextId?.reference
      const chapter = reference.chapter
      const verse = reference.verse
      const ref = `${chapter}:${verse}`

      let targetVerse = filteredVerses[ref]
      if (!targetVerse) {
        targetVerse = getVerseText(targetBible, check.contextId, false)['verseText']
        targetVerse = removeMarker(targetVerse) // remove USFM markers
        filteredVerses[ref] = targetVerse
      }

      if (targetVerse) {
        if (selections && selections.length) {
          const { selectionsChanged: currentSelectionsInvalid } = _validateVerseSelections(targetVerse, selections)
          _selectionsChanged = checkIfInvalidationChanged(check, currentSelectionsInvalid, _selectionsChanged, invalidateCheckCallback)
        } else { // no selections, so not invalid
          const currentSelectionsInvalid = false
          _selectionsChanged = checkIfInvalidationChanged(check, currentSelectionsInvalid, _selectionsChanged, invalidateCheckCallback)
        }
      }
    }
  }

  return _selectionsChanged
}

function checkIfInvalidationChanged(check, currentSelectionsInvalid, _selectionsChanged, invalidateCheckCallback) {
  if (!!check.invalidated !== currentSelectionsInvalid) {
    _selectionsChanged = true
    // callback
    invalidateCheckCallback && invalidateCheckCallback(check, currentSelectionsInvalid)
  }
  return _selectionsChanged
}



/**
 * Normalizes a string including whitespace
 * @param {String} string - the string to normalize
 * @returns {String} - The returned normalized string
 */
export const normalizeString = (string = '') => {
  string = string.replace(/\s+/g, ' ');
  return string;
};

export function getVerseText(bookData, contextId, addVerseRef=false) {
  let unfilteredVerseText = '';
  let verseText = '';

  if (contextId && contextId.reference) {
    const { chapter, verse } = contextId.reference;
    const refs = getVerses(bookData, `${chapter}:${verse}`);
    let initialChapter;
    if (refs && refs.length) {
      initialChapter = refs[0].chapter;
    }

    for (let verseCnt = 0; verseCnt < refs.length; verseCnt++) {

      const ref = refs[verseCnt];
      const chapter = ref.chapter;
      const data = ref.verseData;
      let label = ref.verse;

      if (chapter !== initialChapter) {
        label = `${chapter}:${label}`;
      }

      if (verseCnt > 0) {
        unfilteredVerseText += '\n';

        if (addVerseRef) {
          unfilteredVerseText += label + ' ';
        }
      }

      unfilteredVerseText += data;
    }
    verseText = removeMarker(unfilteredVerseText);
    // normalize whitespace in case selection has contiguous whitespace _this isn't captured
    verseText = normalizeString(verseText);
  }

  return { unfilteredVerseText, verseText };
}

function _validateVerseSelections(filteredTargetVerse, selections) {
  const validSelections = checkSelectionOccurrences(filteredTargetVerse, selections);
  const selectionsChanged = (selections.length !== validSelections.length);
  return { selectionsChanged, validSelections }
}

/**
 * @description This checks to see if the string still has the same number of occurrences.
 * It should remove the selections that the occurrences do not match
 * @param {string} string - the text selections are found in
 * @param {array}  selections - array of selection objects [Obj,...]
 * @returns {array} - array of selection objects
 */
export const checkSelectionOccurrences = (string, selections) => {
  selections = selections.filter(selection => {
    let count = occurrences(string, selection.text);
    return count === selection.occurrences;
  });
  return selections;
};

/**
 * @description Function that count occurrences of a substring in a string
 * @param {String} string - The string to search in
 * @param {String} subString - The sub string to search for
 * @return {Integer} - the count of the occurrences
 * @see http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string/7924240#7924240
 * modified to fit our use cases, return zero for '' substring, and no use case for overlapping.
 */
export const occurrences = (string, subString) => {
  if (subString.length <= 0) return 0;
  let n = 0;
  let pos = 0;
  let step = subString.length;
// eslint-disable-next-line no-constant-condition
  while (true) {
    pos = string.indexOf(subString, pos);
    if (pos === -1) break;
    ++n;
    pos += step;
  }
  return n;
};
