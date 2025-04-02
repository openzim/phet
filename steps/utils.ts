export const formatLanguages = (langs: string): string[] => {
  return langs.split(',').map((lang) => lang.trim())
}
