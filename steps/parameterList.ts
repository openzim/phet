export const parameterDescriptions = {
  includeLanguages: 'Languages to include',
  excludeLanguages: 'Languages to exclude',
  withoutLanguageVariants: 'Exclude languages with Country variant. For example `en_CA` will not be present in zim with this argument.',
  mulOnly: 'Skip ZIM files for individual languages',
  createMul: 'Create a ZIM file with all languages',
  output: 'Output ZIM files in a specific directory',
}

export const applyParameterConstraints = (argv): boolean => {
  if (argv.output && Array.isArray(argv.output)) {
    throw new Error(`Error: duplicate --output isn't allowed.`)
  }
  return true
}
