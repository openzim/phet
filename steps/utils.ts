import slugify from 'slugify'
import { cats } from 'lib/const'

const formatcsv = (inputs: string): string[] => {
  return inputs.split(',').map((input) => input.trim())
}

export const formatLanguages = (langs: string): string[] => {
  return formatcsv(langs)
}

export const formatSubjects = (subjects: string): string[] => {
  return formatcsv(subjects).map((subject) => slugify(subject, { lower: true }))
}

export const verifySubjects = (subjects: string): boolean => {
  const validSubjects = Object.values(cats)
  return formatSubjects(subjects).every((subj) => validSubjects.indexOf(subj) >= 0)
}
