declare module 'jsr:*';

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
  function resolveDns(query: string, recordType: 'A' | 'AAAA'): Promise<string[]>;
}
