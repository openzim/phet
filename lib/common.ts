import * as path from 'path';
import {iso6393} from 'iso-639-3';

const languageCodesMapping = {
  fu: 'fur',
  iw: 'heb',
  in: 'ind',
  mo: 'ron'
};

export const barOptions = {
    clearOnComplete: false,
    autopadding: true,
    format: '{prefix} {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {postfix}'
};

export const getIdAndLanguage = (url: string): string[] => {
    if (!url) throw new Error('Got empty url');
    return /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3);
};

export const getISO6393 = (lang = 'en') => {
  lang = lang.split('_')[0];
  const langEntity = iso6393.find(l => l.iso6391 === lang);
  return langEntity ? langEntity.iso6393 : languageCodesMapping[lang];
};
