export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

// A promise with its settlers handed out. The web project's ES2023 library excludes
// `Promise.withResolvers`, and the server and web code share this module, so it is built by hand once.
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}
