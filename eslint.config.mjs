import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const config = [{ ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'data/**'] }, ...compat.extends('next/core-web-vitals', 'next/typescript')];
config.push({ rules: { '@next/next/no-img-element': 'off' } });
export default config;
