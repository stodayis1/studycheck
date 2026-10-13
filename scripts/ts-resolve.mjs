// node --import ./scripts/ts-resolve.mjs scripts/어떤것.ts
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./ts-ext-hook.mjs', pathToFileURL('./scripts/'))
