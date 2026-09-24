import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import satori, { type Font } from 'satori';
import { html as toReactNode } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';

/**
 * Low-level receipt renderer: HTML (inline styles, flexbox only) → SVG (satori) →
 * PNG (resvg). Fonts and the brand wordmark are loaded once at boot.
 *
 * satori supports only a subset of CSS — flexbox layout, no CSS grid, no pseudo-
 * elements, no class selectors. Templates must therefore use inline `style` on every
 * element (see receipt-templates.ts).
 */
@Injectable()
export class ReceiptRenderService implements OnModuleInit {
  private readonly logger = new Logger(ReceiptRenderService.name);
  private fonts: Font[] = [];
  private wordmarkDataUri = '';

  /** Public brand wordmark (white) as a data URI, for embedding in templates. */
  get wordmark(): string {
    return this.wordmarkDataUri;
  }

  onModuleInit() {
    // Resolve assets relative to this file so it works from src (ts-node) and dist.
    // nest-cli.json copies the `assets` folder into dist on build.
    const dir = join(__dirname, 'assets');
    const font = (f: string) => readFileSync(join(dir, 'fonts', f));

    // satori cannot parse variable fonts — use static DM Sans weights.
    this.fonts = [
      { name: 'DM Sans', data: font('DMSans-Regular.ttf'),  weight: 400, style: 'normal' },
      { name: 'DM Sans', data: font('DMSans-Medium.ttf'),   weight: 500, style: 'normal' },
      { name: 'DM Sans', data: font('DMSans-SemiBold.ttf'), weight: 600, style: 'normal' },
      { name: 'DM Sans', data: font('DMSans-Bold.ttf'),     weight: 700, style: 'normal' },
      { name: 'DM Sans', data: font('DMSans-ExtraBold.ttf'),weight: 800, style: 'normal' },
      { name: 'DM Mono', data: font('DMMono-Regular.ttf'),  weight: 400, style: 'normal' },
      { name: 'DM Mono', data: font('DMMono-Medium.ttf'),   weight: 500, style: 'normal' },
      // Fallback for glyphs DM Sans/Mono lack — notably the Naira sign (₦).
      { name: 'Noto Sans', data: font('NotoSans-Regular.ttf'), weight: 400, style: 'normal' },
      { name: 'Noto Sans', data: font('NotoSans-Bold.ttf'),    weight: 700, style: 'normal' },
    ];

    const logo = readFileSync(join(dir, 'wordmark-white.png'));
    this.wordmarkDataUri = `data:image/png;base64,${logo.toString('base64')}`;
    this.logger.log('Receipt renderer ready (fonts + wordmark loaded)');
  }

  /** Render an inline-styled HTML string to a PNG buffer at a fixed pixel width. */
  async renderPng(htmlString: string, width = 1080): Promise<Buffer> {
    const svg = await satori(toReactNode(htmlString) as any, {
      width,
      fonts: this.fonts,
    });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
  }
}
