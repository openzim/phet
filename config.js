const date = new Date();

module.exports = {
    "verbose": true,
    "workers": 10,
    "imageResolution": 600,
    "categoriesToGet": [
        "Physics",
        "Biology",
        "Chemistry",
        "Earth Science",
        "Math"
    ],
    // todo
    // "buildCombinations": availableLanguages.map(lang => {
    //     return {
    //         output: `phet_${lang.toLowerCase().replace("_", "-")}_${date.getUTCFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}`,
    //         languages: [lang]
    //     }
    // }).concat({
    //     "output": `phet_mul_${date.getUTCFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}`,
    //     "languages": availableLanguages
    // })
}
