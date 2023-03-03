export const catalogJs = (catalog: object, lsPrefix: string): string => {
  return `window.importedData = ${JSON.stringify(catalog)};

window.lsPrefix = 'kiwix';

lsPrefix = '${lsPrefix}';`
}
