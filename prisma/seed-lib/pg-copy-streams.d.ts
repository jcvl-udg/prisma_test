declare module 'pg-copy-streams' {
  import type { Writable } from 'node:stream';
  import type { Connection } from 'pg';

  export interface CopyStream extends Writable {
    submit(connection: Connection): void;
  }

  export function from(queryText: string): CopyStream;
}
