import fastify from 'fastify';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { fastifyHookable } from '../src/index';

import type { FastifyInstance } from 'fastify';

import type { FastifyHookableOptions } from '../src/index';

async function setupServe(options: Partial<FastifyHookableOptions> = {}, handlePreReady?: (instance: FastifyInstance) => void | Promise<void>): Promise<FastifyInstance> {
  const instance = fastify();
  await instance.register(fastifyHookable, options as any);
  await handlePreReady?.(instance);
  await instance.ready();
  return instance;
}

async function withDebuggerOptions(debuggerOptions: Partial<FastifyHookableOptions['debuggerOptions']>): Promise<void> {
  let instance: FastifyInstance | undefined;
  try {
    instance = await setupServe({ debuggerOptions });
  } finally {
    await instance?.close();
    instance = undefined;
  }
}

describe('@zahoor/fastify-hookable', () => {
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
          expect(request.hookable).toBeDefined();
          expect(typeof request.hookable.callHook).toBe('function');
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

  it('should decorate Fastify instance with hookable', () => {
    expect(serve.hookable).toBeDefined();
    expect(typeof serve.hookable.callHook).toBe('function');
  });

  it('should decorate Fastify request with hookable', async () => {
    const res = await serve.inject({ method: 'GET', url: '/test-request' });
    expect(res.statusCode).toBe(200);
  });

  // --------------------------------------------
  // Hooks
  // --------------------------------------------

  it('should call before and after hooks correctly', async () => {
    const hookName = 'test:hook';
    serve.hookable.hook(hookName, (msg: string) => `hooked-${msg}`);

    const result = await serve.hookable.callHook(hookName, 'message');

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
