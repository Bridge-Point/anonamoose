import { v4 as uuidv4 } from 'uuid';

export class Tokenizer {
  private readonly prefix = '\uE000';
  private readonly suffix = '\uE001';

  generatePlaceholder(): string {
    const id = uuidv4().substring(0, 8);
    return `${this.prefix}${id}${this.suffix}`;
  }

  tokenize(text: string, tokenMap: Map<string, string>): string {
    let result = text;

    for (const [placeholder, original] of tokenMap) {
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      result = result.replace(regex, placeholder);
    }

    return result;
  }

  extractToken(text: string): string | null {
    const escapedPrefix = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedSuffix = this.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escapedPrefix}(.*?)${escapedSuffix}`));
    return match ? match[1] : null;
  }
}
