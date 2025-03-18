import fs from 'fs'
import { rimraf } from 'rimraf'

rimraf('state').then(
  () => {
    fs.mkdir('state', function () {
      fs.mkdirSync('state/get')
      fs.mkdirSync('state/get/catalogs')
      fs.mkdirSync('state/transform')
      fs.mkdirSync('state/export')
    })
  },
  (err) => console.error(err),
)
