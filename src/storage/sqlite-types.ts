export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement<TResult = unknown> {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): TResult | undefined;
  all(...params: unknown[]): TResult[];
}

export interface SqliteDatabase {
  name: string;
  open: boolean;
  prepare<TResult = unknown>(source: string): SqliteStatement<TResult>;
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult;
  exec(source: string): this;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  close(): this;
}

export interface SqliteDatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
}

export type SqliteDatabaseConstructor = new (
  filename?: string | Buffer,
  options?: SqliteDatabaseOptions,
) => SqliteDatabase;
