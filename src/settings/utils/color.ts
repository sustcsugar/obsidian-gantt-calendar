/**
 * RGB to Hex converter
 * @param rgb - RGB color string (e.g., "rgb(255, 0, 0)") or hex string
 * @returns Hex color string (e.g., "#ff0000")
 */
export function rgbToHex(rgb: string): string {
	if (rgb.startsWith('#')) return rgb;
	const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
	if (!match) return rgb;
	const hex = (x: string) => parseInt(x).toString(16).padStart(2, '0');
	return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}
