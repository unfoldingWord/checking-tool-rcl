import fs from 'fs-extra'
import path from 'path'
import { isBibleBookId } from '../common/BooksOfTheBible'

export function readJsonFile(jsonPath) {
  if (fs.existsSync(jsonPath)) {
    try {
      const resourceManifest = fs.readJsonSync(jsonPath);
      return resourceManifest;
    } catch (e) {
      console.error(`readJsonFile(): could not read ${jsonPath}`, e);
    }
  }
  return null;
}

export function isDirectory(fullPath) {
  return fs.lstatSync(fullPath).isDirectory()
}

export function readTextFile(filePath) {
  const data = fs.readFileSync(filePath, 'UTF-8').toString();
  return data
}

export function readHelpsFolder(folderPath, filterBook = '') {
  const contents = {}
  const files = fs.readdirSync(folderPath)
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const parts = path.parse(file)
    const key = parts.name
    const type = parts.ext
    if (type === '.json') {
      const data = readJsonFile(filePath)
      if (data) {
        contents[key] = data
      }
    } else if (type === '.md') {
      const data = readTextFile(filePath)
      if (data) {
        contents[key] = data
      }
    } else if (isDirectory(filePath)) {
      if ((key === 'groups') && filterBook) {
        const bookPath = path.join(filePath, filterBook)
        const data = readHelpsFolder(bookPath)
        contents[key] = data
      } else {
        const data = readHelpsFolder(filePath, filterBook)
        contents[key] = data
      }
    }
  }
  return contents
}

export function getDetailsFromProjectNameMini(projectName) {
  let bookId = '';
  let languageId = '';
  let resourceId = '';

  if (projectName) {
    const parts = projectName.split('_');
    languageId = parts[0];
    resourceId = (parts?.length >= 4) ? parts[1] : '';

    // we can have a bunch of old formats (e.g. en_act, aaw_php_text_reg) and new format (en_ult_tit_book)
    for (let i = 1; i < parts.length; i++) { // iteratively try the fields to see if valid book ids
      const possibleBookId = parts[i].toLowerCase();

      if (isBibleBookId(possibleBookId)) {
        bookId = possibleBookId;
        break;
      }
    }
  }
  return {
    bookId,
    languageId,
    resourceId,
  };
}
