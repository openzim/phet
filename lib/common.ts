import * as path from 'path'
import { iso6393 } from 'iso-639-3'
import ISO6391 from 'iso-639-1'

const languageCodesMapping = {
  fu: 'fur',
  iw: 'heb',
  in: 'ind',
  mo: 'ron',
  sp: 'nso',
  ef: 'efi',
}

const languagesNativesMapping = {
  ar_KW: 'العربية (الكويت)',
  ar_KY: 'العربية (ليبيا)',
  ar_SY: 'العربية (سوريا)',
  ar_MA: 'العربية (المغرب)',
  ar_SA: 'العربية (السعودية)',
  en_CA: 'English (Canada)',
  en_GB: 'English (United Kingdom)',
  ef: 'Usem Efịk',
  es_UY: 'español (Uruguay)',
  es_CO: 'español (Colombia)',
  es_MX: 'español (México)',
  es_PE: 'español (Perú)',
  es_ES: 'español (España)',
  fa_DA: 'دری',
  in: 'Bahasa Indonesia',
  iw: 'עברית',
  ku_tr: 'Kurmancî',
  mo: '	Moldavian',
  pt_br: 'português (Brasil)',
  sh: '	Serbo-Croatian',
  sp: 'Sesotho sa Leboa',
  zh_CN: '中文 (中国)',
  zh_HK: '中文 (香港)',
  zh_TW: '中文 (台灣)',
}

export const barOptions = {
  clearOnComplete: false,
  autopadding: true,
  format: '{prefix} {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {postfix}',
}

export const getIdAndLanguage = (url: string): string[] => {
  if (!url) throw new Error('Got empty url')
  return /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3)
}

export const getISO6393 = (lang = 'en') => {
  lang = lang.split('_')[0]
  const langEntity = iso6393.find((l) => l.iso6391 === lang)
  return langEntity ? langEntity.iso6393 : languageCodesMapping[lang]
}

export const getNativeName = (lang: string) => {
  return languagesNativesMapping[lang] || ISO6391.getNativeName(lang)
}
