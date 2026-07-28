import { Injectable } from "@nestjs/common";
import * as mammoth from "mammoth";

@Injectable()
export class DocxParserService {
  async extractText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
