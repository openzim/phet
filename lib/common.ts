import * as path from 'path';

export const barOptions = {
    clearOnComplete: false,
    autopadding: true,
    format: '{prefix} {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {postfix}'
};

export const getIdAndLanguage = (url: string): string[] => {
    if (!url) throw new Error('Got empty url');
    return /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3);
};
