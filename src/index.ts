import fp from 'fastify-plugin';
import { createDebugger, createHooks, Hookable } from 'hookable';

import type { FastifyPluginCallback } from 'fastify';
import type { CreateDebuggerOptions } from 'hookable';

// -------------------------------------------------------------------------------------------------
// Internal Utilities
// -------------------------------------------------------------------------------------------------

// The following types are extracted from `Hookable`, abandoning Lint check
/* oxlint-disable */

// type InferCallback<HT, HN extends keyof HT> = HT[HN] extends HookCallback ? HT[HN] : never;
/**
 * Infers a "spy event" structure from the given hook map.
 * Each hook key produces a corresponding event definition
 * containing its name, parameters, and execution context.
 *
 * @template HT - The hook map record (hook name → callback signature).
 * @internal Copied from [`hookable`](https://github.com/unjs/hookable)
 */
type InferSpyEvent<HT extends Record<string, any>> = {
  [key in keyof HT]: {
    name: key;
    args: Parameters<HT[key]>;
    context: Record<string, any>;
  };
}[keyof HT];

/* oxlint-enable */

export { Hookable, createDebugger, createHooks };

// -------------------------------------------------------------------------------------------------
// Type Definitions
// -------------------------------------------------------------------------------------------------

/**
 * A generic hooks map definition used for Fastify integration.
 * Each property key represents a hook name mapped to its callback type.
 *
 * This interface is **extensible** via
 * [TypeScript declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html)
 * allowing user code to add custom hook definitions.
 *
 * For example, in any `.d.ts` or `.ts` file:
 * ```ts
 * declare module '@zahoor/fastify-hookable' {
 *   interface Hooks {
 *     foo: string;
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line no-explicit-any
export interface Hooks extends Record<string, any> {}

/**
 * Configuration options for the `fastifyHookable` plugin.
 *
 * @template HooksT - The type of hooks managed by the hookable instance.
 */
export interface FastifyHookableOptions<HooksT extends Hooks = Hooks> {
  /**
   * Called when the `Fastify` server is closing.
   * Can perform cleanup or teardown logic before all hooks are removed.
   */
  close?: () => void | Promise<void>;

  /**
   * Invoked before every hook execution.
   * Useful for debugging, logging, or instrumentation.
   */
  before?: (event: InferSpyEvent<HooksT>) => void;

  /**
   * Invoked after every hook execution.
   * Useful for monitoring or profiling hook execution results.
   */
  after?: (event: InferSpyEvent<HooksT>) => void;

  /**
   * Optional configuration for the `createDebugger` utility.
   * Enables detailed console output for registered hooks.
   */
  debuggerOptions?: CreateDebuggerOptions;
}

/**
 * Internal plugin type signature used by Fastify.
 * @internal
 */
type FastifyHookablePlugin = FastifyPluginCallback<NonNullable<FastifyHookableOptions>>;

// -------------------------------------------------------------------------------------------------
// Runtime Type Guards
// -------------------------------------------------------------------------------------------------

/**
 * Runtime type guard for validating a `CreateDebuggerOptions` object.
 *
 * Ensures all optional properties have correct types, including
 * the `filter` property which can be a string prefix or a function.
 *
 * @param value - The value to check.
 * @returns True if the value matches the `CreateDebuggerOptions` shape.
 * @internal
 */
function isCreateDebuggerOptions(value: unknown): value is CreateDebuggerOptions {
  if (typeof value !== 'object' || value === null) return false;

  const o = value as Record<string, unknown>;

  if ('tag' in o && typeof o.tag !== 'string') return false;
  if ('inspect' in o && typeof o.inspect !== 'boolean') return false;
  if ('group' in o && typeof o.group !== 'boolean') return false;

  if ('filter' in o) {
    const isString = typeof o.filter === 'string';
    const isFunction = typeof o.filter === 'function' && o.filter.length <= 1;
    if (!isString && !isFunction) return false;
  }

  return true;
}

// -------------------------------------------------------------------------------------------------
// Fastify Plugin Implementation
// -------------------------------------------------------------------------------------------------

/**
 * A Fastify plugin that integrates [`hookable`](https://github.com/unjs/hookable)
 * into Fastify's request and server lifecycle.
 *
 * It allows attaching lifecycle hooks, global or per-request hook contexts,
 * and optional debugger integration for inspecting hook calls.
 *
 * ### Features
 * - Provides a `hookable` instance on both Fastify and Request scopes.
 * - Supports `beforeEach` and `afterEach` spy hooks for introspection.
 * - Automatically removes hooks on server close.
 * - Optional `createDebugger` integration.
 */
const plugin: FastifyHookablePlugin = (fastify, opts, done) => {
  const hookable = createHooks<Hooks>();

  // Optional debugger instance, only created if debuggerOptions is valid
  let debuggered: ReturnType<typeof createDebugger> | undefined;

  // Attach hookable instance to Fastify and Request scopes
  fastify.decorate('hookable', { getter: () => hookable });
  fastify.decorateRequest('hookable', { getter: () => hookable });

  // Register before/after spy hooks
  if (typeof opts.before === 'function') {
    hookable.beforeEach(opts.before);
  }

  if (typeof opts.after === 'function') {
    hookable.afterEach(opts.after);
  }

  // Optionally enable debugger if configuration is valid
  if (isCreateDebuggerOptions(opts.debuggerOptions)) {
    debuggered = createDebugger(hookable, opts.debuggerOptions);
  }

  // Clean up all hooks on Fastify shutdown
  fastify.addHook('onClose', async () => {
    try {
      await opts.close?.();
    } finally {
      // Ensure hooks are removed and debugger is closed even if `close` callback throws
      debuggered?.close();
      hookable.removeAllHooks();
    }
  });

  done();
};

/**
 * The Fastify plugin that integrates the [`hookable`](https://github.com/unjs/hookable) system.
 *
 * It decorates both `FastifyInstance` and `FastifyRequest` with a `hookable` instance,
 * allowing lifecycle event hooks and optional debugging utilities.
 */
export const fastifyHookable = fp(plugin, {
  fastify: '5.x',
  name: '@zahoor/fastify-hookable'
});

export default fastifyHookable;

// -------------------------------------------------------------------------------------------------
// Fastify Type Augmentation
// -------------------------------------------------------------------------------------------------

/**
 * Extends the built-in Fastify type definitions to include
 * a `hookable` instance on both `FastifyInstance` and `FastifyRequest`.
 *
 * This provides type-safe access to the shared `hookable` object
 * throughout your Fastify application — allowing plugins,
 * routes, and requests to register, call, and observe custom hooks.
 *
 * For example:
 * ```ts
 * await fastify.hookable.callHook('myHook', { foo: 123 });
 *
 * fastify.addHook('onRequest', async (req) => {
 *   await req.hookable.callHook('myHook', req);
 * });
 * ```
 *
 * The `hookable` instance type is derived from the global {@link Hooks} interface,
 * which you can **extend via TypeScript declaration merging**
 * to define your own hook names and callback signatures.
 */
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * A global `hookable` instance shared across the Fastify server.
     * Used to register, trigger, and inspect custom hooks.
     */
    hookable: Hookable<Hooks>;
  }

  interface FastifyRequest {
    /**
     * A per-request reference to the same `hookable` instance,
     * allowing hooks to be called or observed within route handlers.
     */
    hookable: Hookable<Hooks>;
  }
}
