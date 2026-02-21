declare module 'aho-corasick' {
  interface Match {
    [0]: string; // the matched string
    [1]: number; // start index
    [2]: number; // end index
  }

  export class AhoCorasick {
    constructor(patterns: string[]);
    search(text: string): Match[];
  }
}
