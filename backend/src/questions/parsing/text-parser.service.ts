import { Injectable } from "@nestjs/common";

@Injectable()
export class TextParserService {
  // .md/.txt need no library — the buffer already IS the text.
  async extractText(buffer: Buffer): Promise<string> {
    return buffer.toString("utf-8");
  }
}
