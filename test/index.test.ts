import fastify from 'fastify';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { fastifyHookly } from '../src/index';
import { name } from '../package.json' with { type: 'json' };

import type { FastifyInstance } from 'fastify';

import type { FastifyHooklyOptions } from '../src/index';

async function setupServe(options: Partial<FastifyHooklyOptions> = {}, handlePreReady?: (instance: FastifyInstance) => void | Promise<void>): Promise<FastifyInstance> {
  const instance = fastify();
  await instance.register(fastifyHookly, options as any);
  await handlePreReady?.(instance);
  await instance.ready();
  return instance;
}

async function withDebuggerOptions(debuggerOptions: Partial<FastifyHooklyOptions['debuggerOptions']>): Promise<void> {
  let instance: FastifyInstance | undefined;
  try {
    instance = await setupServe({ debuggerOptions });
  } finally {
    await instance?.close();
    instance = undefined;
  }
}

describe(`plugin: ${name}`, () => {
  let serve: FastifyInstance;
  const beforeSpied = vi.fn();
  const afterSpied = vi.fn();

  beforeAll(async () => {
    serve = await setupServe(
      {
        before: beforeSpied,
        after: afterSpied,
        close: vi.fn(), // dummy close hook
        debuggerOptions: { tag: 'test', inspect: false, group: true, filter: 'hook:' }
      },
      //
      async instance => {
        // Register a temporary route for request hookable testing
        instance.get('/test-request', async request => {
          expect(request.hookly).toBeDefined();
          expect(typeof request.hookly.callHook).toBe('function');
          return { ok: true };
        });
      }
    );
  });

  afterAll(async () => {
    await serve.close();
  });

  // --------------------------------------------
  // Fastify instance & request decoration
  // --------------------------------------------

  it('should decorate Fastify instance with hookly', () => {
    expect(serve.hookly).toBeDefined();
    expect(typeof serve.hookly.callHook).toBe('function');
  });

  it('should decorate Fastify request with hookly', async () => {
    const res = await serve.inject({ method: 'GET', url: '/test-request' });
    expect(res.statusCode).toBe(200);
  });

  // --------------------------------------------
  // Hooks
  // --------------------------------------------

  it('should call before and after hooks correctly', async () => {
    const hookName = 'test:hook';
    serve.hookly.hook(hookName, (msg: string) => `hooked-${msg}`);

    const result = await serve.hookly.callHook(hookName, 'message');

    expect(result).toEqual('hooked-message');
    expect(beforeSpied).toHaveBeenCalled();
    expect(afterSpied).toHaveBeenCalled();
  });

  // --------------------------------------------
  // close callback
  // --------------------------------------------

  it('should call close hook on server shutdown', async () => {
    const closeSpied = vi.fn();

    // Create a new instance for testing close independently
    const fastifyClose = await setupServe({ close: closeSpied });
    await fastifyClose.close(); // triggers onClose
    expect(closeSpied).toHaveBeenCalled();
  });

  // --------------------------------------------
  // debuggerOptions branch (indirectly tested via registration)
  // --------------------------------------------

  it('should cover all valid and invalid debuggerOptions paths using auxiliary function', async () => {
    // valid paths
    await withDebuggerOptions({ filter: () => true }); // filter: (event: string) => boolean
    await withDebuggerOptions({}); // {} empty object

    // invalid paths
    await withDebuggerOptions('not an object' as any); // typeof value !== 'object'
    await withDebuggerOptions(null as any); // value === null
    await withDebuggerOptions({ tag: 123 } as any); // tag: number
    await withDebuggerOptions({ inspect: 'yes' } as any); // inspect: string
    await withDebuggerOptions({ group: 'no' } as any); // group: string
    await withDebuggerOptions({ filter: 123 } as any); // filter: invalid type
  });
});
