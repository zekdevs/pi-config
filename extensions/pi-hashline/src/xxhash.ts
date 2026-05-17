const PRIME1 = 2654435761 >>> 0;
const PRIME2 = 2246822519 >>> 0;
const PRIME3 = 3266489917 >>> 0;
const PRIME4 = 668265263 >>> 0;
const PRIME5 = 374761393 >>> 0;

const encoder = new TextEncoder();

function imul(a: number, b: number): number {
	return Math.imul(a, b) >>> 0;
}

function rotl(x: number, r: number): number {
	return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function readU32LE(b: Uint8Array, i: number): number {
	return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

export function xxHash32String(s: string, seed: number): number {
	return xxHash32(encoder.encode(s), seed >>> 0);
}

export function xxHash32(input: Uint8Array, seed: number): number {
	const len = input.length;
	let h32: number;
	let i = 0;

	if (len >= 16) {
		const limit = len - 16;
		let v1 = (seed + PRIME1 + PRIME2) >>> 0;
		let v2 = (seed + PRIME2) >>> 0;
		let v3 = seed >>> 0;
		let v4 = (seed - PRIME1) >>> 0;
		do {
			v1 = imul(rotl((v1 + imul(readU32LE(input, i), PRIME2)) >>> 0, 13), PRIME1);
			i += 4;
			v2 = imul(rotl((v2 + imul(readU32LE(input, i), PRIME2)) >>> 0, 13), PRIME1);
			i += 4;
			v3 = imul(rotl((v3 + imul(readU32LE(input, i), PRIME2)) >>> 0, 13), PRIME1);
			i += 4;
			v4 = imul(rotl((v4 + imul(readU32LE(input, i), PRIME2)) >>> 0, 13), PRIME1);
			i += 4;
		} while (i <= limit);
		h32 = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
	} else {
		h32 = (seed + PRIME5) >>> 0;
	}

	h32 = (h32 + len) >>> 0;

	while (i + 4 <= len) {
		h32 = (h32 + imul(readU32LE(input, i), PRIME3)) >>> 0;
		h32 = imul(rotl(h32, 17), PRIME4);
		i += 4;
	}
	while (i < len) {
		h32 = (h32 + imul(input[i], PRIME5)) >>> 0;
		h32 = imul(rotl(h32, 11), PRIME1);
		i += 1;
	}

	h32 = imul(h32 ^ (h32 >>> 15), PRIME2);
	h32 = imul(h32 ^ (h32 >>> 13), PRIME3);
	h32 = (h32 ^ (h32 >>> 16)) >>> 0;
	return h32;
}
