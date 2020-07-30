import 'ts-jest';
import * as fs from 'fs';
import {join} from 'path';
import {fork} from 'child_process';
import {ZimReader} from '@openzim/libzim';


jest.setTimeout(20 * 60 * 1000);

const language = 'fr';
const targetDir = './dist/';

const now = new Date();
const datePostfix = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
const files = [
  `${targetDir}phet_mul_${datePostfix}.zim`,
  `${targetDir}phet_${language}_${datePostfix}.zim`,
];

const options = {
  cwd: join(__dirname, '..'),
  silent: false,
  execArgv: ['-r', 'ts-node/register']
};


describe('Create ZIM', () => {

  beforeAll(async (done) => {
    await removeZim();
    const proc = fork('./steps/setup', [], options);
    proc.on('close', done);
  });

  test(`Get [${language}]`, (done) => {
    const proc = fork('./steps/get', ['--includeLanguages', language], options);
    proc.on('close', done);
  });

  test(`Transform`, (done) => {
    const proc = fork('./steps/transform', [], options);
    proc.on('close', done);
  });

  test(`Export`, (done) => {
    const proc = fork('./steps/export', [], options);
    proc.on('close', done);
  });
});


describe('Validate ZIM', () => {

  let zim: ZimReader;

  beforeAll(() => {
    zim = new ZimReader(files[0]);
  });

  test(`Two zim files`, async (done) => {
    const zim1 = await fs.promises.stat(files[0]);
    expect(zim1).toBeDefined();
    const zim2 = await fs.promises.stat(files[1]);
    expect(zim2).toBeDefined();
    // expect(zim1.size).toEqual(zim2.size);
    done();
  });

  test(`Count`, async (done) => {
    const articlesCount = await zim.getCountArticles();
    expect(articlesCount).toBeGreaterThan(500);
    done();
  });

  test(`Meta records`, async (done) => {
    const article = await zim.getArticleByUrl(`M/Counter`);
    expect(article).toBeDefined();
    const meta: any = {};
    article.data.toString()
      .split(';')
      .forEach((item) => {
        const x = item.split('=');
        meta[x[0]] = x[1];
      });
    expect(parseInt(meta['text/html'], 10)).toBeGreaterThan(80);
    expect(parseInt(meta['image/png'], 10)).toBeGreaterThan(80);
    expect(parseInt(meta['font/ttf'], 10)).toBeGreaterThan(10);
    expect(parseInt(meta['application/javascript'], 10)).toBeGreaterThan(300);
    done();
  });

  test(`Main page`, async (done) => {
    const article = await zim.getArticleByUrl(`A/index.html`);
    expect(article).toBeDefined();
    expect(article.mimeType).toEqual('text/html');
    expect(article.data.length).toBeGreaterThan(100000);
    done();
  });

  afterAll(async () => {
    await zim.destroy();
    removeZim();
  });
});


const removeZim = () => {
  try {
    for (const file of files) {
      fs.promises.unlink(file);
    }
  } catch (e) {
    // noop
  }
};

