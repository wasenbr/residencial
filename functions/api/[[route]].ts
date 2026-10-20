import { handle } from 'hono/cloudflare-pages';
import { criarApp } from '../../src/server/app';

export const onRequest = handle(criarApp());
