import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('../mobile/node_modules/typescript');
const code=ts.transpileModule(readFileSync(new URL('../mobile/src/app/navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(code,{exports});
test('Navegação: links preservam tela e projeto e toleram URL inválida',()=>{
  for(const page of exports.pages) assert.equal(exports.readRoute(exports.routeHash(page)).page,page);
  const id='projeto com espaço/á';
  assert.equal(exports.readRoute(exports.routeHash('projetos',id)).projectId,id);
  for(const hash of ['', '#/inexistente', '#/projetos/%ZZ', '#/home/extra']) assert.equal(exports.readRoute(hash).page,'home');
});
