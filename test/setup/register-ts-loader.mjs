// Registers ts-extension-hook.mjs as a Node module-resolution hook. Loaded
// via `node --import` in package.json's "test" script, before the test
// files run.
import { register } from 'node:module';

register('./ts-extension-hook.mjs', import.meta.url);
