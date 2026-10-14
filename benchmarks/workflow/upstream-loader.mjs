import {registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
registerHooks({resolve(specifier,context,next){if(specifier==='js-yaml')return next(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href,context);return next(specifier,context);}});
