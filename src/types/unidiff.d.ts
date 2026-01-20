declare module 'unidiff' {
  export function diffAsText(
    oldText: string,
    newText: string,
    options?: {
      aname?: string;
      bname?: string;
      context?: number;
    }
  ): string;

  export function diffLines(
    oldText: string,
    newText: string
  ): Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
  }>;

  export function formatLines(
    diff: Array<{
      value: string;
      added?: boolean;
      removed?: boolean;
    }>,
    options?: {
      aname?: string;
      bname?: string;
      context?: number;
    }
  ): string;
}
