# @zahoor/fastify-hookable

[![NPM version](https://img.shields.io/npm/v/@zahoor/fastify-hookable?style=for-the-badge)](https://www.npmjs.com/package/@zahoor/fastify-hookable)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Coverage Status](https://img.shields.io/badge/coverage-100%25-brightgreen?style=for-the-badge)]()

> **The current version does not work; DO NOT USE.**

A plugin for [Fastify](http://fastify.dev/) that integrates [`hookable`](https://github.com/unjs/hookable), providing **lifecycle hooks**, **per-request hook contexts**, and **optional debugger integration** for inspecting hook calls.

## Features

- Decorates both **Fastify instance** and **Fastify requests** with a `hookable` object.
- Supports `beforeEach` and `afterEach` hooks for introspection.
- Automatically cleans up all hooks on server shutdown.
- Optional integration with [`createDebugger`](https://github.com/unjs/hookable) for detailed console output.
- Fully type-safe with **TypeScript declaration merging** support for custom hooks.

## Install

```sh
npm i @zahoor/fastify-hookable
```

> Note: `hookable` is a peer dependency.

### Compatibility

| Plugin version | Fastify version | Hookable version |
| -------------- | --------------- | ---------------- |
| `current`      | `^5.x`          | `^5.x`           |

## Usage

```ts
import fastify from 'fastify';
import hookable from '@zahoor/fastify-hookable';

const serve = fastify();

serve.register(hookable, {
  before: event => console.log('Before hook:', event.name),
  after: event => console.log('After hook:', event.name),
  debuggerOptions: { tag: 'my-plugin', inspect: true }
});

serve.get('/ping', async request => {
  // Access per-request hookable
  request.hookable.callHook('ping');
  return { ok: true };
});

await serve.listen({ port: 3000 });
```

## TypeScript Support

You can extend the `Hooks` interface via declaration merging to define your own hook names and callback signatures:

```ts
declare module '@zahoor/fastify-hookable' {
  interface Hooks {
    myCustomHook: { foo: string };
  }
}
```

This allows type-safe calls to your custom hooks:

```ts
serve.hookable.callHook('myCustomHook', { foo: 'bar' });
```

## Options

- `close`: Called when the `Fastify` server is closing.
- `before`: Called **before** every hook execution.
- `after`: Called **after** every hook execution
- `debuggerOptions`: An optional `Object` to modify the debugger configuration.
  - `tag`: An optional tag to prefix console logs with.
  - `inspect`: Show hook params to the console output.
  - `group`: Use group/groupEnd wrapper around logs happening during a specific hook.
  - `filter`: Filter which hooks to enable debugger for. Can be a string prefix or fn.

## License

Licensed under [MIT](./LICENSE).
