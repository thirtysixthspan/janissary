export type MaybePromise<T> = T | Promise<T>;
export function mapMaybe<T, Result>(value: MaybePromise<T>, map: (item: T) => Result): MaybePromise<Result> {
  return value instanceof Promise ? mapPromise(value, map) : map(value);
}

async function mapPromise<T, Result>(value: Promise<T>, map: (item: T) => Result): Promise<Result> {
  return map(await value);
}
