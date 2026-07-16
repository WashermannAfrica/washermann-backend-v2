/**
 * Initial catalogue, transcribed from "Washermann Laundry Item Catalog.pdf".
 *
 * `everyday` is a per-category default for the Wash & Fold bag system; admins can
 * override per item afterwards. Items carry no price here — prices are derived
 * later by the P70 engine.
 */
export interface SeedCategory {
  name: string;
  everyday: boolean;
  items: string[];
}

export const CATALOGUE_SEED: SeedCategory[] = [
  { name: 'Tops', everyday: true,
    items: ['T-Shirts', 'Polo Shirts', 'Tank Tops', 'Dress Shirts', 'Blouses', 'Tunics', 'Bodysuits'] },
  { name: 'Bottoms', everyday: true,
    items: ['Shorts', 'Jeans', 'Chinos', 'Joggers', 'Trousers', 'Skirts', 'Leggings'] },
  { name: 'Full Body Garments', everyday: false,
    items: ['Dresses', 'Gowns', 'Jumpsuits', 'Rompers', 'Suits', 'Agbada', 'Kaftan'] },
  { name: 'Outerwear', everyday: false,
    items: ['Hoodies', 'Sweaters', 'Blazers', 'Jackets', 'Coats'] },
  { name: 'Underwear & Sleepwear', everyday: true,
    items: ['Boxers', 'Briefs', 'Bras', 'Panties', 'Pajamas', 'Robes'] },
  { name: 'Sportswear', everyday: true,
    items: ['Jerseys', 'Tracksuits', 'Gym Wear', 'Swimwear'] },
  { name: "Children's Clothing", everyday: true,
    items: ['Onesies', 'School Uniforms', "Children's Garments"] },
  { name: 'Uniforms', everyday: false,
    items: ['Medical Scrubs', 'Chef Uniforms', 'Security Uniforms', 'Coveralls'] },
  { name: 'Traditional Wear', everyday: false,
    items: ['Agbada', 'Senator', 'Buba', 'Iro', 'Jalabiya', 'Abaya', 'Gele'] },
  { name: 'Bedding', everyday: false,
    items: ['Bedsheets', 'Pillow Cases', 'Duvets', 'Blankets', 'Comforters'] },
  { name: 'Bathroom Linen', everyday: false,
    items: ['Bath Towels', 'Hand Towels', 'Bath Mats'] },
  { name: 'Household Fabrics', everyday: false,
    items: ['Curtains', 'Sofa Covers', 'Cushion Covers', 'Table Cloths'] },
  { name: 'Accessories', everyday: false,
    items: ['Ties', 'Scarves', 'Handkerchiefs', 'Shawls'] },
  { name: 'Footwear', everyday: false,
    items: ['Sneakers', 'Leather Shoes', 'Boots', 'Sandals'] },
  { name: 'Bags', everyday: false,
    items: ['Backpacks', 'Handbags', 'Travel Bags', 'Laptop Bags'] },
  { name: 'Specialty Items', everyday: false,
    items: ['Wedding Gowns', 'Costumes', 'Luxury Garments'] },
  { name: 'Industrial Workwear', everyday: false,
    items: ['Safety Vests', 'Protective Clothing', 'Reflective Jackets'] },
  { name: 'Miscellaneous', everyday: false,
    items: ['Aprons', 'Kitchen Cloths', 'Car Seat Covers'] },
];

/** URL/slug-safe identifier from arbitrary text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
