import { Injectable } from "@nestjs/common";
// pdf-parse has no default export types set up for ESM interop cleanly —
// require() keeps this from breaking under ts-node/CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

@Injectable()
export class PdfParserService {
  async extractText(buffer: Buffer): Promise<string> {
    const result = await pdfParse(buffer);
    return result.text;
  }
}
