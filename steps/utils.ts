import slugify from 'slugify'
import { cats } from 'lib/const'

const formatcsv = (inputs: string): string[] => {
  return inputs.split(',').map((input) => input.trim())
}

export const formatLanguages = (langs: string): string[] => {
  return formatcsv(langs)
}

export const formatSubjects = (subjects: string): string[] => {
  return formatcsv(subjects)
}

export const verifySubjects = (subjects: string): boolean => {
  const validSubjects = Object.values(cats)
  return formatSubjects(subjects).every((subj) => validSubjects.includes(slugify(subj, { lower: true })))
}

export const getMatchedCats = (input: string) => {
  const formatedSubjects = formatSubjects(input)
  const catsKeys = Object.keys(cats)
  const catsValues = Object.values(cats)
  const validCats = {}

  formatedSubjects.forEach((sub) => {
    const indexCat = catsValues.indexOf(slugify(sub, { lower: true }))
    if (indexCat >= 0) validCats[catsKeys[indexCat]] = catsValues[indexCat]
  })
  return validCats
}
